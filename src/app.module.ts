import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { PrismaModule } from './prisma/prisma.module'
import { ActivityLogModule } from './modules/activity-log/activity-log.module'
import { ActivityLogInterceptor } from './common/interceptors/activity-log.interceptor'
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
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { JobsModule } from './modules/jobs/jobs.module'
import { AttendanceModule } from './modules/attendance/attendance.module'
import { PayrollModule } from './modules/payroll/payroll.module'
import { LeaveRequestsModule } from './modules/leave-requests/leave-requests.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'
import { WebhooksModule } from './modules/webhooks/webhooks.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
    ProductsModule,
    PromotionsModule,
    ReportsModule,
    ShiftsModule,
    TablesModule,
    UsersModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor }],
})
export class AppModule {}
