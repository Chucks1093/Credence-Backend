import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReportService } from './reportService.js'
import { ReportRepository } from '../db/repositories/reportRepository.js'
import { ReportJobStatus } from '../jobs/types.js'

describe('ReportService', () => {
  let reportService: ReportService
  let mockReportRepository: any

  beforeEach(() => {
    mockReportRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn(),
    }
    reportService = new ReportService(mockReportRepository as unknown as ReportRepository)
  })

  describe('startReportGeneration', () => {
    it('should create a job in queued status and return it', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'test-report',
        status: ReportJobStatus.QUEUED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockReportRepository.create.mockResolvedValue(mockJob)

      const job = await reportService.startReportGeneration('test-report')

      expect(job).toEqual(mockJob)
      expect(mockReportRepository.create).toHaveBeenCalledWith('test-report')
    })

    it('should trigger background processing', async () => {
      const mockJob = { id: 'job-123', type: 'test-report', status: ReportJobStatus.QUEUED }
      mockReportRepository.create.mockResolvedValue(mockJob)
      
      // Spy on processReport (private method)
      const processSpy = vi.spyOn(reportService as any, 'processReport')

      await reportService.startReportGeneration('test-report')

      expect(processSpy).toHaveBeenCalledWith('job-123')
    })
  })

  describe('processReport (background logic)', () => {
    it('should transition status from QUEUED -> RUNNING -> COMPLETED', async () => {
      const jobId = 'job-123'
      
      // Mock updateStatus to return a job
      mockReportRepository.updateStatus.mockResolvedValue({ id: jobId })

      // Use a shorter timeout for testing if possible, or mock timers
      vi.useFakeTimers()

      const processPromise = (reportService as any).processReport(jobId)

      // Should have called RUNNING status
      expect(mockReportRepository.updateStatus).toHaveBeenCalledWith(jobId, ReportJobStatus.RUNNING)

      // Fast-forward timers
      await vi.runAllTimersAsync()
      await processPromise

      // Should have called COMPLETED status with artifact URL
      expect(mockReportRepository.updateStatus).toHaveBeenCalledWith(
        jobId,
        ReportJobStatus.COMPLETED,
        expect.objectContaining({
          artifactUrl: expect.stringContaining(jobId),
        })
      )

      vi.useRealTimers()
    })

    it('should transition to FAILED if an error occurs', async () => {
      const jobId = 'job-123'
      mockReportRepository.updateStatus.mockRejectedValueOnce(new Error('DB Error'))

      await (reportService as any).processReport(jobId)

      expect(mockReportRepository.updateStatus).toHaveBeenCalledWith(
        jobId,
        ReportJobStatus.FAILED,
        expect.objectContaining({
          failureReason: 'INTERNAL_ERROR',
        })
      )
    })
  })
})
