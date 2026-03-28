import { ReportRepository } from '../db/repositories/reportRepository.js'
import { ReportJob, ReportJobStatus } from '../jobs/types.js'

export class ReportService {
  constructor(private readonly reportRepository: ReportRepository) {}

  /**
   * Starts a report generation job asynchronously.
   */
  async startReportGeneration(type: string): Promise<ReportJob> {
    const job = await this.reportRepository.create(type)

    // Run report generation in background
    this.processReport(job.id).catch((error) => {
      console.error(`Error processing report job ${job.id}:`, error)
    })

    return job
  }

  /**
   * Gets the status of a report job.
   */
  async getReportStatus(id: string): Promise<ReportJob | null> {
    return this.reportRepository.findById(id)
  }

  /**
   * Internal method to process the report.
   */
  private async processReport(id: string): Promise<void> {
    try {
      // 1. Mark as running
      await this.reportRepository.updateStatus(id, ReportJobStatus.RUNNING)

      // 2. Simulate report generation work
      await new Promise((resolve) => setTimeout(resolve, 5000))

      // 3. Complete job with artifact URL
      await this.reportRepository.updateStatus(id, ReportJobStatus.COMPLETED, {
        artifactUrl: `https://artifacts.credence.example.com/reports/${id}.pdf`,
      })
    } catch (error) {
      // Handle failure
      const failureReason = error instanceof Error ? error.message : 'Unknown error'
      await this.reportRepository.updateStatus(id, ReportJobStatus.FAILED, {
        failureReason: 'INTERNAL_ERROR', // Avoid exposing internal stack traces as per requirements
      })
    }
  }
}
