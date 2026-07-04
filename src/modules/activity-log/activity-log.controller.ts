import { Controller, Get, Query } from '@nestjs/common'
import { ActivityLogService } from './activity-log.service'
import { Roles } from '../../common/auth/auth.decorators'

@Roles('ADMIN')
@Controller('activity-logs')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.activityLogService.findAll(query)
  }

  @Get('stats')
  stats(@Query() query: { from?: string; to?: string }) {
    return this.activityLogService.stats(query)
  }
}
