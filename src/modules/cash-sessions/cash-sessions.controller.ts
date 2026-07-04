import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { CashSessionsService } from './cash-sessions.service'
import { Roles } from '../../common/auth/auth.decorators'

@Roles('ADMIN', 'CASHIER')
@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly cashSessionsService: CashSessionsService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.cashSessionsService.findAll(query)
  }

  @Get('current')
  current(@Query('userId') userId: string) {
    return this.cashSessionsService.current(userId)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cashSessionsService.findOne(id)
  }

  @Post('open')
  open(@Body() body: Record<string, unknown>) {
    return this.cashSessionsService.open(body)
  }

  @Post(':id/close')
  close(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.cashSessionsService.close(id, body)
  }
}
