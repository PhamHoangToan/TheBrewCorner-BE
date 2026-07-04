import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ChatService } from './chat.service'
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth/auth.decorators'

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Public()
  @Post('threads')
  createThread(@Body() body: { customerId?: string; guestName?: string }) {
    return this.chatService.createThread(body)
  }

  @Public()
  @Get('threads/:id/messages')
  listMessages(@Param('id') id: string) {
    return this.chatService.listMessages(id)
  }

  @Public()
  @Post('threads/:id/messages')
  sendCustomerMessage(@Param('id') id: string, @Body() body: { content?: string }) {
    return this.chatService.sendCustomerMessage(id, String(body?.content ?? ''))
  }

  @Roles('ADMIN', 'CASHIER')
  @Get('threads')
  listThreads(@Query('status') status?: string) {
    return this.chatService.listThreads(status)
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('threads/:id/staff-reply')
  sendStaffReply(@Param('id') id: string, @Body() body: { content?: string }, @CurrentUser() user?: AuthUser) {
    return this.chatService.sendStaffReply(id, user?.id ?? '', String(body?.content ?? ''))
  }

  @Roles('ADMIN', 'CASHIER')
  @Patch('threads/:id/read')
  markRead(@Param('id') id: string) {
    return this.chatService.markRead(id)
  }

  @Roles('ADMIN', 'CASHIER')
  @Patch('threads/:id/close')
  closeThread(@Param('id') id: string) {
    return this.chatService.closeThread(id)
  }
}
