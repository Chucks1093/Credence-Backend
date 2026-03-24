import { Router, type Request, type Response } from 'express'
import type { AnalyticsService } from '../services/analytics/service.js'

export function createAnalyticsRouter(analyticsService?: AnalyticsService): Router {
  const router = Router()

  router.get('/summary', async (_req: Request, res: Response) => {
    if (!analyticsService) {
      res.status(503).json({
        error: 'AnalyticsUnavailable',
        message: 'Analytics service is not configured.',
      })
      return
    }

    try {
      const data = await analyticsService.getSummary()
      res.status(200).json(data)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown analytics error'
      res.status(503).json({
        error: 'AnalyticsUnavailable',
        message,
      })
    }
  })

  return router
}

