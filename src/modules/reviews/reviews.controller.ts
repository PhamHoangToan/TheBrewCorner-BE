import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ReviewsService } from './reviews.service'
import { Roles } from '../../common/auth/auth.decorators'

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  create(@Body() body: Record<string, any>) {
    return this.reviewsService.create(body)
  }

  @Get('summary')
  summary() {
    return this.reviewsService.summary()
  }

  @Roles('ADMIN')
  @Get()
  findAll(@Query() query: Record<string, string | undefined>) {
    return this.reviewsService.findAll(query)
  }

  @Get('order/:orderId')
  findByOrder(@Param('orderId') orderId: string, @Query('userId') userId?: string) {
    return this.reviewsService.findByOrder(orderId, userId)
  }

  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string) {
    return this.reviewsService.findByProduct(productId)
  }

  @Roles('ADMIN')
  @Patch(':id/hide')
  setHidden(@Param('id') id: string, @Body() body: { hidden?: boolean }) {
    return this.reviewsService.setHidden(id, !!body?.hidden)
  }

  @Roles('ADMIN')
  @Patch(':id/reply')
  reply(@Param('id') id: string, @Body() body: { reply?: string }) {
    return this.reviewsService.reply(id, String(body?.reply ?? ''))
  }
}
