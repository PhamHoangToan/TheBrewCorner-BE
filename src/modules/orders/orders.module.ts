import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { JobsModule } from '../jobs/jobs.module'
import { InvoicesModule } from '../invoices/invoices.module'

@Module({
  imports: [NotificationsModule, JobsModule, InvoicesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
