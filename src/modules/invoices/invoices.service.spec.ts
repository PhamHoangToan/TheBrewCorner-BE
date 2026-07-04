import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { InvoicesService } from './invoices.service'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

const makeInvoice = (overrides: Partial<any> = {}) => ({
  id: 'invoice-1',
  code: 'HD-001',
  orderId: 'order-1',
  totalAmount: 100000,
  status: 'UNPAID',
  order: {
    id: 'order-1',
    status: 'SERVED',
    tableId: null,
    customerId: null,
    items: [],
  },
  ...overrides,
})

describe('InvoicesService — pay()', () => {
  let service: InvoicesService
  let prisma: any
  let notifications: any

  // tx giả lập bên trong prisma.$transaction — cùng shape với prisma thật
  let tx: any

  beforeEach(async () => {
    tx = {
      invoicePayment: { create: jest.fn().mockResolvedValue({ id: 'payment-1' }) },
      invoice: { update: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
      orderItem: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      cafeTable: { update: jest.fn().mockResolvedValue({}) },
      loyaltyTransaction: { create: jest.fn().mockResolvedValue({}) },
      user: { update: jest.fn() },
      invoiceRefund: { create: jest.fn().mockResolvedValue({ id: 'refund-1' }) },
      financeTransaction: { create: jest.fn().mockResolvedValue({}) },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: PrismaService,
          useValue: {
            invoice: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: 'invoice-1' }) },
            invoicePayment: { findFirst: jest.fn() },
            $transaction: jest.fn((cb: any) => cb(tx)),
          },
        },
        {
          provide: NotificationsService,
          useValue: { emitOrderUpdate: jest.fn() },
        },
      ],
    }).compile()

    service = module.get(InvoicesService)
    prisma = module.get(PrismaService)
    notifications = module.get(NotificationsService)
  })

  it('trả về payment cũ nếu invoice đã PAID và đã có payment (idempotent)', async () => {
    const invoice = makeInvoice({ status: 'PAID' })
    prisma.invoice.findUnique.mockResolvedValue(invoice)
    prisma.invoicePayment.findFirst.mockResolvedValue({ id: 'existing-payment' })

    const result = await service.pay('invoice-1', { method: 'CASH' })

    expect(result).toEqual({ id: 'existing-payment' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('order đã SERVED: tạo payment, set invoice PAID, promote order lên PAID (hoàn tất trọn vẹn)', async () => {
    const invoice = makeInvoice() // order.status mặc định SERVED
    prisma.invoice.findUnique.mockResolvedValue(invoice)

    await service.pay('invoice-1', { method: 'CASH', amount: 100000 })

    expect(tx.invoicePayment.create).toHaveBeenCalledWith({
      data: { invoiceId: 'invoice-1', method: 'CASH', amount: 100000, note: null },
    })
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { status: 'PAID', paidAt: expect.any(Date) },
    })
    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: 'PAID' } })
    // Item dang dở được cascade sang SERVED để TableMap/KDS không kẹt
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1', status: { notIn: ['SERVED', 'RETURNED', 'CANCELLED'] } },
      data: { status: 'SERVED' },
    })
    expect(notifications.emitOrderUpdate).toHaveBeenCalledWith('order-1', { status: 'PAID', invoiceStatus: 'PAID' })
  })

  it('order CHECKOUT_REQUESTED (khách xin tính tiền): thanh toán xong cũng promote lên PAID', async () => {
    const invoice = makeInvoice({ order: { id: 'order-1', status: 'CHECKOUT_REQUESTED', tableId: null, customerId: null, items: [] } })
    prisma.invoice.findUnique.mockResolvedValue(invoice)

    await service.pay('invoice-1', { method: 'CASH' })

    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: 'PAID' } })
  })

  it('order chưa phục vụ xong (PREPARING): invoice PAID nhưng KHÔNG đổi order.status — barista còn thấy đơn', async () => {
    const invoice = makeInvoice({ order: { id: 'order-1', status: 'PREPARING', tableId: null, customerId: null, items: [] } })
    prisma.invoice.findUnique.mockResolvedValue(invoice)

    await service.pay('invoice-1', { method: 'BANK_TRANSFER' })

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { status: 'PAID', paidAt: expect.any(Date) },
    })
    expect(tx.order.update).not.toHaveBeenCalled()
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled()
    expect(notifications.emitOrderUpdate).toHaveBeenCalledWith('order-1', { status: 'PREPARING', invoiceStatus: 'PAID' })
  })

  it('cập nhật bàn về SERVING nếu order có tableId', async () => {
    const invoice = makeInvoice({ order: { id: 'order-1', tableId: 'table-1', customerId: null, items: [] } })
    prisma.invoice.findUnique.mockResolvedValue(invoice)

    await service.pay('invoice-1', { method: 'CASH' })

    expect(tx.cafeTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'SERVING' } })
  })

  it('không đụng bàn nếu order không có tableId', async () => {
    const invoice = makeInvoice()
    prisma.invoice.findUnique.mockResolvedValue(invoice)

    await service.pay('invoice-1', { method: 'CASH' })

    expect(tx.cafeTable.update).not.toHaveBeenCalled()
  })

  describe('tích điểm khách hàng', () => {
    it('không tạo loyalty transaction nếu order không có customerId', async () => {
      const invoice = makeInvoice()
      prisma.invoice.findUnique.mockResolvedValue(invoice)

      await service.pay('invoice-1', { method: 'CASH' })

      expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled()
      expect(tx.user.update).not.toHaveBeenCalled()
    })

    it('cộng điểm theo tỉ lệ 10.000đ = 1 điểm khi có customerId', async () => {
      const invoice = makeInvoice({
        totalAmount: 125000,
        order: { id: 'order-1', tableId: null, customerId: 'cust-1', items: [] },
      })
      prisma.invoice.findUnique.mockResolvedValue(invoice)
      tx.user.update.mockResolvedValue({ id: 'cust-1', totalSpent: 125000, membershipTier: 'BASIC' })

      await service.pay('invoice-1', { method: 'CASH' })

      expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'cust-1',
          orderId: 'order-1',
          points: 12, // floor(125000 / 10000)
          type: 'EARN',
          description: 'Tích điểm hóa đơn HD-001',
        },
      })
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { loyaltyPoints: { increment: 12 }, totalSpent: { increment: 125000 } },
      })
    })

    it('không cộng điểm nếu số tiền chưa đủ 10.000đ (0 điểm)', async () => {
      const invoice = makeInvoice({
        totalAmount: 5000,
        order: { id: 'order-1', tableId: null, customerId: 'cust-1', items: [] },
      })
      prisma.invoice.findUnique.mockResolvedValue(invoice)

      await service.pay('invoice-1', { method: 'CASH' })

      expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled()
      expect(tx.user.update).not.toHaveBeenCalled()
    })

    it('nâng hạng lên SILVER khi totalSpent vượt ngưỡng 2 triệu', async () => {
      const invoice = makeInvoice({
        totalAmount: 500000,
        order: { id: 'order-1', tableId: null, customerId: 'cust-1', items: [] },
      })
      prisma.invoice.findUnique.mockResolvedValue(invoice)
      tx.user.update.mockResolvedValueOnce({ id: 'cust-1', totalSpent: 2100000, membershipTier: 'BASIC' })

      await service.pay('invoice-1', { method: 'CASH' })

      expect(tx.user.update).toHaveBeenNthCalledWith(2, { where: { id: 'cust-1' }, data: { membershipTier: 'SILVER' } })
    })

    it('nâng hạng lên GOLD khi totalSpent vượt ngưỡng 10 triệu', async () => {
      const invoice = makeInvoice({
        totalAmount: 500000,
        order: { id: 'order-1', tableId: null, customerId: 'cust-1', items: [] },
      })
      prisma.invoice.findUnique.mockResolvedValue(invoice)
      tx.user.update.mockResolvedValueOnce({ id: 'cust-1', totalSpent: 10500000, membershipTier: 'SILVER' })

      await service.pay('invoice-1', { method: 'CASH' })

      expect(tx.user.update).toHaveBeenNthCalledWith(2, { where: { id: 'cust-1' }, data: { membershipTier: 'GOLD' } })
    })

    it('không gọi update tier lần 2 nếu hạng không đổi', async () => {
      const invoice = makeInvoice({
        totalAmount: 500000,
        order: { id: 'order-1', tableId: null, customerId: 'cust-1', items: [] },
      })
      prisma.invoice.findUnique.mockResolvedValue(invoice)
      tx.user.update.mockResolvedValueOnce({ id: 'cust-1', totalSpent: 500000, membershipTier: 'BASIC' })

      await service.pay('invoice-1', { method: 'CASH' })

      expect(tx.user.update).toHaveBeenCalledTimes(1)
    })
  })
})

