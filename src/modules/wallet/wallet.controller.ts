import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { WalletService } from './wallet.service'

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':userId')
  summary(@Param('userId') userId: string) {
    return this.walletService.summary(userId)
  }

  @Post(':userId/topup-confirm')
  topupConfirm(@Param('userId') userId: string, @Body() body: { code: string }) {
    return this.walletService.topupFromPending(userId, body.code)
  }
}
