import { Controller, Get, Query } from '@nestjs/common'
import { ActivityLogService } from './activity-log.service'

@Controller('activity-logs')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.activityLogService.findAll(query)
  }
}
