import { Controller, Get } from '@nestjs/common'
import { ReportsService } from './reports.service'

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  dashboard() {
    return this.reportsService.dashboard()
  }

  @Get('revenue')
  revenue() {
    return this.reportsService.revenue()
  }

  @Get('sales')
  sales() {
    return this.reportsService.sales()
  }
}
