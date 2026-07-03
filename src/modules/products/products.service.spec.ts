import { Test, TestingModule } from '@nestjs/testing'
import { ProductsService } from './products.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('ProductsService — setSoldOut (86 list)', () => {
  let service: ProductsService
  let prisma: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: { product: { update: jest.fn() } } },
      ],
    }).compile()

    service = module.get(ProductsService)
    prisma = module.get(PrismaService)
  })

  it('đánh dấu hết hàng: set soldOutUntil = 23:59:59.999 giờ VN (16:59:59.999 UTC) cùng ngày', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-03T08:00:00.000Z')) // 15:00 giờ VN
    prisma.product.update.mockResolvedValue({ id: 'p1', soldOutUntil: new Date() })

    await service.setSoldOut('p1', true)

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { soldOutUntil: new Date('2026-07-03T16:59:59.999Z') },
      include: { category: true },
    })
    jest.useRealTimers()
  })

  it('đánh dấu hết hàng gần nửa đêm VN vẫn tính đúng ngày VN (không lệch sang ngày UTC trước đó)', async () => {
    // 2026-07-03 23:30 giờ VN = 2026-07-03T16:30:00.000Z
    jest.useFakeTimers().setSystemTime(new Date('2026-07-03T16:30:00.000Z'))
    prisma.product.update.mockResolvedValue({})

    await service.setSoldOut('p1', true)

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { soldOutUntil: new Date('2026-07-03T16:59:59.999Z') },
    }))
    jest.useRealTimers()
  })

  it('bỏ đánh dấu hết hàng: set soldOutUntil = null', async () => {
    prisma.product.update.mockResolvedValue({ id: 'p1', soldOutUntil: null })

    await service.setSoldOut('p1', false)

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { soldOutUntil: null },
      include: { category: true },
    })
  })
})
