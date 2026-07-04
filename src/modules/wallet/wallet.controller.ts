import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common'
import { WalletService } from './wallet.service'
import { QueryParams } from '../../common/crud.types'
import { AuthUser, CurrentUser, Roles } from '../../common/auth/auth.decorators'

// Ví là dữ liệu tài chính cá nhân — chỉ chính chủ hoặc ADMIN mới được xem/thao tác.
const assertOwner = (user: AuthUser | undefined, userId: string) => {
  if (user?.role === 'ADMIN') return
  if (!user || user.id !== userId) throw new ForbiddenException('Không có quyền truy cập ví này')
}

@Roles('CUSTOMER', 'ADMIN')
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':userId')
  summary(@Param('userId') userId: string, @Query() query: QueryParams, @CurrentUser() user?: AuthUser) {
    assertOwner(user, userId)
    return this.walletService.summary(userId, query)
  }

  @Post(':userId/topup-confirm')
  topupConfirm(@Param('userId') userId: string, @Body() body: { code: string }, @CurrentUser() user?: AuthUser) {
    assertOwner(user, userId)
    return this.walletService.topupFromPending(userId, body.code)
  }
}
