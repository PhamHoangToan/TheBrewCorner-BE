import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { SuppliersService } from './suppliers.service'

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.suppliersService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.suppliersService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.suppliersService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(id)
  }
}
