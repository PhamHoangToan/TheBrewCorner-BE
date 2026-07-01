import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { TablesService } from './tables.service'

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.tablesService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tablesService.findOne(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.tablesService.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.tablesService.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tablesService.remove(id)
  }
}
