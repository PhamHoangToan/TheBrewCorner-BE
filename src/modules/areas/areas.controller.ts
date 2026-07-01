import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { AreasService } from './areas.service'

@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.areasService.findAll(query)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.areasService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.areasService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.areasService.remove(id)
  }
}
