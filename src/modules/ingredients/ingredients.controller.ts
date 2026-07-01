import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { IngredientsService } from './ingredients.service'

@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.ingredientsService.findAll(query)
  }

  @Get('stock-stats')
  stockStats() {
    return this.ingredientsService.stockStats()
  }

  @Get('forecast')
  forecast() {
    return this.ingredientsService.forecast()
  }

  @Get('stock-imports/list')
  stockImports(@Query() query: Record<string, string | undefined>) {
    return this.ingredientsService.stockImports(query)
  }

  @Post('stock-imports')
  createStockImport(@Body() body: Record<string, unknown>) {
    return this.ingredientsService.createStockImport(body)
  }

  @Get('stock-exports/list')
  stockExports(@Query() query: Record<string, string | undefined>) {
    return this.ingredientsService.stockExports(query)
  }

  @Post('stock-exports')
  createStockExport(@Body() body: Record<string, unknown>) {
    return this.ingredientsService.createStockExport(body)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ingredientsService.findOne(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.ingredientsService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.ingredientsService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ingredientsService.remove(id)
  }
}
