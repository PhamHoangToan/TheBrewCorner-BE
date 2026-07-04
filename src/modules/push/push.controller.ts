import { Body, Controller, Post } from '@nestjs/common'
import { PushService } from './push.service'

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('register-device')
  register(@Body() body: { userId: string; token: string }) {
    return this.pushService.registerToken(body.userId, body.token)
  }

  @Post('unregister-device')
  unregister(@Body() body: { userId: string; token: string }) {
    return this.pushService.removeToken(body.userId, body.token)
  }
}
