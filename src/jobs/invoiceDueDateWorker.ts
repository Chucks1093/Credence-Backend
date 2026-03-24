import {
  type InvoiceDueDateScheduleItem,
  evaluateDueDateActions,
  normalizeToUtcIso,
} from './invoiceDueDate.js'

export interface TenantScheduleContext {
  tenantId: string
  timezone: string
}

export interface TenantContextProvider {
  listTenants(): Promise<TenantScheduleContext[]>
}

export interface InvoiceDueDateRepository {
  listPendingDueDateInvoices(
    tenantId: string,
    nowUtcIso: string,
  ): Promise<InvoiceDueDateScheduleItem[]>

  markDueDateActionTriggered(invoiceId: string, triggeredAtUtc: string): Promise<void>
}

export interface InvoiceDueDateWorkerOptions {
  /** Number of tenants processed per batch. */
  tenantBatchSize?: number
  logger?: (message: string) => void
}

export interface InvoiceDueDateWorkerResult {
  processedTenants: number
  evaluatedInvoices: number
  triggeredActions: number
  errors: number
  duration: number
  startTime: string
}

/**
 * Cron-friendly worker that evaluates invoice due-date actions per tenant timezone.
 */
export class InvoiceDueDateWorker {
  private readonly tenantBatchSize: number
  private readonly logger: (message: string) => void

  constructor(
    private readonly repository: InvoiceDueDateRepository,
    private readonly tenantContextProvider: TenantContextProvider,
    options: InvoiceDueDateWorkerOptions = {},
  ) {
    this.tenantBatchSize = options.tenantBatchSize ?? 200
    this.logger = options.logger ?? (() => {})
  }

  async run(nowUtc: Date | string = new Date()): Promise<InvoiceDueDateWorkerResult> {
    const startMs = Date.now()
    const startTime = normalizeToUtcIso(nowUtc)

    let processedTenants = 0
    let evaluatedInvoices = 0
    let triggeredActions = 0
    let errors = 0

    const tenants = await this.tenantContextProvider.listTenants()
    this.logger(`Evaluating due-date actions for ${tenants.length} tenants`)

    for (let i = 0; i < tenants.length; i += this.tenantBatchSize) {
      const batch = tenants.slice(i, i + this.tenantBatchSize)

      for (const tenant of batch) {
        try {
          const invoices = await this.repository.listPendingDueDateInvoices(tenant.tenantId, startTime)
          evaluatedInvoices += invoices.length

          const dueNow = evaluateDueDateActions({
            invoices,
            tenantTimezone: tenant.timezone,
            nowUtc,
          })

          for (const invoice of dueNow) {
            await this.repository.markDueDateActionTriggered(invoice.invoiceId, startTime)
            triggeredActions += 1
          }

          processedTenants += 1
        } catch (error) {
          errors += 1
          const message = error instanceof Error ? error.message : 'Unknown worker error'
          this.logger(`Failed tenant ${tenant.tenantId}: ${message}`)
        }
      }
    }

    return {
      processedTenants,
      evaluatedInvoices,
      triggeredActions,
      errors,
      duration: Date.now() - startMs,
      startTime,
    }
  }
}
