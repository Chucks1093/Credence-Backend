import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InvoiceDueDateWorker,
  type InvoiceDueDateRepository,
  type TenantContextProvider,
} from './invoiceDueDateWorker.js'

describe('InvoiceDueDateWorker', () => {
  let repository: InvoiceDueDateRepository
  let tenantContextProvider: TenantContextProvider

  beforeEach(() => {
    repository = {
      listPendingDueDateInvoices: vi.fn(),
      markDueDateActionTriggered: vi.fn().mockResolvedValue(undefined),
    }

    tenantContextProvider = {
      listTenants: vi.fn(),
    }
  })

  it('passes tenant timezone context to evaluation and triggers only eligible invoices', async () => {
    vi.mocked(tenantContextProvider.listTenants).mockResolvedValue([
      { tenantId: 'tenant-utc', timezone: 'UTC' },
      { tenantId: 'tenant-kiritimati', timezone: 'Pacific/Kiritimati' },
    ])

    vi.mocked(repository.listPendingDueDateInvoices)
      .mockResolvedValueOnce([
        {
          invoiceId: 'inv-utc-due',
          dueAtUtc: '2026-03-24T00:30:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          invoiceId: 'inv-kiritimati-not-due',
          dueAtUtc: '2026-03-24T12:30:00.000Z',
        },
      ])

    const worker = new InvoiceDueDateWorker(repository, tenantContextProvider)
    const result = await worker.run('2026-03-24T01:00:00.000Z')

    expect(result.processedTenants).toBe(2)
    expect(result.evaluatedInvoices).toBe(2)
    expect(result.triggeredActions).toBe(1)
    expect(result.errors).toBe(0)

    expect(repository.markDueDateActionTriggered).toHaveBeenCalledTimes(1)
    expect(repository.markDueDateActionTriggered).toHaveBeenCalledWith(
      'inv-utc-due',
      '2026-03-24T01:00:00.000Z',
    )
  })

  it('keeps running when one tenant fails', async () => {
    vi.mocked(tenantContextProvider.listTenants).mockResolvedValue([
      { tenantId: 'tenant-fail', timezone: 'UTC' },
      { tenantId: 'tenant-ok', timezone: 'UTC' },
    ])

    vi.mocked(repository.listPendingDueDateInvoices)
      .mockRejectedValueOnce(new Error('db unavailable'))
      .mockResolvedValueOnce([
        {
          invoiceId: 'inv-ok',
          dueAtUtc: '2026-03-23T00:00:00.000Z',
        },
      ])

    const worker = new InvoiceDueDateWorker(repository, tenantContextProvider)
    const result = await worker.run('2026-03-24T01:00:00.000Z')

    expect(result.processedTenants).toBe(1)
    expect(result.errors).toBe(1)
    expect(result.triggeredActions).toBe(1)
    expect(repository.markDueDateActionTriggered).toHaveBeenCalledWith(
      'inv-ok',
      '2026-03-24T01:00:00.000Z',
    )
  })
})
