import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { InvoicesService } from './invoices.service'
import { Roles } from '../../common/auth/auth.decorators'

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.invoicesService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.invoicesService.create(body)
  }

  @Post(':id/payments')
  pay(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.invoicesService.pay(id, body)
  }

  // Hoàn tiền — chỉ thu ngân/admin
  @Roles('ADMIN', 'CASHIER')
  @Post(':id/refund')
  refund(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.invoicesService.refund(id, body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.invoicesService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.invoicesService.remove(id)
  }
}
