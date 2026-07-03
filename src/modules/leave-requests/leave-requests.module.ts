import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { LeaveRequestsController } from './leave-requests.controller'
import { LeaveRequestsService } from './leave-requests.service'

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
})
export class LeaveRequestsModule {}
