import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { OrdersService } from './orders.service'

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.ordersService.findAll(query)
  }

  @Get('returns')
  findReturnRequests() {
    return this.ordersService.findReturnRequests()
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.ordersService.findByCustomer(customerId)
  }

  @Patch('items/:itemId/approve-return')
  approveReturn(@Param('itemId') itemId: string) {
    return this.ordersService.approveReturn(itemId)
  }

  @Patch('items/:itemId/reject-return')
  rejectReturn(@Param('itemId') itemId: string, @Body() body: Record<string, string>) {
    return this.ordersService.rejectReturn(itemId, body.reason)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.ordersService.create(body)
  }

  @Post(':id/split')
  split(@Param('id') id: string, @Body() body: { itemIds?: string[] }) {
    return this.ordersService.split(id, body.itemIds ?? [])
  }

  @Post(':id/merge')
  merge(@Param('id') id: string, @Body() body: { sourceOrderId?: string }) {
    return this.ordersService.merge(id, body.sourceOrderId ?? '')
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.ordersService.update(id, body)
  }

  @Patch(':id/items/:itemId')
  updateItem(@Param('itemId') itemId: string, @Body() body: Record<string, unknown>) {
    return this.ordersService.updateItem(itemId, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id)
  }
}
