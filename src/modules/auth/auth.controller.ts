import { Body, Controller, Get, Headers, Post } from '@nestjs/common'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: Record<string, unknown>, @Headers('x-client') client?: string) {
    return this.authService.login(body, client)
  }

  @Post('register')
  register(@Body() body: Record<string, unknown>) {
    return this.authService.register(body)
  }

  @Get('me')
  me() {
    return this.authService.devMe()
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email)
  }

  @Post('reset-password')
  resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword)
  }
}
