import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ReviewsService } from './reviews.service'

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

  @Get('order/:orderId')
  findByOrder(@Param('orderId') orderId: string, @Query('userId') userId?: string) {
    return this.reviewsService.findByOrder(orderId, userId)
  }

  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string) {
    return this.reviewsService.findByProduct(productId)
  }
}
