import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ShiftsService } from './shifts.service'

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.shiftsService.findAll(query)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.shiftsService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.shiftsService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.shiftsService.remove(id)
  }

  @Get('requests')
  requests(@Query() query: Record<string, string | undefined>) {
    return this.shiftsService.requests(query)
  }

  @Post('requests')
  createRequest(@Body() body: Record<string, unknown>) {
    return this.shiftsService.createRequest(body)
  }

  @Patch('requests/:id/approve')
  approveRequest(@Param('id') id: string) {
    return this.shiftsService.approveRequest(id)
  }

  @Patch('requests/:id/reject')
  rejectRequest(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.shiftsService.rejectRequest(id, body.reason ?? '')
  }

  @Get('assignments')
  assignments(@Query() query: Record<string, string | undefined>) {
    return this.shiftsService.assignments(query)
  }

  @Post('assignments')
  createAssignment(@Body() body: Record<string, unknown>) {
    return this.shiftsService.createAssignment(body)
  }

  @Patch('assignments/:id')
  updateAssignment(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.shiftsService.updateAssignment(id, body)
  }

  @Delete('assignments/:id')
  removeAssignment(@Param('id') id: string) {
    return this.shiftsService.removeAssignment(id)
  }
}
