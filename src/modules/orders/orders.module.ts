import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { JobsModule } from '../jobs/jobs.module'
import { InvoicesModule } from '../invoices/invoices.module'
import { VouchersModule } from '../vouchers/vouchers.module'

@Module({
  imports: [NotificationsModule, JobsModule, InvoicesModule, VouchersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
