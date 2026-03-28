import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockStream: undefined as ((op: any) => Promise<void>) | undefined,
  upsertIdentity: vi.fn().mockResolvedValue(undefined),
  upsertBond: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('stellar-sdk', () => {
  function MockServer() {
    return {
      operations: vi.fn(() => ({
        forAsset: vi.fn(() => ({
          cursor: vi.fn(() => ({
            stream: vi.fn(({ onmessage }: { onmessage: (op: any) => Promise<void> }) => {
              mocks.mockStream = onmessage
            }),
          })),
        })),
      })),
    }
  }

  return { Server: MockServer }
})

vi.mock('../services/identityService.js', () => ({
  upsertIdentity: mocks.upsertIdentity,
  upsertBond: mocks.upsertBond,
}))

import { subscribeBondCreationEvents } from '../listeners/horizonBondEvents.js'

describe('Horizon Bond Creation Listener', () => {
  beforeEach(() => {
    mocks.mockStream = undefined
    mocks.upsertIdentity.mockClear()
    mocks.upsertBond.mockClear()
  })

  it('subscribes without throwing', () => {
    expect(() => subscribeBondCreationEvents(vi.fn())).not.toThrow()
    expect(mocks.mockStream).toBeTypeOf('function')
  })

  it('accepts an undefined callback', () => {
    expect(() => subscribeBondCreationEvents(undefined)).not.toThrow()
    expect(mocks.mockStream).toBeTypeOf('function')
  })

  it('parses and upserts create_bond events', async () => {
    const onEvent = vi.fn()
    subscribeBondCreationEvents(onEvent)

    await mocks.mockStream?.({
      type: 'create_bond',
      source_account: 'GABC...',
      id: 'bond123',
      amount: '1000',
      duration: '365',
      paging_token: 'token1',
    })

    expect(mocks.upsertIdentity).toHaveBeenCalledWith({ id: 'GABC...' })
    expect(mocks.upsertBond).toHaveBeenCalledWith({ id: 'bond123', amount: '1000', duration: '365' })
    expect(onEvent).toHaveBeenCalledWith({
      identity: { id: 'GABC...' },
      bond: { id: 'bond123', amount: '1000', duration: '365' },
    })
  })

  it('ignores non-bond events', async () => {
    const onEvent = vi.fn()
    subscribeBondCreationEvents(onEvent)

    await mocks.mockStream?.({
      type: 'payment',
      id: 'other',
      paging_token: 'token2',
    })

    expect(mocks.upsertIdentity).not.toHaveBeenCalled()
    expect(mocks.upsertBond).not.toHaveBeenCalled()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('handles duplicate create_bond events consistently', async () => {
    subscribeBondCreationEvents(vi.fn())

    const event = {
      type: 'create_bond',
      source_account: 'GABC...',
      id: 'bond123',
      amount: '1000',
      duration: '365',
      paging_token: 'token1',
    }

    await mocks.mockStream?.(event)
    await mocks.mockStream?.(event)

    expect(mocks.upsertIdentity).toHaveBeenCalledTimes(2)
    expect(mocks.upsertBond).toHaveBeenCalledTimes(2)
  })
})
