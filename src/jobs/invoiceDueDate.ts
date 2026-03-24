export interface InvoiceDueDateScheduleItem {
  /** Stable invoice identifier. */
  invoiceId: string
  /** Due timestamp in UTC (ISO8601). */
  dueAtUtc: string
  /** If set, due-date action already executed at this UTC time. */
  actionTriggeredAtUtc?: string | null
}

export interface EvaluateDueDateActionsInput {
  invoices: ReadonlyArray<InvoiceDueDateScheduleItem>
  /** IANA timezone, for example: "America/New_York". */
  tenantTimezone: string
  /** Optional current time override (defaults to now). */
  nowUtc?: Date | string
}

const zonedDayFormatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zonedDayFormatterCache.get(timeZone)
  if (cached) {
    return cached
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  zonedDayFormatterCache.set(timeZone, formatter)
  return formatter
}

function parseTimestampWithZone(input: Date | string): Date {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new Error('Invalid Date input')
    }
    return input
  }

  // Reject zone-less timestamps (for example: 2026-03-24T10:00:00)
  const hasZone = /(?:Z|[+\-]\d{2}:\d{2})$/.test(input)
  if (!hasZone) {
    throw new Error(`Timestamp must include UTC offset or Z suffix: ${input}`)
  }

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid timestamp: ${input}`)
  }

  return parsed
}

function zonedDayKey(dateUtc: Date, tenantTimezone: string): string {
  const formatter = getFormatter(tenantTimezone)
  const parts = formatter.formatToParts(dateUtc)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(`Unable to compute zoned date for timezone: ${tenantTimezone}`)
  }

  return `${year}-${month}-${day}`
}

/**
 * Normalize any accepted timestamp input to canonical UTC ISO string.
 */
export function normalizeToUtcIso(input: Date | string): string {
  return parseTimestampWithZone(input).toISOString()
}

/**
 * Select invoices whose due-date action should run now for the tenant.
 *
 * Rule: compare due date and "today" in the tenant timezone (day granularity).
 */
export function evaluateDueDateActions(
  input: EvaluateDueDateActionsInput,
): InvoiceDueDateScheduleItem[] {
  const now = parseTimestampWithZone(input.nowUtc ?? new Date())
  const currentTenantDay = zonedDayKey(now, input.tenantTimezone)

  return input.invoices.filter((invoice) => {
    if (invoice.actionTriggeredAtUtc) {
      return false
    }

    const dueAt = parseTimestampWithZone(invoice.dueAtUtc)
    const dueTenantDay = zonedDayKey(dueAt, input.tenantTimezone)

    return dueTenantDay <= currentTenantDay
  })
}
