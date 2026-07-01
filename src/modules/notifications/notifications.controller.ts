import { Controller, Get, Patch, Post, Param, Query, Body } from '@nestjs/common'
import { NotificationsService, NotifRole, NotifType } from './notifications.service'

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post('test')
  test(@Body() body: { role: NotifRole; title?: string; body?: string; type?: NotifType }) {
    return this.service.send({
      role: body.role,
      title: body.title ?? 'Test notification',
      body: body.body ?? 'Đây là thông báo test',
      type: body.type ?? 'ORDER_NEW',
    })
  }

  @Get()
  findAll(@Query('role') role: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.findByRole(role, Number(page), Number(limit))
  }

  @Get('unread-count')
  unreadCount(@Query('role') role: string) {
    return this.service.countUnread(role)
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.service.markRead(id)
  }

  @Patch('read-all')
  markAllRead(@Query('role') role: string) {
    return this.service.markAllRead(role)
  }
}
