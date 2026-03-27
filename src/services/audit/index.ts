import { AuditLogEntry, AuditAction } from './types.js'

/**
 * Audit log service for tracking admin actions
 * In production, this would write to a database or centralized logging system
 */
export class AuditLogService {
  private logs: AuditLogEntry[] = []
  private logId = 0

  /**
   * Log an admin action
   * 
   * @param tenantId - Tenant ID for multi-tenant isolation (required)
   * @param adminId - ID of the admin performing the action
   * @param adminEmail - Email of the admin
   * @param action - Type of action being performed
   * @param targetUserId - ID of the target user (if applicable)
   * @param targetUserEmail - Email of the target user
   * @param details - Additional details about the action
   * @param status - Whether the action succeeded or failed
   * @param errorMessage - Error message if action failed
   * @param ipAddress - IP address of the requester
   * @returns The created audit log entry
   */
  logAction(
    tenantId: string,
    adminId: string,
    adminEmail: string,
    action: AuditAction,
    targetUserId: string,
    targetUserEmail: string,
    details: Record<string, unknown> = {},
    status: 'success' | 'failure' = 'success',
    errorMessage?: string,
    ipAddress?: string
  ): AuditLogEntry {
    if (!tenantId || tenantId.trim().length === 0) {
      throw new Error('tenantId is required for audit log entries')
    }

    const entry: AuditLogEntry = {
      id: `audit-${this.logId++}`,
      timestamp: new Date().toISOString(),
      tenantId,
      adminId,
      adminEmail,
      action,
      targetUserId,
      targetUserEmail,
      details,
      ipAddress,
      status,
      errorMessage,
    }

    this.logs.push(entry)
    return entry
  }

  /**
   * Get audit logs with optional filtering
   * 
   * SECURITY: Tenant scoping is DENY-BY-DEFAULT. Either tenantId or allowSuperScope must be provided.
   * 
   * @param filters - Optional filters for action, adminId, targetUserId, etc.
   * @param limit - Maximum number of logs to return (default: 100)
   * @param offset - Pagination offset (default: 0)
   * @param options - Additional options for tenant scoping
   * @returns Array of matching audit log entries and total count
   */
  getLogs(
    filters?: {
      action?: AuditAction
      adminId?: string
      targetUserId?: string
      status?: 'success' | 'failure'
      tenantId?: string
    },
    limit = 100,
    offset = 0,
    options?: {
      /** Allow super-admin to query across all tenants. Must be explicitly set to true. */
      allowSuperScope?: boolean
    }
  ): {
    logs: AuditLogEntry[]
    total: number
  } {
    // SECURITY: Enforce tenant scoping - deny by default
    if (!filters?.tenantId && !options?.allowSuperScope) {
      throw new Error(
        'Tenant scoping required: either provide tenantId filter or explicitly enable allowSuperScope for privileged access'
      )
    }

    let filtered = this.logs

    // Apply tenant filter if provided (not in super-scope mode)
    if (filters?.tenantId) {
      filtered = filtered.filter((log) => log.tenantId === filters.tenantId)
    }

    if (filters?.action) {
      filtered = filtered.filter((log) => log.action === filters.action)
    }
    if (filters?.adminId) {
      filtered = filtered.filter((log) => log.adminId === filters.adminId)
    }
    if (filters?.targetUserId) {
      filtered = filtered.filter((log) => log.targetUserId === filters.targetUserId)
    }
    if (filters?.status) {
      filtered = filtered.filter((log) => log.status === filters.status)
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const total = filtered.length
    const paginated = filtered.slice(offset, offset + limit)

    return { logs: paginated, total }
  }

  /**
   * Get all audit logs (for testing)
   * @returns All audit log entries
   */
  getAllLogs(): AuditLogEntry[] {
    return this.logs
  }

  /**
   * Clear all logs (for testing)
   */
  clearLogs(): void {
    this.logs = []
    this.logId = 0
  }

  /**
   * Stream audit logs as an AsyncGenerator to avoid memory spikes
   * Applies date filtering and redacts sensitive information compliance policy
   * 
   * SECURITY: Tenant scoping is DENY-BY-DEFAULT. Either tenantId or allowSuperScope must be provided.
   * 
   * @param startDate - Start date (inclusive)
   * @param endDate - End date (inclusive)
   * @param tenantId - Tenant ID for scoped export (required unless allowSuperScope is true)
   * @param options - Additional options for tenant scoping
   */
  async *exportLogsStream(
    startDate: Date,
    endDate: Date,
    tenantId?: string,
    options?: {
      /** Allow super-admin to export across all tenants. Must be explicitly set to true. */
      allowSuperScope?: boolean
    }
  ): AsyncGenerator<AuditLogEntry> {
    // SECURITY: Enforce tenant scoping - deny by default
    if (!tenantId && !options?.allowSuperScope) {
      throw new Error(
        'Tenant scoping required: either provide tenantId or explicitly enable allowSuperScope for privileged access'
      )
    }

    const startMs = startDate.getTime()
    const endMs = endDate.getTime()

    for (const log of this.logs) {
      const logTime = new Date(log.timestamp).getTime()
      
      // Apply tenant filter if provided (not in super-scope mode)
      if (tenantId && log.tenantId !== tenantId) {
        continue
      }
      
      if (logTime >= startMs && logTime <= endMs) {
        // Redact and yield
        yield this.redactLogEntry(log)
        // Yield to event loop to simulate genuine streaming
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
  }

  /**
   * Redact sensitive fields for compliance export
   */
  private redactLogEntry(entry: AuditLogEntry): AuditLogEntry {
    const redacted = { ...entry }
    
    // Mask emails: preserve first character and domain
    const maskEmail = (email: string) => {
      if (!email || !email.includes('@')) return '***@***'
      const [local, domain] = email.split('@')
      const maskedLocal = local.length > 1 ? `${local[0]}***` : '***'
      return `${maskedLocal}@${domain}`
    }

    if (redacted.adminEmail) {
      redacted.adminEmail = maskEmail(redacted.adminEmail)
    }
    if (redacted.targetUserEmail) {
      redacted.targetUserEmail = maskEmail(redacted.targetUserEmail)
    }

    // Mask IP address: mask last octet if IPv4
    if (redacted.ipAddress) {
      const parts = redacted.ipAddress.split('.')
      if (parts.length === 4) {
        parts[3] = '***'
        redacted.ipAddress = parts.join('.')
      }
    }

    return redacted
  }
}

// Singleton
export const auditLogService = new AuditLogService()

export { AuditAction } from './types.js'
export type { AuditLogEntry } from './types.js'
