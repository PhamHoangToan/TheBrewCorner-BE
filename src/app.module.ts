import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from './prisma/prisma.module'
import { ActivityLogModule } from './modules/activity-log/activity-log.module'
import { ActivityLogInterceptor } from './common/interceptors/activity-log.interceptor'
import { RolesGuard } from './common/auth/roles.guard'
import { AuthModule } from './modules/auth/auth.module'
import { UploadModule } from './modules/upload/upload.module'
import { AreasModule } from './modules/areas/areas.module'
import { CategoriesModule } from './modules/categories/categories.module'
import { FinanceModule } from './modules/finance/finance.module'
import { IngredientsModule } from './modules/ingredients/ingredients.module'
import { InvoicesModule } from './modules/invoices/invoices.module'
import { OrdersModule } from './modules/orders/orders.module'
import { ProductsModule } from './modules/products/products.module'
import { PromotionsModule } from './modules/promotions/promotions.module'
import { ReportsModule } from './modules/reports/reports.module'
import { ShiftsModule } from './modules/shifts/shifts.module'
import { TablesModule } from './modules/tables/tables.module'
import { UsersModule } from './modules/users/users.module'
import { VouchersModule } from './modules/vouchers/vouchers.module'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { JobsModule } from './modules/jobs/jobs.module'
import { AttendanceModule } from './modules/attendance/attendance.module'
import { PayrollModule } from './modules/payroll/payroll.module'
import { LeaveRequestsModule } from './modules/leave-requests/leave-requests.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'
import { WebhooksModule } from './modules/webhooks/webhooks.module'
import { PendingTransfersModule } from './modules/pending-transfers/pending-transfers.module'
import { ReservationsModule } from './modules/reservations/reservations.module'
import { ReviewsModule } from './modules/reviews/reviews.module'
import { SuppliersModule } from './modules/suppliers/suppliers.module'
import { TrashModule } from './modules/trash/trash.module'
import { CashSessionsModule } from './modules/cash-sessions/cash-sessions.module'
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module'
import { WalletModule } from './modules/wallet/wallet.module'
import { CampaignsModule } from './modules/campaigns/campaigns.module'
import { PushModule } from './modules/push/push.module'
import { ChatModule } from './modules/chat/chat.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'brew-dev-secret-change-me',
      signOptions: { expiresIn: process.env.JWT_EXPIRES ?? '30d' },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    ActivityLogModule,
    AuthModule,
    NotificationsModule,
    DashboardModule,
    WebhooksModule,
    AttendanceModule,
    PayrollModule,
    LeaveRequestsModule,
    JobsModule,
    UploadModule,
    AreasModule,
    CategoriesModule,
    FinanceModule,
    IngredientsModule,
    InvoicesModule,
    OrdersModule,
    PendingTransfersModule,
    ReservationsModule,
    ProductsModule,
    PromotionsModule,
    ReportsModule,
    ReviewsModule,
    ShiftsModule,
    SuppliersModule,
    TablesModule,
    TrashModule,
    UsersModule,
    VouchersModule,
    CashSessionsModule,
    PurchaseOrdersModule,
    WalletModule,
    CampaignsModule,
    PushModule,
    ChatModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor },
  ],
})
export class AppModule {}
