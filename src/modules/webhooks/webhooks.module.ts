import { Module } from '@nestjs/common'
import { InvoicesModule } from '../invoices/invoices.module'
import { CassoController } from './casso.controller'
import { CassoService } from './casso.service'

@Module({
  imports: [InvoicesModule],
  controllers: [CassoController],
  providers: [CassoService],
})
export class WebhooksModule {}
