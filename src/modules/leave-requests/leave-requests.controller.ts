import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { LeaveRequestsService } from './leave-requests.service'

@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  @Post()
  create(@Body() body: { userId: string; startDate: string; endDate: string; type: string; reason: string }) {
    return this.leaveRequestsService.create(body)
  }

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.leaveRequestsService.findAll(query)
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.leaveRequestsService.approve(id)
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.leaveRequestsService.reject(id, body.reason)
  }
}
