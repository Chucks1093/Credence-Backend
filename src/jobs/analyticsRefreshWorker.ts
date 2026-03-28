import { parseCronToInterval } from './scheduler.js'
import type { AnalyticsService } from '../services/analytics/service.js'

export interface AnalyticsRefreshWorkerResult {
  refreshed: boolean
  duration: number
  startTime: string
}

export class AnalyticsRefreshWorker {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly logger: (message: string) => void = () => {},
  ) {}

  async run(): Promise<AnalyticsRefreshWorkerResult> {
    const startMs = Date.now()
    const startTime = new Date().toISOString()

    this.logger('Starting analytics materialized view refresh')
    await this.analyticsService.refreshConcurrently()
    const duration = Date.now() - startMs
    this.logger(`Analytics refresh completed in ${duration}ms`)

    return {
      refreshed: true,
      duration,
      startTime,
    }
  }
}

export function getAnalyticsRefreshIntervalMs(
  cronExpression = process.env.ANALYTICS_REFRESH_CRON ?? '*/5 * * * *',
): number {
  if (cronExpression === '*/5 * * * *') {
    return 5 * 60 * 1000
  }
  return parseCronToInterval(cronExpression)
}

