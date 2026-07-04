import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PurchaseOrdersService } from './purchase-orders.service'
import { PrismaService } from '../../prisma/prisma.service'
import { IngredientsService } from '../ingredients/ingredients.service'

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService
  let prisma: any
  let ingredients: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        {
          provide: PrismaService,
          useValue: {
            purchaseOrder: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
            supplier: { findFirst: jest.fn() },
            $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
          },
        },
        { provide: IngredientsService, useValue: { forecast: jest.fn(), createStockImport: jest.fn() } },
      ],
    }).compile()
    service = module.get(PurchaseOrdersService)
    prisma = module.get(PrismaService)
    ingredients = module.get(IngredientsService)
  })

  describe('suggestions', () => {
    it('chỉ đề xuất nguyên liệu đủ dữ liệu và sắp hết trong ngưỡng', async () => {
      ingredients.forecast.mockResolvedValue([
        { ingredientId: 'a', name: 'Sữa', unit: 'lít', stockQuantity: 2, avgDailyUsage: 1, daysUntilStockout: 2, hasEnoughData: true },
        { ingredientId: 'b', name: 'Đường', unit: 'kg', stockQuantity: 100, avgDailyUsage: 1, daysUntilStockout: 100, hasEnoughData: true },
        { ingredientId: 'c', name: 'X', unit: 'kg', stockQuantity: 0, avgDailyUsage: 0, daysUntilStockout: null, hasEnoughData: false },
      ])
      const res = await service.suggestions(7)
      expect(res).toHaveLength(1)
      expect(res[0].ingredientId).toBe('a')
      // đủ dùng 14 ngày (14) trừ tồn 2 = 12
      expect(res[0].suggestedQty).toBe(12)
    })
  })

  describe('create', () => {
    it('báo lỗi nếu không có mặt hàng', async () => {
      await expect(service.create({ supplierName: 'NCC', items: [] })).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu thiếu nhà cung cấp', async () => {
      await expect(service.create({ items: [{ ingredientName: 'Sữa', quantity: 1 }] })).rejects.toThrow(BadRequestException)
    })

    it('tạo PO với NCC hợp lệ', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 's1', name: 'NCC A' })
      prisma.purchaseOrder.create.mockResolvedValue({ id: 'po1' })
      await service.create({ supplierId: 's1', items: [{ ingredientName: 'Sữa', quantity: 5, unit: 'lít', estPrice: 30000 }] })
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ supplierId: 's1', supplierName: 'NCC A', status: 'DRAFT' }),
      }))
    })
  })

  describe('receive', () => {
    it('tạo phiếu nhập từ PO rồi đánh dấu RECEIVED', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po1', code: 'PO-1', status: 'SENT', supplierId: 's1', supplierName: 'NCC A',
        items: [{ ingredientId: 'a', ingredientName: 'Sữa', quantity: 5, unit: 'lít', estPrice: 30000 }],
      })
      ingredients.createStockImport.mockResolvedValue({ id: 'imp1' })
      prisma.purchaseOrder.update.mockResolvedValue({})

      await service.receive('po1', { createdById: 'u1' })

      expect(ingredients.createStockImport).toHaveBeenCalledWith(expect.objectContaining({ supplierId: 's1', supplierName: 'NCC A' }))
      expect(prisma.purchaseOrder.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'po1' },
        data: expect.objectContaining({ status: 'RECEIVED', stockImportId: 'imp1' }),
      }))
    })

    it('không nhận lại đơn đã RECEIVED', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({ id: 'po1', status: 'RECEIVED', items: [] })
      await expect(service.receive('po1')).rejects.toThrow(BadRequestException)
    })

    it('404 nếu PO không tồn tại', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(null)
      await expect(service.receive('nope')).rejects.toThrow(NotFoundException)
    })
  })
})
