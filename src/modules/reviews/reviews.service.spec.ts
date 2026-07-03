import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { ReviewsService } from './reviews.service'
import { PrismaService } from '../../prisma/prisma.service'

const makeOrder = (overrides: Partial<any> = {}) => ({
  id: 'order-1',
  customerId: 'user-1',
  status: 'PAID',
  items: [{ productId: 'prod-1' }],
  invoice: { status: 'PAID' },
  ...overrides,
})

describe('ReviewsService', () => {
  let service: ReviewsService
  let prisma: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: PrismaService,
          useValue: {
            order: { findFirst: jest.fn() },
            productReview: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
          },
        },
      ],
    }).compile()

    service = module.get(ReviewsService)
    prisma = module.get(PrismaService)
  })

  describe('create', () => {
    it('báo lỗi nếu thiếu orderId/productId/userId', async () => {
      await expect(service.create({ productId: 'prod-1', userId: 'user-1', rating: 5 })).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu rating ngoài khoảng 1-5', async () => {
      await expect(service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 0 })).rejects.toThrow(BadRequestException)
      await expect(service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 6 })).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi NotFoundException nếu không tìm thấy order', async () => {
      prisma.order.findFirst.mockResolvedValue(null)
      await expect(service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 5 }))
        .rejects.toThrow(NotFoundException)
    })

    it('báo lỗi nếu order không thuộc về user này', async () => {
      prisma.order.findFirst.mockResolvedValue(makeOrder({ customerId: 'other-user' }))
      await expect(service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 5 }))
        .rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu order chưa thanh toán (status khác PAID và invoice khác PAID)', async () => {
      prisma.order.findFirst.mockResolvedValue(makeOrder({ status: 'SERVED', invoice: { status: 'PENDING' } }))
      await expect(service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 5 }))
        .rejects.toThrow(BadRequestException)
    })

    it('cho phép đánh giá nếu order.status = PAID dù không có invoice', async () => {
      prisma.order.findFirst.mockResolvedValue(makeOrder({ status: 'PAID', invoice: null }))
      prisma.productReview.findFirst.mockResolvedValue(null)
      prisma.productReview.create.mockResolvedValue({ id: 'rev-1' })

      await service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 5 })

      expect(prisma.productReview.create).toHaveBeenCalled()
    })

    it('báo lỗi nếu món không có trong đơn hàng', async () => {
      prisma.order.findFirst.mockResolvedValue(makeOrder({ items: [{ productId: 'prod-khac' }] }))
      await expect(service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 5 }))
        .rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu đã đánh giá món này trong order rồi', async () => {
      prisma.order.findFirst.mockResolvedValue(makeOrder())
      prisma.productReview.findFirst.mockResolvedValue({ id: 'rev-existing' })
      await expect(service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 5 }))
        .rejects.toThrow(BadRequestException)
    })

    it('tạo review thành công, làm tròn rating và cắt comment 500 ký tự', async () => {
      prisma.order.findFirst.mockResolvedValue(makeOrder())
      prisma.productReview.findFirst.mockResolvedValue(null)
      prisma.productReview.create.mockResolvedValue({ id: 'rev-1' })
      const longComment = 'a'.repeat(600)

      await service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 4.6, comment: longComment })

      expect(prisma.productReview.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          productId: 'prod-1',
          userId: 'user-1',
          rating: 5,
          comment: 'a'.repeat(500),
        },
      })
    })

    it('comment = null nếu không truyền', async () => {
      prisma.order.findFirst.mockResolvedValue(makeOrder())
      prisma.productReview.findFirst.mockResolvedValue(null)
      prisma.productReview.create.mockResolvedValue({ id: 'rev-1' })

      await service.create({ orderId: 'order-1', productId: 'prod-1', userId: 'user-1', rating: 5 })

      expect(prisma.productReview.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ comment: null }),
      }))
    })
  })

  describe('summary', () => {
    it('tính avgRating làm tròn 1 chữ số thập phân và count từ groupBy', async () => {
      prisma.productReview.groupBy.mockResolvedValue([
        { productId: 'p1', _avg: { rating: 4.666 }, _count: 3 },
        { productId: 'p2', _avg: { rating: null }, _count: 0 },
      ])

      const result = await service.summary()

      expect(result).toEqual([
        { productId: 'p1', avgRating: 4.7, count: 3 },
        { productId: 'p2', avgRating: 0, count: 0 },
      ])
    })
  })

  describe('findByOrder', () => {
    it('lọc theo orderId và userId khi có truyền userId', async () => {
      prisma.productReview.findMany.mockResolvedValue([])
      await service.findByOrder('order-1', 'user-1')
      expect(prisma.productReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { orderId: 'order-1', userId: 'user-1' },
      }))
    })

    it('chỉ lọc theo orderId nếu không truyền userId', async () => {
      prisma.productReview.findMany.mockResolvedValue([])
      await service.findByOrder('order-1')
      expect(prisma.productReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { orderId: 'order-1' },
      }))
    })
  })
})
