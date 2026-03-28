import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createAnalyticsRouter } from './analytics.js'
import type { AnalyticsService } from '../services/analytics/service.js'

function appWithRouter(service?: AnalyticsService) {
  const app = express()
  app.use('/api/analytics', createAnalyticsRouter(service))
  return app
}

describe('Analytics routes', () => {
  it('returns 503 when analytics service is unavailable', async () => {
    const app = appWithRouter()
    const response = await request(app).get('/api/analytics/summary')

    expect(response.status).toBe(503)
    expect(response.body.error).toBe('AnalyticsUnavailable')
  })

  it('returns summary and staleness metadata when service succeeds', async () => {
    const analyticsService = {
      getSummary: vi.fn().mockResolvedValue({
        metrics: {
          activeIdentities: 7,
          totalIdentities: 9,
          avgTotalScore: 76.5,
          latestScoreCalculatedAt: '2026-03-24T11:58:00.000Z',
        },
        staleness: {
          asOf: '2026-03-24T11:58:00.000Z',
          ageSeconds: 120,
          fresh: true,
          refreshStatus: 'ok',
        },
      }),
    } as unknown as AnalyticsService

    const app = appWithRouter(analyticsService)
    const response = await request(app).get('/api/analytics/summary')

    expect(response.status).toBe(200)
    expect(response.body.metrics.totalIdentities).toBe(9)
    expect(response.body.staleness.refreshStatus).toBe('ok')
  })

  it('keeps endpoint readable and returns 503 on refresh/read failure', async () => {
    const analyticsService = {
      getSummary: vi.fn().mockRejectedValue(new Error('refresh failed, serving stale snapshot')),
    } as unknown as AnalyticsService

    const app = appWithRouter(analyticsService)
    const response = await request(app).get('/api/analytics/summary')

    expect(response.status).toBe(503)
    expect(response.body.error).toBe('AnalyticsUnavailable')
    expect(response.body.message).toContain('refresh failed')
  })
})

