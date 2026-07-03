import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { VouchersService } from './vouchers.service'

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get('my/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.vouchersService.findByUser(userId)
  }

  @Post('validate')
  validate(@Body() body: Record<string, any>) {
    return this.vouchersService.validate(body)
  }
}
