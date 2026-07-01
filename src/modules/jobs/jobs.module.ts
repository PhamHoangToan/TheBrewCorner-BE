import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AttendanceModule } from '../attendance/attendance.module'
import { PayrollModule } from '../payroll/payroll.module'
import { LowStockJob } from './low-stock.job'
import { PayrollJob } from './payroll.job'

@Module({
  imports: [PrismaModule, NotificationsModule, AttendanceModule, PayrollModule],
  providers: [LowStockJob, PayrollJob],
  exports: [LowStockJob, PayrollJob],
})
export class JobsModule {}
