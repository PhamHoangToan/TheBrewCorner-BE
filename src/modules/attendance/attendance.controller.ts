import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UnauthorizedException } from '@nestjs/common'
import { AttendanceService } from './attendance.service'

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // Webhook từ máy chấm công khuôn mặt
  @Post('device')
  fromDevice(
    @Headers('x-attendance-key') key: string,
    @Body() body: { employeeCode: string; timestamp: string; source?: string; note?: string },
  ) {
    const expected = process.env.ATTENDANCE_API_KEY
    if (expected && key !== expected) throw new UnauthorizedException('Invalid attendance key')
    return this.attendanceService.recordFromDevice({
      employeeCode: body.employeeCode,
      timestamp: new Date(body.timestamp ?? new Date()),
      source: body.source ?? 'FACE',
      note: body.note,
    })
  }

  // Admin nhập thủ công
  @Post('manual')
  createManual(@Body() body: Record<string, any>) {
    return this.attendanceService.createManual(body as any)
  }

  @Get('penalty-config')
  getPenaltyConfig() {
    return this.attendanceService.getPenaltyConfig()
  }

  @Patch('penalty-config')
  updatePenaltyConfig(@Body() body: Record<string, any>) {
    return this.attendanceService.updatePenaltyConfig(body as any)
  }

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.attendanceService.findAll(query)
  }

  // Yêu cầu bổ sung chấm công — phải đặt trước @Patch(':id') để tránh xung đột route
  @Post('corrections')
  createCorrection(
    @Body() body: { userId: string; workDate: string; checkIn?: string; checkOut?: string; reason: string },
  ) {
    return this.attendanceService.createCorrection(body)
  }

  @Get('corrections')
  findCorrections(@Query() query: Record<string, string | undefined>) {
    return this.attendanceService.findCorrections(query)
  }

  @Patch('corrections/:id/approve')
  approveCorrection(@Param('id') id: string) {
    return this.attendanceService.approveCorrection(id)
  }

  @Patch('corrections/:id/reject')
  rejectCorrection(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.attendanceService.rejectCorrection(id, body.reason)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.attendanceService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.attendanceService.remove(id)
  }
}
