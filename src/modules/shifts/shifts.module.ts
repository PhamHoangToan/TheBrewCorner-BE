import { Module } from '@nestjs/common'
import { AttendanceModule } from '../attendance/attendance.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { ShiftsController } from './shifts.controller'
import { ShiftsService } from './shifts.service'

@Module({
  imports: [AttendanceModule, NotificationsModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}
