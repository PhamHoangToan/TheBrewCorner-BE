import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { PendingTransfersService } from './pending-transfers.service'

@Controller('pending-transfers')
export class PendingTransfersController {
  constructor(private readonly pendingTransfersService: PendingTransfersService) {}

  @Post()
  create(@Body() body: { amount: number }) {
    return this.pendingTransfersService.create(Number(body.amount))
  }

  @Get(':code')
  findByCode(@Param('code') code: string) {
    return this.pendingTransfersService.findByCode(code)
  }
}
