/**
 * @file Unit tests for AttestationRepository.
 *
 * Covers:
 * ─ create: valid params, validation failures (empty fields, weight out of range)
 * ─ findById: found, not found, defensive copy
 * ─ findBySubject: filtering, revoked exclusion, pagination, sort order
 * ─ countBySubject: active only, includeRevoked
 * ─ revoke: success, already revoked, not found
 * ─ helpers: size, clear
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { AttestationRepository } from '../../src/repositories/attestationRepository.js';
import type { Attestation } from '../../src/types/attestation.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function seed(repo: AttestationRepository, count: number, subject = '0xSubject'): Attestation[] {
  const results: Attestation[] = [];
  for (let i = 0; i < count; i++) {
    results.push(
      repo.create({
        subject,
        verifier: `0xVerifier${i}`,
        weight: 50 + i,
        claim: `claim-${i}`,
      }),
    );
  }
  return results;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('AttestationRepository', () => {
  let repo: AttestationRepository;

  beforeEach(() => {
    repo = new AttestationRepository();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // create()
  // ═══════════════════════════════════════════════════════════════════════

  describe('create()', () => {
    it('should create an attestation with valid params', () => {
      const att = repo.create({
        subject: '0xAlice',
        verifier: '0xVerifier',
        weight: 85,
        claim: 'KYC verified',
      });

      expect(att.id).toBeTruthy();
      expect(att.subject).toBe('0xAlice');
      expect(att.verifier).toBe('0xVerifier');
      expect(att.weight).toBe(85);
      expect(att.claim).toBe('KYC verified');
      expect(att.createdAt).toBeTruthy();
      expect(att.revokedAt).toBeNull();
    });

    it('should allow weight of 0', () => {
      const att = repo.create({
        subject: '0xA',
        verifier: '0xV',
        weight: 0,
        claim: 'minimal',
      });
      expect(att.weight).toBe(0);
    });

    it('should allow weight of 100', () => {
      const att = repo.create({
        subject: '0xA',
        verifier: '0xV',
        weight: 100,
        claim: 'max',
      });
      expect(att.weight).toBe(100);
    });

    it('should return a defensive copy', () => {
      const att = repo.create({
        subject: '0xA',
        verifier: '0xV',
        weight: 50,
        claim: 'test',
      });
      att.claim = 'hacked';
      expect(repo.findById(att.id)!.claim).toBe('test');
    });

    // ── Validation ──────────────────────────────────────────────────────

    it('should throw if subject is empty', () => {
      expect(() =>
        repo.create({ subject: '', verifier: '0xV', weight: 50, claim: 'x' }),
      ).toThrow('subject is required');
    });

    it('should throw if subject is whitespace', () => {
      expect(() =>
        repo.create({ subject: '   ', verifier: '0xV', weight: 50, claim: 'x' }),
      ).toThrow('subject is required');
    });

    it('should throw if verifier is empty', () => {
      expect(() =>
        repo.create({ subject: '0xA', verifier: '', weight: 50, claim: 'x' }),
      ).toThrow('verifier is required');
    });

    it('should throw if claim is empty', () => {
      expect(() =>
        repo.create({ subject: '0xA', verifier: '0xV', weight: 50, claim: '' }),
      ).toThrow('claim is required');
    });

    it('should throw if weight is negative', () => {
      expect(() =>
        repo.create({ subject: '0xA', verifier: '0xV', weight: -1, claim: 'x' }),
      ).toThrow('weight must be a number between 0 and 100');
    });

    it('should throw if weight exceeds 100', () => {
      expect(() =>
        repo.create({ subject: '0xA', verifier: '0xV', weight: 101, claim: 'x' }),
      ).toThrow('weight must be a number between 0 and 100');
    });

    it('should throw if weight is NaN', () => {
      expect(() =>
        repo.create({ subject: '0xA', verifier: '0xV', weight: NaN, claim: 'x' }),
      ).toThrow('weight must be a number between 0 and 100');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // findById()
  // ═══════════════════════════════════════════════════════════════════════

  describe('findById()', () => {
    it('should find an attestation by id', () => {
      const att = repo.create({ subject: '0xA', verifier: '0xV', weight: 50, claim: 'x' });
      const found = repo.findById(att.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(att.id);
    });

    it('should return undefined for unknown id', () => {
      expect(repo.findById('nonexistent')).toBeUndefined();
    });

    it('should return a defensive copy', () => {
      const att = repo.create({ subject: '0xA', verifier: '0xV', weight: 50, claim: 'test' });
      const copy = repo.findById(att.id)!;
      copy.claim = 'mutated';
      expect(repo.findById(att.id)!.claim).toBe('test');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // findBySubject()
  // ═══════════════════════════════════════════════════════════════════════

  describe('findBySubject()', () => {
    it('should return attestations for a given subject', () => {
      seed(repo, 3, '0xAlice');
      seed(repo, 2, '0xBob');

      const { attestations, total } = repo.findBySubject('0xAlice');
      expect(attestations).toHaveLength(3);
      expect(total).toBe(3);
      attestations.forEach((a) => expect(a.subject).toBe('0xAlice'));
    });

    it('should return empty for unknown subject', () => {
      const { attestations, total } = repo.findBySubject('0xNobody');
      expect(attestations).toEqual([]);
      expect(total).toBe(0);
    });

    it('should exclude revoked attestations by default', () => {
      const atts = seed(repo, 3, '0xAlice');
      repo.revoke(atts[0].id);

      const { attestations, total } = repo.findBySubject('0xAlice');
      expect(attestations).toHaveLength(2);
      expect(total).toBe(2);
    });

    it('should include revoked attestations when includeRevoked is true', () => {
      const atts = seed(repo, 3, '0xAlice');
      repo.revoke(atts[0].id);

      const { attestations, total } = repo.findBySubject('0xAlice', {
        includeRevoked: true,
      });
      expect(attestations).toHaveLength(3);
      expect(total).toBe(3);

      const revoked = attestations.find((a) => a.id === atts[0].id);
      expect(revoked?.revokedAt).not.toBeNull();
    });

    it('should sort newest first', () => {
      seed(repo, 5, '0xAlice');
      const { attestations } = repo.findBySubject('0xAlice');
      for (let i = 1; i < attestations.length; i++) {
        expect(
          new Date(attestations[i - 1].createdAt).getTime(),
        ).toBeGreaterThanOrEqual(
          new Date(attestations[i].createdAt).getTime(),
        );
      }
    });

    // ── Pagination ──────────────────────────────────────────────────────

    it('should paginate results (page 1)', () => {
      seed(repo, 5, '0xAlice');
      const { attestations, total } = repo.findBySubject('0xAlice', {
        page: 1,
        limit: 2,
      });
      expect(attestations).toHaveLength(2);
      expect(total).toBe(5);
    });

    it('should paginate results (page 2)', () => {
      seed(repo, 5, '0xAlice');
      const { attestations } = repo.findBySubject('0xAlice', {
        page: 2,
        limit: 2,
      });
      expect(attestations).toHaveLength(2);
    });

    it('should paginate results (last page partial)', () => {
      seed(repo, 5, '0xAlice');
      const { attestations } = repo.findBySubject('0xAlice', {
        page: 3,
        limit: 2,
      });
      expect(attestations).toHaveLength(1);
    });

    it('should return empty when page exceeds total pages', () => {
      seed(repo, 3, '0xAlice');
      const { attestations } = repo.findBySubject('0xAlice', {
        page: 10,
        limit: 2,
      });
      expect(attestations).toHaveLength(0);
    });

    it('should clamp limit to 100', () => {
      seed(repo, 5, '0xAlice');
      const { attestations } = repo.findBySubject('0xAlice', {
        limit: 999,
      });
      expect(attestations).toHaveLength(5); // only 5 exist
    });

    it('should clamp limit minimum to 1', () => {
      seed(repo, 3, '0xAlice');
      const { attestations } = repo.findBySubject('0xAlice', {
        limit: 0,
      });
      expect(attestations).toHaveLength(1); // limit clamped to 1
    });

    it('should clamp page minimum to 1', () => {
      seed(repo, 3, '0xAlice');
      const { attestations } = repo.findBySubject('0xAlice', {
        page: -5,
      });
      expect(attestations).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // countBySubject()
  // ═══════════════════════════════════════════════════════════════════════

  describe('countBySubject()', () => {
    it('should count active attestations only by default', () => {
      const atts = seed(repo, 4, '0xAlice');
      repo.revoke(atts[0].id);

      expect(repo.countBySubject('0xAlice')).toBe(3);
    });

    it('should count all attestations when includeRevoked is true', () => {
      const atts = seed(repo, 4, '0xAlice');
      repo.revoke(atts[0].id);

      expect(repo.countBySubject('0xAlice', true)).toBe(4);
    });

    it('should return 0 for unknown subject', () => {
      expect(repo.countBySubject('0xNobody')).toBe(0);
    });

    it('should not count attestations for other subjects', () => {
      seed(repo, 3, '0xAlice');
      seed(repo, 2, '0xBob');

      expect(repo.countBySubject('0xAlice')).toBe(3);
      expect(repo.countBySubject('0xBob')).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // revoke()
  // ═══════════════════════════════════════════════════════════════════════

  describe('revoke()', () => {
    it('should set revokedAt on a valid attestation', () => {
      const att = repo.create({ subject: '0xA', verifier: '0xV', weight: 50, claim: 'x' });
      const revoked = repo.revoke(att.id);
      expect(revoked).toBeDefined();
      expect(revoked!.revokedAt).not.toBeNull();
    });

    it('should return undefined for unknown id', () => {
      expect(repo.revoke('nope')).toBeUndefined();
    });

    it('should throw if already revoked', () => {
      const att = repo.create({ subject: '0xA', verifier: '0xV', weight: 50, claim: 'x' });
      repo.revoke(att.id);
      expect(() => repo.revoke(att.id)).toThrow('already revoked');
    });

    it('should return a defensive copy', () => {
      const att = repo.create({ subject: '0xA', verifier: '0xV', weight: 50, claim: 'test' });
      const revoked = repo.revoke(att.id)!;
      revoked.claim = 'mutated';
      expect(repo.findById(att.id)!.claim).toBe('test');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // size / clear
  // ═══════════════════════════════════════════════════════════════════════

  describe('size / clear()', () => {
    it('should report correct size', () => {
      expect(repo.size).toBe(0);
      seed(repo, 3);
      expect(repo.size).toBe(3);
    });

    it('should clear all attestations', () => {
      seed(repo, 5);
      repo.clear();
      expect(repo.size).toBe(0);
    });
  });
});
