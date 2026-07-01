import { Test, TestingModule } from '@nestjs/testing'
import { CassoService } from './casso.service'
import { PrismaService } from '../../prisma/prisma.service'
import { InvoicesService } from '../invoices/invoices.service'

const makeTx = (overrides: Partial<any> = {}) => ({
  id: 1,
  tid: 'FT2607100001',
  description: 'TheBrewCorner ORD-123',
  amount: 100000,
  when: '2026-07-10 10:00:00',
  transactionType: 'in',
  ...overrides,
})

describe('CassoService', () => {
  let service: CassoService
  let prisma: any
  let invoicesService: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CassoService,
        {
          provide: PrismaService,
          useValue: {
            order: { findFirst: jest.fn() },
            pendingTransfer: { findUnique: jest.fn(), update: jest.fn() },
          },
        },
        {
          provide: InvoicesService,
          useValue: { create: jest.fn(), pay: jest.fn() },
        },
      ],
    }).compile()

    service = module.get(CassoService)
    prisma = module.get(PrismaService)
    invoicesService = module.get(InvoicesService)
  })

  describe('handleWebhook', () => {
    it('bỏ qua nếu payload.error khác 0', async () => {
      const result = await service.handleWebhook({ error: 1, data: makeTx() })
      expect(result).toEqual({ success: 1, processed: 0 })
      expect(prisma.order.findFirst).not.toHaveBeenCalled()
    })

    it('bỏ qua giao dịch không phải transactionType "in"', async () => {
      const result = await service.handleWebhook({ error: 0, data: makeTx({ transactionType: 'out' }) })
      expect(result.processed).toBe(0)
    })

    it('xử lý mảng nhiều giao dịch', async () => {
      prisma.order.findFirst.mockResolvedValue(null)
      prisma.pendingTransfer.findUnique.mockResolvedValue(null)

      const result = await service.handleWebhook({
        error: 0,
        data: [makeTx({ tid: 'a' }), makeTx({ tid: 'b' })],
      })

      expect(prisma.order.findFirst).toHaveBeenCalledTimes(2)
      expect(result.processed).toBe(0)
    })

    it('không throw ra ngoài nếu 1 giao dịch lỗi, vẫn xử lý các giao dịch khác', async () => {
      prisma.order.findFirst
        .mockRejectedValueOnce(new Error('DB lỗi'))
        .mockResolvedValueOnce(null)
      prisma.pendingTransfer.findUnique.mockResolvedValue(null)

      const result = await service.handleWebhook({
        error: 0,
        data: [makeTx({ tid: 'a' }), makeTx({ tid: 'b' })],
      })

      expect(result.processed).toBe(0)
    })

    it('không match được mã đơn/mã tham chiếu trong description', async () => {
      const result = await service.handleWebhook({ error: 0, data: makeTx({ description: 'Chuyen tien linh tinh' }) })
      expect(result.processed).toBe(0)
      expect(prisma.order.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('payOrder (order tồn tại theo mã)', () => {
    it('bỏ qua nếu order đã PAID', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'order-1', code: 'ORD-123', totalAmount: 100000, invoice: { status: 'PAID' },
      })

      const result = await service.handleWebhook({ error: 0, data: makeTx() })

      expect(result.processed).toBe(0)
      expect(invoicesService.create).not.toHaveBeenCalled()
    })

    it('bỏ qua nếu số tiền chuyển khoản thấp hơn tổng hóa đơn', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'order-1', code: 'ORD-123', totalAmount: 150000, invoice: null,
      })

      const result = await service.handleWebhook({ error: 0, data: makeTx({ amount: 100000 }) })

      expect(result.processed).toBe(0)
      expect(invoicesService.create).not.toHaveBeenCalled()
    })

    it('tự động thanh toán khi số tiền đủ hoặc thừa', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'order-1', code: 'ORD-123', totalAmount: 100000, invoice: null,
      })
      invoicesService.create.mockResolvedValue({ id: 'invoice-1' })

      const result = await service.handleWebhook({ error: 0, data: makeTx({ amount: 100000, tid: 'tid-1' }) })

      expect(result.processed).toBe(1)
      expect(invoicesService.create).toHaveBeenCalledWith({
        orderId: 'order-1', subtotal: 100000, discountAmount: 0, totalAmount: 100000,
      })
      expect(invoicesService.pay).toHaveBeenCalledWith('invoice-1', {
        method: 'BANK_TRANSFER', amount: 100000, note: 'Casso: tid-1',
      })
    })
  })

  describe('payPendingTransfer (order chưa tồn tại — VietQR Customer checkout)', () => {
    it('bỏ qua nếu không tìm thấy order lẫn pending transfer', async () => {
      prisma.order.findFirst.mockResolvedValue(null)
      prisma.pendingTransfer.findUnique.mockResolvedValue(null)

      const result = await service.handleWebhook({ error: 0, data: makeTx({ description: 'TheBrewCorner CK-ABC123' }) })

      expect(result.processed).toBe(0)
    })

    it('bỏ qua nếu pending transfer không ở trạng thái WAITING', async () => {
      prisma.order.findFirst.mockResolvedValue(null)
      prisma.pendingTransfer.findUnique.mockResolvedValue({ code: 'CK-ABC123', amount: 100000, status: 'PAID' })

      const result = await service.handleWebhook({ error: 0, data: makeTx({ description: 'TheBrewCorner CK-ABC123' }) })

      expect(result.processed).toBe(0)
      expect(prisma.pendingTransfer.update).not.toHaveBeenCalled()
    })

    it('bỏ qua nếu số tiền thấp hơn dự kiến', async () => {
      prisma.order.findFirst.mockResolvedValue(null)
      prisma.pendingTransfer.findUnique.mockResolvedValue({ code: 'CK-ABC123', amount: 100000, status: 'WAITING' })

      const result = await service.handleWebhook({
        error: 0,
        data: makeTx({ description: 'TheBrewCorner CK-ABC123', amount: 50000 }),
      })

      expect(result.processed).toBe(0)
      expect(prisma.pendingTransfer.update).not.toHaveBeenCalled()
    })

    it('set PAID kèm tid khi số tiền đủ', async () => {
      prisma.order.findFirst.mockResolvedValue(null)
      prisma.pendingTransfer.findUnique.mockResolvedValue({ code: 'CK-ABC123', amount: 100000, status: 'WAITING' })

      const result = await service.handleWebhook({
        error: 0,
        data: makeTx({ description: 'TheBrewCorner CK-ABC123', amount: 100000, tid: 'tid-99' }),
      })

      expect(result.processed).toBe(1)
      expect(prisma.pendingTransfer.update).toHaveBeenCalledWith({
        where: { code: 'CK-ABC123' },
        data: { status: 'PAID', paidAt: expect.any(Date), tid: 'tid-99' },
      })
    })
  })
})
