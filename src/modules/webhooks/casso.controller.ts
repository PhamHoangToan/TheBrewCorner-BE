import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CassoService } from './casso.service'

@Controller('webhooks')
export class CassoController {
  constructor(
    private readonly cassoService: CassoService,
    private readonly configService: ConfigService,
  ) {}

  @Post('casso')
  @HttpCode(200)
  async handle(
    @Body() body: any,
    @Headers('x-api-key') apiKey?: string,
  ) {
    const secret = this.configService.get<string>('CASSO_API_KEY')
    if (!secret || apiKey !== secret) {
      throw new UnauthorizedException('Invalid API key')
    }
    return this.cassoService.handleWebhook(body)
  }
}
