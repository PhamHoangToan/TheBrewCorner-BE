import { Test, TestingModule } from '@nestjs/testing'
import { ReportsService } from './reports.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('ReportsService', () => {
  let service: ReportsService
  let prisma: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: PrismaService,
          useValue: {
            invoice: { findMany: jest.fn() },
            orderItem: { groupBy: jest.fn() },
            product: { findMany: jest.fn() },
            stockImportItem: { findMany: jest.fn() },
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile()

    service = module.get(ReportsService)
    prisma = module.get(PrismaService)
  })

  describe('revenue', () => {
    it('không filter theo paidAt nếu không truyền startDate/endDate', async () => {
      prisma.invoice.findMany.mockResolvedValue([])
      await service.revenue({})
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { status: 'PAID' },
      }))
    })

    it('filter theo khoảng paidAt khi có startDate/endDate', async () => {
      prisma.invoice.findMany.mockResolvedValue([])
      await service.revenue({ startDate: '2026-07-01', endDate: '2026-07-10' })
      const call = prisma.invoice.findMany.mock.calls[0][0]
      expect(call.where.status).toBe('PAID')
      expect(call.where.paidAt.gte).toEqual(new Date('2026-07-01T00:00:00'))
      expect(call.where.paidAt.lte).toEqual(new Date('2026-07-10T23:59:59.999'))
    })

    it('map totalAmount về Number và ưu tiên paidAt, fallback issuedAt', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { code: 'HD-1', totalAmount: 50000, paidAt: new Date('2026-07-05'), issuedAt: new Date('2026-07-04') },
        { code: 'HD-2', totalAmount: 30000, paidAt: null, issuedAt: new Date('2026-07-06') },
      ])

      const result = await service.revenue({})

      expect(result).toEqual([
        { code: 'HD-1', date: new Date('2026-07-05'), totalAmount: 50000 },
        { code: 'HD-2', date: new Date('2026-07-06'), totalAmount: 30000 },
      ])
    })
  })

  describe('sales', () => {
    it('không filter where nếu không có khoảng ngày', async () => {
      prisma.orderItem.groupBy.mockResolvedValue([])
      await service.sales({})
      expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }))
    })

    it('filter theo order.invoice.paidAt khi có khoảng ngày', async () => {
      prisma.orderItem.groupBy.mockResolvedValue([])
      await service.sales({ startDate: '2026-07-01', endDate: '2026-07-10' })
      const call = prisma.orderItem.groupBy.mock.calls[0][0]
      expect(call.where.order.invoice.status).toBe('PAID')
      expect(call.where.order.invoice.paidAt.gte).toEqual(new Date('2026-07-01T00:00:00'))
    })

    it('map quantity/revenue về number, mặc định 0 nếu thiếu', async () => {
      prisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'p1', productName: 'Cà phê sữa', _sum: { quantity: 10, totalPrice: 250000 } },
        { productId: 'p2', productName: 'Trà đào', _sum: { quantity: null, totalPrice: null } },
      ])

      const result = await service.sales({})

      expect(result).toEqual([
        { productId: 'p1', productName: 'Cà phê sữa', quantity: 10, revenue: 250000 },
        { productId: 'p2', productName: 'Trà đào', quantity: 0, revenue: 0 },
      ])
    })
  })

  describe('topProducts', () => {
    it('giới hạn số lượng theo limit (mặc định 10)', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({
        productId: `p${i}`, productName: `Món ${i}`, _sum: { quantity: 1, totalPrice: 1000 },
      }))
      prisma.orderItem.groupBy.mockResolvedValue(items)

      const result = await service.topProducts({})

      expect(result).toHaveLength(10)
    })

    it('tôn trọng limit tùy chỉnh', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({
        productId: `p${i}`, productName: `Món ${i}`, _sum: { quantity: 1, totalPrice: 1000 },
      }))
      prisma.orderItem.groupBy.mockResolvedValue(items)

      const result = await service.topProducts({ limit: '3' })

      expect(result).toHaveLength(3)
    })
  })

  describe('revenueByHour', () => {
    it('trả về đủ 24 khung giờ, giờ không có dữ liệu mặc định 0', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { hour: 9, revenue: 150000, orderCount: 3 },
        { hour: 14, revenue: 90000, orderCount: 2 },
      ])

      const result = await service.revenueByHour({ startDate: '2026-07-01', endDate: '2026-07-10' })

      expect(result).toHaveLength(24)
      expect(result[9]).toEqual({ hour: 9, revenue: 150000, orderCount: 3 })
      expect(result[14]).toEqual({ hour: 14, revenue: 90000, orderCount: 2 })
      expect(result[0]).toEqual({ hour: 0, revenue: 0, orderCount: 0 })
      expect(result[23]).toEqual({ hour: 23, revenue: 0, orderCount: 0 })
    })

    it('dùng mặc định 30 ngày gần nhất nếu không truyền khoảng ngày', async () => {
      prisma.$queryRaw.mockResolvedValue([])
      const result = await service.revenueByHour({})
      expect(result).toHaveLength(24)
      expect(prisma.$queryRaw).toHaveBeenCalled()
    })
  })

  describe('profit', () => {
    const product = (overrides: Partial<any> = {}) => ({
      id: 'p1',
      name: 'Cà phê sữa',
      price: 30000,
      recipes: [
        {
          ingredientId: 'ing-1',
          quantity: 100,
          wastePercent: 10,
          unit: 'ml',
          ingredient: { id: 'ing-1', unit: 'chai', usagePerUnit: 1000 },
        },
      ],
      ...overrides,
    })

    it('tính giá vốn = lượng recipe (kèm hao hụt) quy đổi ra đơn vị kho × giá nhập gần nhất', async () => {
      prisma.product.findMany.mockResolvedValue([product()])
      prisma.stockImportItem.findMany.mockResolvedValue([
        { ingredientId: 'ing-1', unitPrice: 100000, stockImport: { createdAt: new Date('2026-07-01') } },
      ])
      prisma.orderItem.groupBy.mockResolvedValue([])

      const result = await service.profit({})

      // 100ml * 1.1 hao hụt = 110ml → 110/1000 = 0.11 chai × 100.000đ = 11.000đ
      expect(result.items[0]).toMatchObject({
        productId: 'p1',
        cost: 11000,
        margin: 19000,
        marginPercent: 63,
        hasRecipe: true,
      })
    })

    it('dùng giá nhập gần nhất (lô mới nhất) khi có nhiều lần nhập cho cùng nguyên liệu', async () => {
      prisma.product.findMany.mockResolvedValue([product()])
      prisma.stockImportItem.findMany.mockResolvedValue([
        { ingredientId: 'ing-1', unitPrice: 120000, stockImport: { createdAt: new Date('2026-07-05') } },
        { ingredientId: 'ing-1', unitPrice: 100000, stockImport: { createdAt: new Date('2026-07-01') } },
      ])
      prisma.orderItem.groupBy.mockResolvedValue([])

      const result = await service.profit({})

      // orderBy createdAt desc → lô đầu tiên trong mảng (120.000đ) được lấy làm giá gần nhất
      expect(result.items[0].cost).toBe(13200) // 0.11 * 120.000
    })

    it('cost = 0 và hasRecipe = false nếu sản phẩm chưa có công thức', async () => {
      prisma.product.findMany.mockResolvedValue([product({ recipes: [] })])
      prisma.stockImportItem.findMany.mockResolvedValue([])
      prisma.orderItem.groupBy.mockResolvedValue([])

      const result = await service.profit({})

      expect(result.items[0]).toMatchObject({ cost: 0, hasRecipe: false, margin: 30000 })
    })

    it('gắn soldQty/revenue từ sales() và tính profit = revenue - totalCost', async () => {
      prisma.product.findMany.mockResolvedValue([product()])
      prisma.stockImportItem.findMany.mockResolvedValue([
        { ingredientId: 'ing-1', unitPrice: 100000, stockImport: { createdAt: new Date('2026-07-01') } },
      ])
      prisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'p1', productName: 'Cà phê sữa', _sum: { quantity: 10, totalPrice: 300000 } },
      ])

      const result = await service.profit({})

      // totalCost = 11.000 * 10 = 110.000; profit = 300.000 - 110.000
      expect(result.items[0]).toMatchObject({ soldQty: 10, revenue: 300000, totalCost: 110000, profit: 190000 })
      expect(result.summary).toEqual({ totalRevenue: 300000, totalCost: 110000, totalProfit: 190000 })
    })

    it('sắp xếp items theo profit giảm dần', async () => {
      prisma.product.findMany.mockResolvedValue([
        product({ id: 'p1', name: 'Ít lãi' }),
        product({ id: 'p2', name: 'Nhiều lãi' }),
      ])
      prisma.stockImportItem.findMany.mockResolvedValue([])
      prisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'p1', productName: 'Ít lãi', _sum: { quantity: 1, totalPrice: 10000 } },
        { productId: 'p2', productName: 'Nhiều lãi', _sum: { quantity: 1, totalPrice: 100000 } },
      ])

      const result = await service.profit({})

      expect(result.items.map((r: any) => r.productId)).toEqual(['p2', 'p1'])
    })
  })
})
