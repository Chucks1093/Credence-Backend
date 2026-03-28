import type { Queryable } from '../../db/repositories/queryable.js'

const ANALYTICS_VIEW = 'analytics_metrics_mv'
const REFRESH_STATE_TABLE = 'analytics_view_refresh_state'

export type RefreshStatus = 'ok' | 'stale' | 'failed_recently'

export interface AnalyticsMetrics {
  activeIdentities: number
  totalIdentities: number
  avgTotalScore: number
  latestScoreCalculatedAt: string
}

export interface AnalyticsStaleness {
  asOf: string
  ageSeconds: number
  fresh: boolean
  refreshStatus: RefreshStatus
}

export interface AnalyticsResponse {
  metrics: AnalyticsMetrics
  staleness: AnalyticsStaleness
}

type MetricsRow = {
  active_identities: string | number
  total_identities: string | number
  avg_total_score: string | number
  latest_score_calculated_at: Date | string
  snapshot_at: Date | string
}

type RefreshStateRow = {
  view_name: string
  last_success_at: Date | string | null
  last_attempt_at: Date | string
  last_error: string | null
}

const toDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value)

const toNumber = (value: string | number): number =>
  typeof value === 'number' ? value : Number(value)

export function computeStaleness(
  asOf: Date,
  now: Date,
  thresholdSeconds: number,
  hadRecentRefreshError: boolean,
): AnalyticsStaleness {
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - asOf.getTime()) / 1000))
  const fresh = ageSeconds <= thresholdSeconds

  let refreshStatus: RefreshStatus = fresh ? 'ok' : 'stale'
  if (hadRecentRefreshError) {
    refreshStatus = 'failed_recently'
  }

  return {
    asOf: asOf.toISOString(),
    ageSeconds,
    fresh,
    refreshStatus,
  }
}

export class AnalyticsService {
  constructor(
    private readonly db: Queryable,
    private readonly stalenessThresholdSeconds = 300,
  ) {}

  async getSummary(now = new Date()): Promise<AnalyticsResponse> {
    const metricsResult = await this.db.query<MetricsRow>(
      `
      SELECT
        active_identities,
        total_identities,
        avg_total_score,
        latest_score_calculated_at,
        snapshot_at
      FROM ${ANALYTICS_VIEW}
      WHERE metrics_key = 1
      LIMIT 1
      `,
    )

    if (!metricsResult.rows[0]) {
      throw new Error('Analytics materialized view is empty.')
    }

    const refreshStateResult = await this.db.query<RefreshStateRow>(
      `
      SELECT view_name, last_success_at, last_attempt_at, last_error
      FROM ${REFRESH_STATE_TABLE}
      WHERE view_name = $1
      LIMIT 1
      `,
      [ANALYTICS_VIEW],
    )

    const metrics = metricsResult.rows[0]
    const refreshState = refreshStateResult.rows[0]
    const snapshotAt = toDate(metrics.snapshot_at)

    const staleness = computeStaleness(
      snapshotAt,
      now,
      this.stalenessThresholdSeconds,
      Boolean(refreshState?.last_error),
    )

    return {
      metrics: {
        activeIdentities: toNumber(metrics.active_identities),
        totalIdentities: toNumber(metrics.total_identities),
        avgTotalScore: toNumber(metrics.avg_total_score),
        latestScoreCalculatedAt: toDate(metrics.latest_score_calculated_at).toISOString(),
      },
      staleness,
    }
  }

  async refreshConcurrently(now = new Date()): Promise<void> {
    const startedAt = Date.now()

    await this.db.query(
      `
      UPDATE ${REFRESH_STATE_TABLE}
      SET
        last_attempt_at = $2,
        updated_at = $2
      WHERE view_name = $1
      `,
      [ANALYTICS_VIEW, now.toISOString()],
    )

    try {
      await this.db.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${ANALYTICS_VIEW}`)

      const durationMs = Date.now() - startedAt
      await this.db.query(
        `
        UPDATE ${REFRESH_STATE_TABLE}
        SET
          last_success_at = $2,
          last_error = NULL,
          duration_ms = $3,
          updated_at = $2
        WHERE view_name = $1
        `,
        [ANALYTICS_VIEW, new Date().toISOString(), durationMs],
      )
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const errorMessage = error instanceof Error ? error.message : 'Unknown refresh error'

      await this.db.query(
        `
        UPDATE ${REFRESH_STATE_TABLE}
        SET
          last_error = $2,
          duration_ms = $3,
          updated_at = $4
        WHERE view_name = $1
        `,
        [ANALYTICS_VIEW, errorMessage, durationMs, new Date().toISOString()],
      )

      throw error
    }
  }
}

