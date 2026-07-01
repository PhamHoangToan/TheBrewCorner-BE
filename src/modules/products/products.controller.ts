import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { ProductsService } from './products.service'

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.productsService.findAll(query)
  }

  @Get(':id/recipes')
  getRecipes(@Param('id') id: string) {
    return this.productsService.getRecipes(id)
  }

  @Put(':id/recipes')
  setRecipes(@Param('id') id: string, @Body() body: { items: Array<{ ingredientId: string; quantity: number; wastePercent?: number; unit: string }> }) {
    return this.productsService.setRecipes(id, body.items ?? [])
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.productsService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.productsService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id)
  }
}
