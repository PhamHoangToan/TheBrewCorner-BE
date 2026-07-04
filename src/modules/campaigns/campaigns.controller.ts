import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { CampaignsService } from './campaigns.service'
import { Roles } from '../../common/auth/auth.decorators'

@Roles('ADMIN')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.campaignsService.findAll(query)
  }

  @Get('preview-count')
  previewCount(@Query('segment') segment: string) {
    return this.campaignsService.previewCount(segment)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.campaignsService.create(body)
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.campaignsService.send(id)
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.campaignsService.stats(id)
  }
}
