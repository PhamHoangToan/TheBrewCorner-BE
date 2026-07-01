import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PayrollService } from '../payroll/payroll.service'

@Injectable()
export class PayrollJob {
  private readonly logger = new Logger(PayrollJob.name)

  constructor(private readonly payrollService: PayrollService) {}

  // Chạy lúc 00:01 ngày 5 mỗi tháng — tính lương tháng trước
  @Cron('1 0 5 * *')
  async run() {
    const now = new Date()
    const targetMonth = now.getMonth() === 0 ? 12 : now.getMonth()
    const targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    this.logger.log(`Tính lương tháng ${targetMonth}/${targetYear}`)
    try {
      const result = await this.payrollService.calculateMonth(targetYear, targetMonth)
      this.logger.log(`Hoàn tất: ${result.computed} nhân viên`)
    } catch (err) {
      this.logger.error('Tính lương thất bại', (err as any)?.message)
    }
  }
}
