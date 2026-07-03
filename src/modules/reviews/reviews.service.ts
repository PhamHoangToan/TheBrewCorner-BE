import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  // Khách chỉ được đánh giá món trong order ĐÃ THANH TOÁN của chính mình, mỗi món 1 lần/order
  async create(body: { orderId?: string; productId?: string; userId?: string; rating?: number; comment?: string }) {
    const { orderId, productId, userId } = body
    const rating = Math.round(Number(body.rating ?? 0))
    if (!orderId || !productId || !userId) throw new BadRequestException('Thiếu orderId/productId/userId')
    if (rating < 1 || rating > 5) throw new BadRequestException('Điểm đánh giá phải từ 1 đến 5 sao')

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { items: { select: { productId: true } }, invoice: { select: { status: true } } },
    })
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng')
    if (order.customerId !== userId) throw new BadRequestException('Bạn chỉ đánh giá được đơn của chính mình')
    const isPaid = order.status === 'PAID' || order.invoice?.status === 'PAID'
    if (!isPaid) throw new BadRequestException('Chỉ đánh giá được sau khi đơn đã thanh toán')
    if (!order.items.some((item) => item.productId === productId)) {
      throw new BadRequestException('Món này không có trong đơn hàng')
    }

    const existing = await this.prisma.productReview.findFirst({ where: { orderId, productId, userId } })
    if (existing) throw new BadRequestException('Bạn đã đánh giá món này rồi')

    return this.prisma.productReview.create({
      data: {
        orderId,
        productId,
        userId,
        rating,
        comment: body.comment ? String(body.comment).slice(0, 500) : null,
      },
    })
  }

  async findByProduct(productId: string) {
    return this.prisma.productReview.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    })
  }

  // Điểm trung bình + số lượt đánh giá của tất cả sản phẩm (cho trang Menu)
  async summary() {
    const groups = await this.prisma.productReview.groupBy({
      by: ['productId'],
      _avg: { rating: true },
      _count: true,
    })
    return groups.map((g) => ({
      productId: g.productId,
      avgRating: Math.round((g._avg.rating ?? 0) * 10) / 10,
      count: g._count,
    }))
  }

  // Các món trong 1 order mà user này đã đánh giá (để FE ẩn nút đánh giá)
  async findByOrder(orderId: string, userId?: string) {
    return this.prisma.productReview.findMany({
      where: { orderId, ...(userId ? { userId } : {}) },
      select: { productId: true, rating: true, comment: true },
    })
  }
}
