import { Controller, Get, Query } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { Roles } from '../../common/auth/auth.decorators'

interface DateRangeQuery {
  startDate?: string
  endDate?: string
}

@Roles('ADMIN')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  dashboard() {
    return this.reportsService.dashboard()
  }

  @Get('revenue')
  revenue(@Query() query: DateRangeQuery) {
    return this.reportsService.revenue(query)
  }

  @Get('revenue-by-hour')
  revenueByHour(@Query() query: DateRangeQuery) {
    return this.reportsService.revenueByHour(query)
  }

  @Get('top-products')
  topProducts(@Query() query: DateRangeQuery & { limit?: string }) {
    return this.reportsService.topProducts(query)
  }

  @Get('sales')
  sales(@Query() query: DateRangeQuery) {
    return this.reportsService.sales(query)
  }

  @Get('profit')
  profit(@Query() query: DateRangeQuery) {
    return this.reportsService.profit(query)
  }

  @Get('z-report')
  zReport(@Query() query: { date?: string }) {
    return this.reportsService.zReport(query)
  }

  @Get('waste')
  waste(@Query() query: DateRangeQuery) {
    return this.reportsService.waste(query)
  }

  @Get('staff-performance')
  staffPerformance(@Query() query: DateRangeQuery) {
    return this.reportsService.staffPerformance(query)
  }
}
