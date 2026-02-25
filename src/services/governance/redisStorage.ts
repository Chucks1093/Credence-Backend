import Redis from 'ioredis';
import { IProposalStorage, Proposal, ProposalState } from './multisig';

// We need a serialized version of Proposal because Maps and Sets don't
// JSON serialize automatically.
interface SerializedProposal {
  id: string;
  requiredSignatures: number;
  signers: string[]; // Array instead of Set
  signatures: Array<[string, string]>; // Array of entries instead of Map
  slashingVotes: string[]; // Array instead of Set
  payload: any;
  state: ProposalState;
  createdAt: number;
  expiresAt: number;
}

export class RedisProposalStorage implements IProposalStorage {
  private readonly PREFIX = 'governance:proposal:';

  constructor(private redis: Redis) {}

  public async saveProposal(proposal: Proposal): Promise<void> {
    const key = this.getKey(proposal.id);
    const serialized = this.serialize(proposal);
    
    // We add a buffer to the TTL (e.g., 24 hours) after expiration to keep
    // explicit records of expired/rejected/executed proposals around for a bit.
    // If we only wanted it active until expiration, we'd use expiresAt - now.
    const ttlSeconds = Math.floor((proposal.expiresAt - Date.now()) / 1000) + 86400; // +1 day buffer

    await this.redis.set(key, JSON.stringify(serialized), 'EX', Math.max(0, ttlSeconds));
  }

  public async getProposal(id: string): Promise<Proposal | undefined> {
    const key = this.getKey(id);
    const data = await this.redis.get(key);

    if (!data) {
      return undefined;
    }

    const serialized: SerializedProposal = JSON.parse(data);
    return this.deserialize(serialized);
  }

  public async updateProposal(proposal: Proposal): Promise<void> {
    // Overwrite the existing record; Redis EX uses absolute TTL, we could `KEEPTTL` but keeping it simple.
    // get/ttl/set combo or simply re-evaluating TTL.
    const key = this.getKey(proposal.id);
    const ttlSeconds = Math.floor((proposal.expiresAt - Date.now()) / 1000) + 86400; 

    if (ttlSeconds > 0) {
      await this.redis.set(key, JSON.stringify(this.serialize(proposal)), 'EX', ttlSeconds);
    } else {
        // Just cache it with a minimal TTL (e.g. 1 hour) instead of deleting immediately if somehow expired exactly here.
        await this.redis.set(key, JSON.stringify(this.serialize(proposal)), 'EX', 3600);
    }
  }

  private getKey(id: string): string {
    return `${this.PREFIX}${id}`;
  }

  private serialize(proposal: Proposal): SerializedProposal {
    return {
      ...proposal,
      signers: Array.from(proposal.signers),
      signatures: Array.from(proposal.signatures.entries()),
      slashingVotes: Array.from(proposal.slashingVotes),
    };
  }

  private deserialize(serialized: SerializedProposal): Proposal {
    return {
      ...serialized,
      signers: new Set(serialized.signers),
      signatures: new Map(serialized.signatures),
      slashingVotes: new Set(serialized.slashingVotes),
    };
  }
}
