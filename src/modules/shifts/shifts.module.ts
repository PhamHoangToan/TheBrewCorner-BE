import { Module } from '@nestjs/common'
import { AttendanceModule } from '../attendance/attendance.module'
import { ShiftsController } from './shifts.controller'
import { ShiftsService } from './shifts.service'

@Module({
  imports: [AttendanceModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}