describe('InvoicesService — refund()', () => {
  let service: InvoicesService
  let prisma: any
  let tx: any

  const paidInvoice = (overrides: Partial<any> = {}) => ({
    id: 'invoice-1',
    code: 'HD-001',
    orderId: 'order-1',
    totalAmount: 100000,
    status: 'PAID',
    refunds: [],
    order: { id: 'order-1', customerId: null },
    ...overrides,
  })

  beforeEach(async () => {
    tx = {
      invoiceRefund: { create: jest.fn().mockResolvedValue({ id: 'refund-1' }) },
      invoice: { update: jest.fn().mockResolvedValue({}) },
      financeTransaction: { create: jest.fn().mockResolvedValue({}) },
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: PrismaService,
          useValue: {
            invoice: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: 'invoice-1' }) },
            $transaction: jest.fn((cb: any) => cb(tx)),
          },
        },
        { provide: NotificationsService, useValue: { emitOrderUpdate: jest.fn() } },
      ],
    }).compile()
    service = module.get(InvoicesService)
    prisma = module.get(PrismaService)
  })

  it('từ chối hoàn nếu hóa đơn chưa thanh toán', async () => {
    prisma.invoice.findUnique.mockResolvedValue(paidInvoice({ status: 'UNPAID' }))
    await expect(service.refund('invoice-1', { amount: 10000, reason: 'x' })).rejects.toThrow(BadRequestException)
  })

  it('từ chối nếu số tiền hoàn vượt quá phần còn lại', async () => {
    prisma.invoice.findUnique.mockResolvedValue(paidInvoice({ refunds: [{ amount: 90000 }] }))
    await expect(service.refund('invoice-1', { amount: 20000, reason: 'x' })).rejects.toThrow(BadRequestException)
  })

  it('từ chối nếu thiếu lý do', async () => {
    prisma.invoice.findUnique.mockResolvedValue(paidInvoice())
    await expect(service.refund('invoice-1', { amount: 10000, reason: '  ' })).rejects.toThrow(BadRequestException)
  })

  it('hoàn toàn bộ → set REFUNDED + ghi phiếu chi', async () => {
    prisma.invoice.findUnique.mockResolvedValue(paidInvoice())
    await service.refund('invoice-1', { amount: 100000, reason: 'Khách đổi ý', method: 'CASH' })

    expect(tx.invoiceRefund.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ invoiceId: 'invoice-1', amount: 100000, method: 'CASH' }),
    }))
    expect(tx.invoice.update).toHaveBeenCalledWith({ where: { id: 'invoice-1' }, data: { status: 'REFUNDED' } })
    expect(tx.financeTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'EXPENSE', amount: 100000 }),
    }))
  })

  it('hoàn một phần → set PARTIAL_REFUND', async () => {
    prisma.invoice.findUnique.mockResolvedValue(paidInvoice())
    await service.refund('invoice-1', { amount: 40000, reason: 'Món lỗi' })

    expect(tx.invoice.update).toHaveBeenCalledWith({ where: { id: 'invoice-1' }, data: { status: 'PARTIAL_REFUND' } })
  })
})
