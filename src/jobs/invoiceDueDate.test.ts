import { describe, expect, it } from 'vitest'
import { evaluateDueDateActions, normalizeToUtcIso } from './invoiceDueDate.js'

describe('invoiceDueDate utility', () => {
  it('normalizes valid timestamps to UTC ISO', () => {
    expect(normalizeToUtcIso('2026-03-24T12:00:00+02:00')).toBe('2026-03-24T10:00:00.000Z')
  })

  it('rejects ambiguous timestamps without timezone information', () => {
    expect(() => normalizeToUtcIso('2026-03-24T12:00:00')).toThrow(
      'Timestamp must include UTC offset or Z suffix',
    )
  })

  it('evaluates due-date boundaries in tenant timezone (cross-timezone safety)', () => {
    const invoices = [
      {
        invoiceId: 'inv-kiritimati-next-day',
        dueAtUtc: '2026-03-24T12:30:00.000Z',
      },
    ]

    const due = evaluateDueDateActions({
      invoices,
      tenantTimezone: 'Pacific/Kiritimati',
      nowUtc: '2026-03-24T01:00:00.000Z',
    })

    // In Pacific/Kiritimati (UTC+14), dueAt local day is 2026-03-25 while now local day is 2026-03-24.
    expect(due).toHaveLength(0)
  })

  it('handles DST forward transition using tenant-local day boundaries', () => {
    const invoices = [
      {
        invoiceId: 'inv-dst-spring-forward',
        dueAtUtc: '2026-03-08T05:30:00.000Z',
      },
    ]

    const beforeLocalMidnightBoundary = evaluateDueDateActions({
      invoices,
      tenantTimezone: 'America/New_York',
      nowUtc: '2026-03-08T03:30:00.000Z',
    })

    const afterLocalMidnightBoundary = evaluateDueDateActions({
      invoices,
      tenantTimezone: 'America/New_York',
      nowUtc: '2026-03-08T07:30:00.000Z',
    })

    expect(beforeLocalMidnightBoundary).toHaveLength(0)
    expect(afterLocalMidnightBoundary.map((item) => item.invoiceId)).toEqual([
      'inv-dst-spring-forward',
    ])
  })

  it('skips invoices already triggered', () => {
    const due = evaluateDueDateActions({
      tenantTimezone: 'UTC',
      nowUtc: '2026-03-24T12:00:00.000Z',
      invoices: [
        {
          invoiceId: 'already-triggered',
          dueAtUtc: '2026-03-23T00:00:00.000Z',
          actionTriggeredAtUtc: '2026-03-23T01:00:00.000Z',
        },
      ],
    })

    expect(due).toEqual([])
  })
})
