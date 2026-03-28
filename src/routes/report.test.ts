import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import reportRouter from './report.js'
import { ApiScope, UserRole } from '../middleware/auth.js'
import { ReportJobStatus } from '../jobs/types.js'

// Mock dependencies
vi.mock('../db/pool.js', () => ({
  getPool: vi.fn(() => ({})),
}))

vi.mock('../db/repositories/reportRepository.js', () => ({
  ReportRepository: vi.fn(() => ({
    create: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
  })),
}))

vi.mock('../services/reportService.js', () => ({
  ReportService: vi.fn(() => ({
    startReportGeneration: vi.fn(),
    getReportStatus: vi.fn(),
  })),
}))

// Import mocked services to set their behaviors
import { ReportService } from '../services/reportService.js'

describe('Report Routes', () => {
  let app: express.Express
  let mockReportService: any
  const ENTERPRISE_KEY = 'test-enterprise-key-12345'
  const PUBLIC_KEY = 'test-public-key-67890'

  beforeEach(() => {
    app = express()
    app.use(express.json())
    app.use('/api/reports', reportRouter)
    mockReportService = (ReportService as any).mock.results[0].value
  })

  describe('POST /api/reports', () => {
    it('should return 401 when API key is missing', async () => {
      const response = await request(app)
        .post('/api/reports')
        .send({ type: 'summary' })

      expect(response.status).toBe(401)
    })

    it('should return 403 when using public API key', async () => {
      const response = await request(app)
        .post('/api/reports')
        .set('X-API-Key', PUBLIC_KEY)
        .send({ type: 'summary' })

      expect(response.status).toBe(403)
    })

    it('should return 202 and job details when authorized', async () => {
      const mockJob = {
        id: 'job-123',
        status: ReportJobStatus.QUEUED,
        type: 'summary',
        createdAt: new Date().toISOString(),
      }
      mockReportService.startReportGeneration.mockResolvedValue(mockJob)

      const response = await request(app)
        .post('/api/reports')
        .set('X-API-Key', ENTERPRISE_KEY)
        .send({ type: 'summary' })

      expect(response.status).toBe(202)
      expect(response.body).toEqual({
        jobId: 'job-123',
        status: ReportJobStatus.QUEUED,
        type: 'summary',
        createdAt: mockJob.createdAt,
      })
    })

    it('should return 400 when type is missing', async () => {
      const response = await request(app)
        .post('/api/reports')
        .set('X-API-Key', ENTERPRISE_KEY)
        .send({})

      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/reports/:jobId', () => {
    it('should return 401 when API key is missing', async () => {
      const response = await request(app)
        .get('/api/reports/job-123')

      expect(response.status).toBe(401)
    })

    it('should return 200 and job details when job exists', async () => {
      const mockJob = {
        id: 'job-123',
        status: ReportJobStatus.COMPLETED,
        type: 'summary',
        artifactUrl: 'http://example.com/report.pdf',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockReportService.getReportStatus.mockResolvedValue(mockJob)

      const response = await request(app)
        .get('/api/reports/job-123')
        .set('X-API-Key', ENTERPRISE_KEY)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        jobId: 'job-123',
        status: ReportJobStatus.COMPLETED,
        type: 'summary',
        artifactUrl: mockJob.artifactUrl,
        createdAt: mockJob.createdAt,
        updatedAt: mockJob.updatedAt,
      })
    })

    it('should return 404 when job not found', async () => {
      mockReportService.getReportStatus.mockResolvedValue(null)

      const response = await request(app)
        .get('/api/reports/non-existent')
        .set('X-API-Key', ENTERPRISE_KEY)

      expect(response.status).toBe(404)
    })
  })
})
