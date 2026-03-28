/**
 * Concurrency tests for BondsRepository.debit()
 *
 * These tests require a real PostgreSQL instance.  Run with:
 *   TEST_DATABASE_URL=postgres://... node --test tests/integration/bondDebitConcurrency.test.ts
 * or let the test harness spin up a Testcontainer automatically.
 *
 * They verify that parallel debit calls against the same bond:
 *   1. Never produce a negative balance.
 *   2. Apply every successful debit exactly once (no lost updates).
 *   3. Reject debits that exceed the available balance with InsufficientFundsError.
 */

import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import {
  BondsRepository,
  IdentitiesRepository,
  InsufficientFundsError,
} from '../../src/db/repositories/index.js'
import { createSchema, dropSchema, resetDatabase } from '../../src/db/schema.js'
import { createTestDatabase, type TestDatabase } from './testDatabase.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function insertIdentity(
  repo: IdentitiesRepository,
  address: string
): Promise<void> {
  await repo.create({ address })
}

async function insertBond(
  repo: BondsRepository,
  identityAddress: string,
  amount: string
): Promise<number> {
  const bond = await repo.create({
    identityAddress,
    amount,
    startTime: new Date('2025-01-01T00:00:00.000Z'),
    durationDays: 30,
  })
  return bond.id
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('BondsRepository.debit() – concurrency', () => {
  let database: TestDatabase
  let identitiesRepo: IdentitiesRepository
  let bondsRepo: BondsRepository

  before(async () => {
    database = await createTestDatabase()
    await createSchema(database.pool)

    identitiesRepo = new IdentitiesRepository(database.pool)
    // Pass pool as second arg so debit() can manage its own transaction.
    bondsRepo = new BondsRepository(database.pool, database.pool)
  })

  beforeEach(async () => {
    await resetDatabase(database.pool)
  })

  after(async () => {
    await dropSchema(database.pool)
    await database.close()
  })

  // -------------------------------------------------------------------------

  it('serialises parallel debits – balance never goes negative', async () => {
    await insertIdentity(identitiesRepo, 'GCONCURRENT_1')
    const bondId = await insertBond(bondsRepo, 'GCONCURRENT_1', '10')

    // Fire 10 concurrent debits of 1 each against a bond with balance 10.
    // All should succeed and the final balance must be exactly 0.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => bondsRepo.debit(bondId, '1'))
    )

    const succeeded = results.filter((r) => r.status === 'fulfilled')
    assert.equal(succeeded.length, 10, 'all 10 debits of 1 should succeed')

    const final = await bondsRepo.findById(bondId)
    assert.ok(final)
    assert.ok(
      Math.abs(Number(final.amount)) < 0.0000001,
      `expected balance ~0, got ${final.amount}`
    )
  })

  it('rejects excess debits with InsufficientFundsError', async () => {
    await insertIdentity(identitiesRepo, 'GCONCURRENT_2')
    const bondId = await insertBond(bondsRepo, 'GCONCURRENT_2', '5')

    // 10 concurrent debits of 1 against a balance of 5 – exactly 5 succeed,
    // the remaining 5 must fail with InsufficientFundsError.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => bondsRepo.debit(bondId, '1'))
    )

    const succeeded = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')

    assert.equal(succeeded.length, 5, 'exactly 5 debits should succeed')
    assert.equal(failed.length, 5, 'exactly 5 debits should be rejected')

    for (const f of failed) {
      assert.ok(f.status === 'rejected')
      assert.ok(
        f.reason instanceof InsufficientFundsError,
        `expected InsufficientFundsError, got ${f.reason}`
      )
      assert.equal((f.reason as InsufficientFundsError).code, 'INSUFFICIENT_FUNDS')
    }

    const final = await bondsRepo.findById(bondId)
    assert.ok(final)
    assert.ok(
      Math.abs(Number(final.amount)) < 0.0000001,
      `expected balance ~0, got ${final.amount}`
    )
  })

  it('preserves balance when a single debit exceeds available funds', async () => {
    await insertIdentity(identitiesRepo, 'GCONCURRENT_3')
    const bondId = await insertBond(bondsRepo, 'GCONCURRENT_3', '3')

    await assert.rejects(
      () => bondsRepo.debit(bondId, '5'),
      (err: unknown) => {
        assert.ok(err instanceof InsufficientFundsError)
        assert.equal(err.code, 'INSUFFICIENT_FUNDS')
        assert.equal(err.bondId, bondId)
        return true
      }
    )

    // Balance must be unchanged.
    const bond = await bondsRepo.findById(bondId)
    assert.ok(bond)
    assert.ok(
      Math.abs(Number(bond.amount) - 3) < 0.0000001,
      `expected balance 3, got ${bond.amount}`
    )
  })

  it('throws when bond does not exist', async () => {
    await assert.rejects(
      () => bondsRepo.debit(999_999, '1'),
      /Bond 999999 not found/
    )
  })

  it('throws when pool is not provided to constructor', async () => {
    const repoWithoutPool = new BondsRepository(database.pool)
    await assert.rejects(
      () => repoWithoutPool.debit(1, '1'),
      /requires a Pool instance/
    )
  })
})
