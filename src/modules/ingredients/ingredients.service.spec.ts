import { Test, TestingModule } from '@nestjs/testing'
import { IngredientsService } from './ingredients.service'
import { PrismaService } from '../../prisma/prisma.service'
import { LowStockJob } from '../jobs/low-stock.job'
import { SuppliersService } from '../suppliers/suppliers.service'

describe('IngredientsService — forecast()', () => {
  let service: IngredientsService
  let prisma: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientsService,
        { provide: PrismaService, useValue: { $queryRaw: jest.fn() } },
        { provide: LowStockJob, useValue: {} },
        { provide: SuppliersService, useValue: {} },
      ],
    }).compile()

    service = module.get(IngredientsService)
    prisma = module.get(PrismaService)
  })

  it('hasEnoughData = false và daysUntilStockout = null nếu chưa xuất kho lần nào (14 ngày gần nhất)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { id: 'ing-1', name: 'Trà xanh matcha', unit: 'kg', stockQuantity: 5, totalUsed: 0 },
    ])

    const result = await service.forecast()

    expect(result).toEqual([{
      ingredientId: 'ing-1',
      name: 'Trà xanh matcha',
      unit: 'kg',
      stockQuantity: 5,
      avgDailyUsage: 0,
      daysUntilStockout: null,
      predictedStockoutDate: null,
      hasEnoughData: false,
    }])
  })

  it('tính avgDailyUsage = totalUsed / 14 và daysUntilStockout = stockQuantity / avgDailyUsage', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { id: 'ing-2', name: 'Sữa tươi', unit: 'lít', stockQuantity: 21, totalUsed: 14 }, // 1 lít/ngày → còn 21 ngày
    ])

    const result = await service.forecast()

    expect(result[0]).toMatchObject({
      ingredientId: 'ing-2',
      avgDailyUsage: 1,
      daysUntilStockout: 21,
      hasEnoughData: true,
    })
    expect(result[0].predictedStockoutDate).not.toBeNull()
  })

  it('làm tròn avgDailyUsage và daysUntilStockout đúng theo spec (2 và 1 chữ số thập phân)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { id: 'ing-3', name: 'Đường trắng', unit: 'kg', stockQuantity: 10, totalUsed: 3 }, // 3/14 = 0.2142...
    ])

    const result = await service.forecast()

    expect(result[0].avgDailyUsage).toBe(0.21)
    expect(result[0].daysUntilStockout).toBe(46.7) // 10 / 0.214285... ≈ 46.666...
  })
})
