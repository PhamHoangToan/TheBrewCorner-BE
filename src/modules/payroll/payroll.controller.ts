import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { PayrollService } from './payroll.service'

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  // Admin trigger tính lương thủ công
  @Post('calculate')
  calculate(@Body() body: { year: number; month: number; userId?: string }) {
    if (body.userId) {
      return this.payrollService.calculateForUser(body.userId, body.year, body.month)
    }
    return this.payrollService.calculateMonth(body.year, body.month)
  }

  // Cấu hình lương nhân viên
  @Patch('salary-config/:userId')
  setSalaryConfig(@Param('userId') userId: string, @Body() body: Record<string, any>) {
    return this.payrollService.setSalaryConfig(userId, body)
  }

  // Danh sách bảng lương (lọc theo tháng/năm)
  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.payrollService.findAll(query)
  }

  // Lịch sử lương của 1 nhân viên
  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.payrollService.findByUser(userId)
  }

  // Phiếu lương theo userId + tháng/năm
  @Get('user/:userId/:year/:month')
  findByUserMonth(
    @Param('userId') userId: string,
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return this.payrollService.findOneByUserMonth(userId, Number(year), Number(month))
  }

  // Phiếu lương theo ID
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.payrollService.findOne(id)
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.payrollService.approve(id)
  }

  @Patch(':id/paid')
  markPaid(@Param('id') id: string) {
    return this.payrollService.markPaid(id)
  }
}
