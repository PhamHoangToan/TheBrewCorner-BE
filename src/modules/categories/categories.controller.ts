import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CategoriesService } from './categories.service'

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.categoriesService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.categoriesService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.categoriesService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id)
  }
}
