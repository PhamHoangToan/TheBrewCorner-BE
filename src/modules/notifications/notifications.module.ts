import { Module } from '@nestjs/common'
import { NotificationsGateway } from './notifications.gateway'
import { NotificationsService } from './notifications.service'
import { NotificationsController } from './notifications.controller'
import { PrismaModule } from '../../prisma/prisma.module'
import { PushModule } from '../push/push.module'

@Module({
  imports: [PrismaModule, PushModule],
  providers: [NotificationsGateway, NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
