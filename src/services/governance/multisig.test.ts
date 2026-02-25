import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MultiSigCoordinationService, ProposalState } from './multisig';
import { InMemoryProposalStorage } from './inMemoryStorage';

describe('MultiSigCoordinationService (Async)', () => {
  let service: MultiSigCoordinationService;
  let storage: InMemoryProposalStorage;

  beforeEach(() => {
    storage = new InMemoryProposalStorage();
    service = new MultiSigCoordinationService(storage);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a proposal successfully', async () => {
    const callback = vi.fn();
    service.on('proposalCreated', callback);

    await service.createProposal('prop1', 2, ['alice', 'bob', 'charlie'], { action: 'transfer' }, 60);

    const proposal = await service.getProposal('prop1');
    expect(proposal).toBeDefined();
    expect(proposal?.id).toBe('prop1');
    expect(proposal?.requiredSignatures).toBe(2);
    expect(proposal?.state).toBe(ProposalState.PENDING);
    expect(callback).toHaveBeenCalledWith(proposal);
  });

  it('should throw when creating a proposal with duplicate ID', async () => {
    await service.createProposal('prop1', 1, ['alice'], {}, 60);
    await expect(service.createProposal('prop1', 1, ['alice'], {}, 60))
      .rejects.toThrow('Proposal with ID prop1 already exists');
  });

  it('should throw when required signatures exceed signers', async () => {
    await expect(service.createProposal('prop1', 3, ['alice', 'bob'], {}, 60))
      .rejects.toThrow('Required signatures cannot exceed total number of signers');
  });

  it('should return undefined for non-existent proposal', async () => {
    const prop = await service.getProposal('nonexistent');
    expect(prop).toBeUndefined();
  });

  it('should collect signatures and transition to APPROVED when threshold met', async () => {
    const sigCallback = vi.fn();
    const appCallback = vi.fn();
    service.on('signatureSubmitted', sigCallback);
    service.on('proposalApproved', appCallback);

    await service.createProposal('prop1', 2, ['alice', 'bob', 'charlie'], {}, 60);

    // First signature
    const isApproved1 = await service.submitSignature('prop1', 'alice', 'sig-alice');
    expect(isApproved1).toBe(false);
    expect(sigCallback).toHaveBeenCalledWith({ id: 'prop1', signer: 'alice', signature: 'sig-alice' });
    expect(appCallback).not.toHaveBeenCalled();
    const propAfterFirst = await service.getProposal('prop1');
    expect(propAfterFirst?.state).toBe(ProposalState.PENDING);

    // Second signature (threshold met)
    const isApproved2 = await service.submitSignature('prop1', 'bob', 'sig-bob');
    expect(isApproved2).toBe(true);
    expect(sigCallback).toHaveBeenCalledWith({ id: 'prop1', signer: 'bob', signature: 'sig-bob' });
    expect(appCallback).toHaveBeenCalled();
    const propAfterSecond = await service.getProposal('prop1');
    expect(propAfterSecond?.state).toBe(ProposalState.APPROVED);
  });

  it('should throw when signing non-existent proposal', async () => {
    await expect(service.submitSignature('prop1', 'alice', 'sig'))
      .rejects.toThrow('Proposal prop1 not found');
  });

  it('should throw when unauthorized signer attempts to sign', async () => {
    await service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    await expect(service.submitSignature('prop1', 'charlie', 'sig'))
      .rejects.toThrow('Signer charlie is not authorized for proposal prop1');
  });

  it('should throw when signer signs twice', async () => {
    await service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    await service.submitSignature('prop1', 'alice', 'sig1');
    await expect(service.submitSignature('prop1', 'alice', 'sig2'))
      .rejects.toThrow('Signer alice has already signed proposal prop1');
  });

  it('should throw when signing non-PENDING proposal', async () => {
    await service.createProposal('prop1', 1, ['alice'], {}, 60);
    await service.submitSignature('prop1', 'alice', 'sig'); // transitions to APPROVED
    
    // Add charlie manually to signers to test the state check
    const prop = (await service.getProposal('prop1'))!;
    prop.signers.add('charlie');
    await storage.updateProposal(prop);

    await expect(service.submitSignature('prop1', 'charlie', 'sig'))
      .rejects.toThrow('Cannot sign proposal in state APPROVED');
  });

  it('should handle timeout correctly on signature submission', async () => {
    const callback = vi.fn();
    service.on('proposalRejected', callback);

    await service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);

    // Advance time by 61 minutes
    vi.advanceTimersByTime(61 * 60 * 1000);

    await expect(service.submitSignature('prop1', 'alice', 'sig'))
      .rejects.toThrow('Proposal prop1 has expired');

    const prop = await service.getProposal('prop1');
    expect(prop?.state).toBe(ProposalState.REJECTED);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'prop1', reason: 'Expired' }));
  });

  it('should execute an approved proposal', async () => {
    const callback = vi.fn();
    service.on('proposalExecuted', callback);

    await service.createProposal('prop1', 1, ['alice'], { data: 'test payload' }, 60);
    await service.submitSignature('prop1', 'alice', 'sig');

    const payload = await service.executeProposal('prop1');
    expect(payload).toEqual({ data: 'test payload' });

    const prop = await service.getProposal('prop1');
    expect(prop?.state).toBe(ProposalState.EXECUTED);
    expect(callback).toHaveBeenCalledWith(prop);
  });

  it('should throw when executing unapproved proposal', async () => {
    await service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    await service.submitSignature('prop1', 'alice', 'sig');

    await expect(service.executeProposal('prop1'))
      .rejects.toThrow('Cannot execute proposal in state PENDING');
  });

  it('should throw when executing non-existent proposal', async () => {
    await expect(service.executeProposal('prop1'))
      .rejects.toThrow('Proposal prop1 not found');
  });

  it('should record slashing votes', async () => {
    const callback = vi.fn();
    service.on('slashingVoteAdded', callback);

    await service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    await service.addSlashingVote('prop1', 'charlie');

    const prop = await service.getProposal('prop1');
    expect(prop?.slashingVotes.has('charlie')).toBe(true);
    expect(callback).toHaveBeenCalledWith({ id: 'prop1', voter: 'charlie' });
  });

  it('should throw on duplicate slashing vote', async () => {
    await service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    await service.addSlashingVote('prop1', 'charlie');
    await expect(service.addSlashingVote('prop1', 'charlie'))
      .rejects.toThrow('Voter charlie has already submitted a slashing vote');
  });

  it('should throw when adding slashing vote to expired proposal', async () => {
    await service.createProposal('prop1', 1, ['alice'], {}, 60);
    vi.advanceTimersByTime(61 * 60 * 1000);

    await expect(service.addSlashingVote('prop1', 'charlie'))
      .rejects.toThrow('Proposal prop1 has expired');
  });
  
  it('should reject a proposal explicitly', async () => {
    const callback = vi.fn();
    service.on('proposalRejected', callback);

    await service.createProposal('prop1', 2, ['alice', 'bob'], {}, 60);
    await service.rejectProposal('prop1', 'Malicious payload');

    const prop = await service.getProposal('prop1');
    expect(prop?.state).toBe(ProposalState.REJECTED);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'prop1', reason: 'Malicious payload' }));
  });
  
  it('should reject an approved proposal before execution', async () => {
    await service.createProposal('prop1', 1, ['alice'], {}, 60);
    await service.submitSignature('prop1', 'alice', 'sig');
    await service.rejectProposal('prop1', 'Found a bug');
    const prop = await service.getProposal('prop1');
    expect(prop?.state).toBe(ProposalState.REJECTED);
  });

  it('should throw when explicitly rejecting an already executed proposal', async () => {
    await service.createProposal('prop1', 1, ['alice'], {}, 60);
    await service.submitSignature('prop1', 'alice', 'sig');
    await service.executeProposal('prop1');

    await expect(service.rejectProposal('prop1', 'Too late'))
      .rejects.toThrow('Cannot reject proposal in state EXECUTED');
  });
});
