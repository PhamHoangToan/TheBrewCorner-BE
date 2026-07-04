import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { PurchaseOrdersService } from './purchase-orders.service'
import { Roles } from '../../common/auth/auth.decorators'

@Roles('ADMIN')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get('suggestions')
  suggestions(@Query('days') days?: string) {
    return this.purchaseOrdersService.suggestions(days ? Number(days) : 7)
  }

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.purchaseOrdersService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchaseOrdersService.findOne(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.purchaseOrdersService.create(body)
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.purchaseOrdersService.setStatus(id, body.status)
  }

  @Post(':id/receive')
  receive(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.purchaseOrdersService.receive(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.purchaseOrdersService.remove(id)
  }
}
