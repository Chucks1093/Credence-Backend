import { IProposalStorage, Proposal } from './multisig';

/**
 * An in-memory implementation of IProposalStorage suitable for testing.
 */
export class InMemoryProposalStorage implements IProposalStorage {
  private proposals: Map<string, Proposal> = new Map();

  public async saveProposal(proposal: Proposal): Promise<void> {
    this.proposals.set(proposal.id, proposal);
  }

  public async getProposal(id: string): Promise<Proposal | undefined> {
    return this.proposals.get(id);
  }

  public async updateProposal(proposal: Proposal): Promise<void> {
    this.proposals.set(proposal.id, proposal);
  }
}
