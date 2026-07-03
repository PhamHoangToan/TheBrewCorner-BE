import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { VouchersService } from './vouchers.service'
import { PrismaService } from '../../prisma/prisma.service'

const makeVoucher = (overrides: Partial<any> = {}) => ({
  id: 'v1',
  code: 'BDAY-ABC123',
  userId: 'user-1',
  status: 'ACTIVE',
  discountPercent: 15,
  minOrderAmount: 0,
  expiresAt: new Date('2099-01-01'),
  ...overrides,
})

describe('VouchersService', () => {
  let service: VouchersService
  let prisma: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VouchersService,
        {
          provide: PrismaService,
          useValue: {
            personalVoucher: {
              updateMany: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile()

    service = module.get(VouchersService)
    prisma = module.get(PrismaService)
  })

  describe('findByUser', () => {
    it('tự chuyển voucher ACTIVE quá hạn thành EXPIRED trước khi trả về danh sách', async () => {
      prisma.personalVoucher.updateMany.mockResolvedValue({ count: 1 })
      prisma.personalVoucher.findMany.mockResolvedValue([])

      await service.findByUser('user-1')

      expect(prisma.personalVoucher.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'ACTIVE', expiresAt: { lt: expect.any(Date) } },
        data: { status: 'EXPIRED' },
      })
    })

    it('trả về { items } sắp xếp status asc rồi expiresAt desc', async () => {
      const items = [makeVoucher()]
      prisma.personalVoucher.updateMany.mockResolvedValue({ count: 0 })
      prisma.personalVoucher.findMany.mockResolvedValue(items)

      const result = await service.findByUser('user-1')

      expect(result).toEqual({ items })
      expect(prisma.personalVoucher.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: [{ status: 'asc' }, { expiresAt: 'desc' }],
      }))
    })
  })

  describe('validate', () => {
    it('báo lỗi nếu thiếu code hoặc userId', async () => {
      await expect(service.validate({ userId: 'user-1', totalAmount: 100000 })).rejects.toThrow(BadRequestException)
      await expect(service.validate({ code: 'BDAY-ABC123', totalAmount: 100000 })).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu voucher không tồn tại', async () => {
      prisma.personalVoucher.findUnique.mockResolvedValue(null)
      await expect(service.validate({ code: 'NOPE', userId: 'user-1', totalAmount: 100000 })).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu voucher thuộc về user khác', async () => {
      prisma.personalVoucher.findUnique.mockResolvedValue(makeVoucher({ userId: 'other-user' }))
      await expect(service.validate({ code: 'BDAY-ABC123', userId: 'user-1', totalAmount: 100000 })).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu voucher đã USED', async () => {
      prisma.personalVoucher.findUnique.mockResolvedValue(makeVoucher({ status: 'USED' }))
      await expect(service.validate({ code: 'BDAY-ABC123', userId: 'user-1', totalAmount: 100000 })).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu voucher EXPIRED theo status hoặc theo expiresAt đã qua', async () => {
      prisma.personalVoucher.findUnique.mockResolvedValue(makeVoucher({ status: 'EXPIRED' }))
      await expect(service.validate({ code: 'BDAY-ABC123', userId: 'user-1', totalAmount: 100000 })).rejects.toThrow(BadRequestException)

      prisma.personalVoucher.findUnique.mockResolvedValue(makeVoucher({ expiresAt: new Date('2000-01-01') }))
      await expect(service.validate({ code: 'BDAY-ABC123', userId: 'user-1', totalAmount: 100000 })).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu totalAmount dưới minOrderAmount', async () => {
      prisma.personalVoucher.findUnique.mockResolvedValue(makeVoucher({ minOrderAmount: 200000 }))
      await expect(service.validate({ code: 'BDAY-ABC123', userId: 'user-1', totalAmount: 100000 })).rejects.toThrow(BadRequestException)
    })

    it('tính discountAmount = totalAmount * discountPercent / 100, làm tròn', async () => {
      prisma.personalVoucher.findUnique.mockResolvedValue(makeVoucher({ discountPercent: 15 }))

      const result = await service.validate({ code: 'BDAY-ABC123', userId: 'user-1', totalAmount: 100000 })

      expect(result.discountAmount).toBe(15000)
      expect(result.finalAmount).toBe(85000)
    })

    it('finalAmount không âm (kẹp về 0) nếu discount vượt totalAmount', async () => {
      prisma.personalVoucher.findUnique.mockResolvedValue(makeVoucher({ discountPercent: 150 }))

      const result = await service.validate({ code: 'BDAY-ABC123', userId: 'user-1', totalAmount: 100000 })

      expect(result.finalAmount).toBe(0)
    })

    it('chuẩn hóa code thành uppercase + trim khi tra cứu', async () => {
      prisma.personalVoucher.findUnique.mockResolvedValue(makeVoucher())
      await service.validate({ code: '  bday-abc123  ', userId: 'user-1', totalAmount: 100000 })
      expect(prisma.personalVoucher.findUnique).toHaveBeenCalledWith({ where: { code: 'BDAY-ABC123' } })
    })
  })

  describe('consume', () => {
    it('set status USED, usedAt, orderId khi voucher hợp lệ', async () => {
      const voucher = makeVoucher()
      prisma.personalVoucher.findUnique.mockResolvedValue(voucher)
      prisma.personalVoucher.update.mockResolvedValue({ ...voucher, status: 'USED' })

      await service.consume('BDAY-ABC123', 'user-1', 'order-1')

      expect(prisma.personalVoucher.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { status: 'USED', usedAt: expect.any(Date), orderId: 'order-1' },
      })
    })

    it('báo lỗi nếu voucher không còn dùng được (đã USED)', async () => {
      prisma.personalVoucher.findUnique.mockResolvedValue(makeVoucher({ status: 'USED' }))
      await expect(service.consume('BDAY-ABC123', 'user-1', 'order-1')).rejects.toThrow(BadRequestException)
      expect(prisma.personalVoucher.update).not.toHaveBeenCalled()
    })
  })
})
