import { Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './campaigns.service'
import { MailModule } from '../mail/mail.module'
import { PushModule } from '../push/push.module'

@Module({
  imports: [MailModule, PushModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
