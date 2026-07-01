import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { PromotionsService } from './promotions.service'

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.promotionsService.findAll(query)
  }

  @Get('valid')
  findValid(@Query('totalAmount') totalAmount?: string) {
    return this.promotionsService.findValid(Number(totalAmount ?? 0))
  }

  @Post('validate')
  validate(@Body() body: Record<string, unknown>) {
    return this.promotionsService.validate(body)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.promotionsService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.promotionsService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(id)
  }
}
