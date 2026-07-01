import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: Record<string, unknown>) {
    return this.authService.login(body)
  }

  @Post('register')
  register(@Body() body: Record<string, unknown>) {
    return this.authService.register(body)
  }

  @Get('me')
  me() {
    return this.authService.devMe()
  }
}
