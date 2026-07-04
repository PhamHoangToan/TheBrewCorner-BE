import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { FinanceService } from './finance.service'
import { Roles } from '../../common/auth/auth.decorators'

@Roles('ADMIN', 'CASHIER')
@Controller('finance-transactions')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.financeService.findAll(query)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.financeService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.financeService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.financeService.remove(id)
  }
}
