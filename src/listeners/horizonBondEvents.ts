import { Horizon } from '@stellar/stellar-sdk'
import { upsertBond, upsertIdentity } from '../services/identityService.js'

export interface BondCreationEvent {
  identity: { id: string }
  bond: { id: string; amount?: string; duration?: string | null }
}

/**
 * Subscribe to bond creation events from Horizon.
 *
 * The event schema is currently a simplified placeholder driven by tests:
 * operations of type `create_bond`.
 */
export function subscribeBondCreationEvents(onEvent?: (event: BondCreationEvent) => void): void {
  const horizonUrl = process.env.HORIZON_URL || 'https://horizon.stellar.org'
  const server = new Horizon.Server(horizonUrl)

  let cursor = 'now'

  const startStream = (): void => {
    ;(server as any)
      .operations()
      .forAsset('BOND')
      .cursor(cursor)
      .stream({
        onmessage: async (op: any) => {
          cursor = op.paging_token
          if (op.type !== 'create_bond') return

          const event = parseBondEvent(op)
          await upsertIdentity(event.identity)
          await upsertBond(event.bond)
          onEvent?.(event)
        },
        onerror: (err: unknown) => {
          console.error('Horizon stream error:', err)
          setTimeout(startStream, 5000)
        },
      })
  }

  startStream()
}

function parseBondEvent(op: any): BondCreationEvent {
  return {
    identity: { id: op.source_account },
    bond: {
      id: op.id,
      amount: op.amount,
      duration: op.duration ?? null,
    },
  }
}
