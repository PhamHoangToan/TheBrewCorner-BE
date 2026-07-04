import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { TablesService } from './tables.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('TablesService', () => {
  let service: TablesService
  let prisma: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesService,
        {
          provide: PrismaService,
          useValue: {
            cafeTable: { findMany: jest.fn(), count: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
            order: { findMany: jest.fn(), updateMany: jest.fn() },
            area: { upsert: jest.fn() },
            $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg)),
          },
        },
      ],
    }).compile()

    service = module.get(TablesService)
    prisma = module.get(PrismaService)
  })

  describe('findAll', () => {
    it('trả về mọi order còn gắn bàn trừ order đã hủy (không loại order PAID)', async () => {
      prisma.cafeTable.findMany.mockResolvedValue([])
      prisma.cafeTable.count.mockResolvedValue(0)

      await service.findAll({})

      const call = prisma.cafeTable.findMany.mock.calls[0][0]
      expect(call.include.orders.where).toEqual({ status: { not: 'CANCELLED' } })
      expect(call.include.orders.include).toEqual({ items: true, invoice: true })
    })
  })

  describe('update — đặt bàn về trống (clearTableSession)', () => {
    it('chặn nếu còn order chưa thanh toán mà vẫn còn món chưa hủy/trả', async () => {
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'SERVED', invoice: null, items: [{ status: 'SERVED' }] },
      ])

      await expect(service.update('t1', { status: 'AVAILABLE' })).rejects.toThrow(BadRequestException)
      expect(prisma.cafeTable.update).not.toHaveBeenCalled()
    })

    it('cho đặt trống + gỡ tableId khi mọi món ĐÃ thanh toán VÀ ĐÃ phục vụ', async () => {
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'PAID', invoice: { status: 'PAID' }, items: [{ status: 'SERVED' }] },
      ])
      prisma.order.updateMany.mockResolvedValue({ count: 1 })
      prisma.cafeTable.update.mockResolvedValue({ id: 't1', status: 'AVAILABLE' })

      await service.update('t1', { status: 'AVAILABLE' })

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['o1'] } },
        data: { tableId: null },
      })
      expect(prisma.cafeTable.update).toHaveBeenCalled()
    })

    it('chặn nếu đã thanh toán nhưng còn món chưa phục vụ xong (barista chưa làm xong)', async () => {
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'PAID', invoice: { status: 'PAID' }, items: [{ status: 'PREPARING' }] },
      ])

      await expect(service.update('t1', { status: 'AVAILABLE' })).rejects.toThrow(BadRequestException)
      expect(prisma.cafeTable.update).not.toHaveBeenCalled()
    })

    it('order chưa trả nhưng mọi món đã hủy/trả → không chặn (không còn gì để thu)', async () => {
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'SENT', invoice: null, items: [{ status: 'CANCELLED' }, { status: 'RETURNED' }] },
      ])
      prisma.order.updateMany.mockResolvedValue({ count: 1 })
      prisma.cafeTable.update.mockResolvedValue({ id: 't1' })

      await service.update('t1', { status: 'AVAILABLE' })

      expect(prisma.cafeTable.update).toHaveBeenCalled()
    })

    it('không chạy clearTableSession khi update không đổi status về AVAILABLE (chỉ sửa tên bàn)', async () => {
      prisma.cafeTable.update.mockResolvedValue({ id: 't1', name: 'Bàn mới' })

      await service.update('t1', { name: 'Bàn mới' })

      expect(prisma.order.findMany).not.toHaveBeenCalled()
      expect(prisma.cafeTable.update).toHaveBeenCalled()
    })

    it('bàn không có order nào → đặt trống bình thường', async () => {
      prisma.order.findMany.mockResolvedValue([])
      prisma.cafeTable.update.mockResolvedValue({ id: 't1' })

      await service.update('t1', { status: 'AVAILABLE' })

      expect(prisma.order.updateMany).not.toHaveBeenCalled()
      expect(prisma.cafeTable.update).toHaveBeenCalled()
    })
  })
})
