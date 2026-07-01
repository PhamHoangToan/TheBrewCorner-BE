import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ReservationsService } from './reservations.service'

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(@Body() body: Record<string, any>) {
    return this.reservationsService.create(body)
  }

  @Get('my/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.reservationsService.findByCustomer(customerId)
  }

  @Get()
  findAll(@Query() query: { status?: string; date?: string }) {
    return this.reservationsService.findAll(query)
  }

  @Patch(':id/confirm')
  confirm(@Param('id') id: string, @Body() body: { tableId?: string }) {
    return this.reservationsService.confirm(id, body?.tableId)
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.reservationsService.cancel(id)
  }
}
