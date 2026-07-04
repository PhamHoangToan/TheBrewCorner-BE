import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { JobsModule } from '../jobs/jobs.module'
import { InvoicesModule } from '../invoices/invoices.module'
import { VouchersModule } from '../vouchers/vouchers.module'
import { PromotionsModule } from '../promotions/promotions.module'
import { WalletModule } from '../wallet/wallet.module'

@Module({
  imports: [NotificationsModule, JobsModule, InvoicesModule, VouchersModule, PromotionsModule, WalletModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
