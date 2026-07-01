import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { AttendanceModule } from '../attendance/attendance.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PayrollController } from './payroll.controller'
import { PayrollService } from './payroll.service'

@Module({
  imports: [PrismaModule, AttendanceModule, NotificationsModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
