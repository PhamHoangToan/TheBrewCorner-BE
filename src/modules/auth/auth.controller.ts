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
}
