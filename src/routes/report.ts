import { Router, Request, Response } from 'express'
import { requireApiKey, ApiScope } from '../middleware/auth.js'
import { ReportService } from '../services/reportService.js'
import { ReportRepository } from '../db/repositories/reportRepository.js'
import { pool } from '../db/pool.js'

const router = Router()
const reportRepository = new ReportRepository(pool)
const reportService = new ReportService(reportRepository)

/**
 * Request body schema for report generation
 */
interface ReportRequest {
  type: string
}

/**
 * POST /api/reports
 * 
 * Starts an asynchronous report generation job
 * 
 * @requires Enterprise API key via X-API-Key header
 * 
 * @body {string} type - Type of report to generate (e.g., 'trust_score_summary')
 * 
 * @returns {object} Job information with status 'queued'
 */
router.post(
  '/',
  requireApiKey(ApiScope.ENTERPRISE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { type } = req.body as ReportRequest

      if (!type || typeof type !== 'string') {
        res.status(400).json({
          error: 'InvalidRequest',
          message: 'Report type is required and must be a string',
        })
        return
      }

      const job = await reportService.startReportGeneration(type)

      res.status(202).json({
        jobId: job.id,
        status: job.status,
        type: job.type,
        createdAt: job.createdAt,
      })
    } catch (error) {
      console.error('Report generation error:', error)
      res.status(500).json({
        error: 'InternalServerError',
        message: 'An unexpected error occurred while starting the report job',
      })
    }
  }
)

/**
 * GET /api/reports/:jobId
 * 
 * Gets the status of a report generation job
 * 
 * @requires Enterprise API key via X-API-Key header
 * 
 * @param {string} jobId - Unique report job ID
 * 
 * @returns {object} Job status and artifact availability
 */
router.get(
  '/:jobId',
  requireApiKey(ApiScope.ENTERPRISE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params

      if (!jobId) {
        res.status(400).json({
          error: 'InvalidRequest',
          message: 'Job ID is required',
        })
        return
      }

      const job = await reportService.getReportStatus(jobId)

      if (!job) {
        res.status(404).json({
          error: 'NotFound',
          message: `Report job ${jobId} not found`,
        })
        return
      }

      res.status(200).json({
        jobId: job.id,
        status: job.status,
        type: job.type,
        artifactUrl: job.artifactUrl,
        failureReason: job.failureReason,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })
    } catch (error) {
      console.error('Report status query error:', error)
      res.status(500).json({
        error: 'InternalServerError',
        message: 'An unexpected error occurred while fetching report status',
      })
    }
  }
)

export default router
