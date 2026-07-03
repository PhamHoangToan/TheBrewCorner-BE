import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { OrdersService } from './orders.service'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { LowStockJob } from '../jobs/low-stock.job'
import { InvoicesService } from '../invoices/invoices.service'
import { VouchersService } from '../vouchers/vouchers.service'

describe('OrdersService', () => {
  let service: OrdersService
  let prisma: any
  let notifications: any
  let vouchersService: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            order: {
              findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
              create: jest.fn(), update: jest.fn(), count: jest.fn(),
            },
            orderItem: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
            product: { findMany: jest.fn() },
            category: { upsert: jest.fn() },
            cafeTable: { update: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
            area: { upsert: jest.fn() },
            invoice: { update: jest.fn() },
            user: { findFirst: jest.fn(), update: jest.fn() },
            loyaltyTransaction: { findFirst: jest.fn(), create: jest.fn() },
            $transaction: jest.fn(async (arg: any) => {
              if (typeof arg === 'function') return arg(prisma)
              return Promise.all(arg)
            }),
          },
        },
        { provide: NotificationsService, useValue: { send: jest.fn(), emitOrderUpdate: jest.fn() } },
        { provide: LowStockJob, useValue: { checkSpecificIngredients: jest.fn() } },
        { provide: InvoicesService, useValue: { create: jest.fn(), pay: jest.fn() } },
        { provide: VouchersService, useValue: { validate: jest.fn(), consume: jest.fn() } },
      ],
    }).compile()

    service = module.get(OrdersService)
    prisma = module.get(PrismaService)
    notifications = module.get(NotificationsService)
    vouchersService = module.get(VouchersService)
  })

  const product = (overrides: Partial<any> = {}) => ({
    id: 'p1', code: 'p1', name: 'Cà phê sữa', price: 30000, soldOutUntil: null, ...overrides,
  })

  describe('create — 86 list (món hết hàng trong ngày)', () => {
    it('chặn tạo order nếu món đang soldOutUntil > hiện tại', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000)
      prisma.product.findMany.mockResolvedValue([product({ soldOutUntil: future })])

      await expect(service.create({ items: [{ productId: 'p1', quantity: 1 }] }))
        .rejects.toThrow(BadRequestException)
      expect(prisma.order.create).not.toHaveBeenCalled()
    })

    it('cho phép tạo order nếu soldOutUntil đã qua (hết hiệu lực)', async () => {
      const past = new Date(Date.now() - 60 * 60 * 1000)
      prisma.product.findMany.mockResolvedValue([product({ soldOutUntil: past })])
      prisma.order.create.mockResolvedValue({ id: 'o1', code: 'ORD-1', items: [], table: null })

      await service.create({ items: [{ productId: 'p1', quantity: 1 }] })

      expect(prisma.order.create).toHaveBeenCalled()
    })

    it('cho phép tạo order nếu soldOutUntil = null', async () => {
      prisma.product.findMany.mockResolvedValue([product()])
      prisma.order.create.mockResolvedValue({ id: 'o1', code: 'ORD-1', items: [], table: null })

      await service.create({ items: [{ productId: 'p1', quantity: 1 }] })

      expect(prisma.order.create).toHaveBeenCalled()
    })
  })

  describe('create — đổi điểm tích lũy (redeemPoints)', () => {
    it('báo lỗi nếu dùng điểm nhưng không có customerId', async () => {
      prisma.product.findMany.mockResolvedValue([product()])

      await expect(service.create({ items: [{ productId: 'p1', quantity: 1 }], redeemPoints: 10 }))
        .rejects.toThrow(BadRequestException)
      expect(prisma.order.create).not.toHaveBeenCalled()
    })

    it('báo lỗi nếu khách không đủ điểm', async () => {
      prisma.product.findMany.mockResolvedValue([product()])
      prisma.user.findFirst.mockResolvedValue({ loyaltyPoints: 5 })

      await expect(service.create({ items: [{ productId: 'p1', quantity: 1 }], customerId: 'user-1', redeemPoints: 10 }))
        .rejects.toThrow(BadRequestException)
      expect(prisma.order.create).not.toHaveBeenCalled()
    })

    it('trừ điểm và ghi LoyaltyTransaction REDEEM sau khi tạo order thành công', async () => {
      prisma.product.findMany.mockResolvedValue([product()])
      prisma.user.findFirst.mockResolvedValue({ loyaltyPoints: 100 })
      prisma.order.create.mockResolvedValue({ id: 'o1', code: 'ORD-1', items: [], table: null })
      prisma.loyaltyTransaction.findFirst.mockResolvedValue(null)
      prisma.user.update.mockResolvedValue({})
      prisma.loyaltyTransaction.create.mockResolvedValue({})

      await service.create({ items: [{ productId: 'p1', quantity: 1 }], customerId: 'user-1', redeemPoints: 10 })

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { loyaltyPoints: { decrement: 10 } },
      })
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', orderId: 'o1', points: -10, type: 'REDEEM' }),
      }))
    })

    it('bỏ qua nếu redeemPoints <= 0', async () => {
      prisma.product.findMany.mockResolvedValue([product()])
      prisma.order.create.mockResolvedValue({ id: 'o1', code: 'ORD-1', items: [], table: null })

      await service.create({ items: [{ productId: 'p1', quantity: 1 }], redeemPoints: 0 })

      expect(prisma.user.findFirst).not.toHaveBeenCalled()
      expect(prisma.user.update).not.toHaveBeenCalled()
    })
  })

  describe('create — voucher cá nhân', () => {
    it('báo lỗi nếu dùng voucher nhưng không có customerId', async () => {
      prisma.product.findMany.mockResolvedValue([product()])

      await expect(service.create({ items: [{ productId: 'p1', quantity: 1 }], voucherCode: 'BDAY-ABC' }))
        .rejects.toThrow(BadRequestException)
      expect(prisma.order.create).not.toHaveBeenCalled()
    })

    it('validate voucher trước khi tạo order, consume voucher sau khi tạo thành công', async () => {
      prisma.product.findMany.mockResolvedValue([product()])
      prisma.order.create.mockResolvedValue({ id: 'o1', code: 'ORD-1', items: [], table: null })
      vouchersService.validate.mockResolvedValue({ discountAmount: 4500 })

      await service.create({ items: [{ productId: 'p1', quantity: 1 }], customerId: 'user-1', voucherCode: 'bday-abc' })

      expect(vouchersService.validate).toHaveBeenCalledWith(expect.objectContaining({ code: 'bday-abc', userId: 'user-1' }))
      expect(vouchersService.consume).toHaveBeenCalledWith('bday-abc', 'user-1', 'o1')
    })

    it('không tạo order nếu voucher không hợp lệ (validate ném lỗi)', async () => {
      prisma.product.findMany.mockResolvedValue([product()])
      vouchersService.validate.mockRejectedValue(new BadRequestException('Voucher đã hết hạn'))

      await expect(service.create({ items: [{ productId: 'p1', quantity: 1 }], customerId: 'user-1', voucherCode: 'EXPIRED' }))
        .rejects.toThrow(BadRequestException)
      expect(prisma.order.create).not.toHaveBeenCalled()
    })
  })

  describe('update — hoàn điểm khi hủy đơn (CANCELLED)', () => {
    beforeEach(() => {
      // update() kiểm tra trạng thái hiện tại trước khi đổi status
      prisma.order.findFirst.mockResolvedValue({ status: 'SERVED', invoice: null })
    })

    it('hoàn điểm nếu order có dùng điểm (REDEEM) và chưa từng hoàn', async () => {
      prisma.order.update.mockResolvedValue({ id: 'o1', code: 'ORD-1', status: 'CANCELLED', table: null })
      prisma.loyaltyTransaction.findFirst
        .mockResolvedValueOnce({ id: 'lt1', userId: 'user-1', points: -10, orderId: 'o1', type: 'REDEEM' })
        .mockResolvedValueOnce(null)
      prisma.user.update.mockResolvedValue({})
      prisma.loyaltyTransaction.create.mockResolvedValue({})

      await service.update('o1', { status: 'CANCELLED' })

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { loyaltyPoints: { increment: 10 } },
      })
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', orderId: 'o1', points: 10, type: 'ADJUST' }),
      }))
    })

    it('không hoàn điểm nếu order không dùng điểm tích lũy', async () => {
      prisma.order.update.mockResolvedValue({ id: 'o1', code: 'ORD-1', status: 'CANCELLED', table: null })
      prisma.loyaltyTransaction.findFirst.mockResolvedValue(null)

      await service.update('o1', { status: 'CANCELLED' })

      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('idempotent — không hoàn điểm 2 lần nếu đã có bản ghi ADJUST hoàn trước đó', async () => {
      prisma.order.update.mockResolvedValue({ id: 'o1', code: 'ORD-1', status: 'CANCELLED', table: null })
      prisma.loyaltyTransaction.findFirst
        .mockResolvedValueOnce({ id: 'lt1', userId: 'user-1', points: -10, orderId: 'o1', type: 'REDEEM' })
        .mockResolvedValueOnce({ id: 'lt2', type: 'ADJUST', description: 'Hoàn điểm do hủy đơn' })

      await service.update('o1', { status: 'CANCELLED' })

      expect(prisma.user.update).not.toHaveBeenCalled()
    })
  })

  describe('update — tách trạng thái thanh toán khỏi tiến độ phục vụ', () => {
    it('chặn hạ trạng thái đơn đã PAID về trạng thái pha chế (barista bấm nhầm không ghi đè được)', async () => {
      prisma.order.findFirst.mockResolvedValue({ status: 'PAID', invoice: { status: 'PAID' } })

      await expect(service.update('o1', { status: 'SERVED' })).rejects.toThrow(BadRequestException)
      await expect(service.update('o1', { status: 'PREPARING' })).rejects.toThrow(BadRequestException)
      expect(prisma.order.update).not.toHaveBeenCalled()
    })

    it('vẫn cho hủy (CANCELLED) đơn đã PAID — đường hoàn tiền/sự cố', async () => {
      prisma.order.findFirst.mockResolvedValue({ status: 'PAID', invoice: { status: 'PAID' } })
      prisma.order.update.mockResolvedValue({ id: 'o1', code: 'ORD-1', status: 'CANCELLED', table: null })
      prisma.loyaltyTransaction.findFirst.mockResolvedValue(null)

      await service.update('o1', { status: 'CANCELLED' })

      expect(prisma.order.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }))
    })

    it('barista báo SERVED khi tiền đã thu trước (invoice PAID) → tự chuyển PAID (hoàn tất trọn vẹn)', async () => {
      prisma.order.findFirst.mockResolvedValue({ status: 'PREPARING', invoice: { status: 'PAID' } })
      prisma.order.update.mockResolvedValue({ id: 'o1', code: 'ORD-1', status: 'PAID', table: null })
      prisma.orderItem.updateMany.mockResolvedValue({ count: 1 })

      await service.update('o1', { status: 'SERVED' })

      expect(prisma.order.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID' }),
      }))
    })

    it('barista báo SERVED khi chưa thanh toán → giữ SERVED, chờ cashier thu tiền', async () => {
      prisma.order.findFirst.mockResolvedValue({ status: 'READY', invoice: { status: 'UNPAID' } })
      prisma.order.update.mockResolvedValue({ id: 'o1', code: 'ORD-1', status: 'SERVED', table: null })
      prisma.orderItem.updateMany.mockResolvedValue({ count: 0 })

      await service.update('o1', { status: 'SERVED' })

      expect(prisma.order.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'SERVED' }),
      }))
    })

    it('SERVED cấp order → cascade item chưa xong sang SERVED (tránh kẹt PENDING ở TableMap/KDS)', async () => {
      prisma.order.findFirst.mockResolvedValue({ status: 'READY', invoice: null })
      prisma.order.update.mockResolvedValue({ id: 'o1', code: 'ORD-1', status: 'SERVED', table: null })
      prisma.orderItem.updateMany.mockResolvedValue({ count: 2 })

      await service.update('o1', { status: 'SERVED' })

      expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'o1', status: { notIn: ['SERVED', 'RETURNED', 'CANCELLED'] } },
        data: { status: 'SERVED' },
      })
    })

    it('không cascade item khi chỉ chuyển PREPARING/READY', async () => {
      prisma.order.findFirst.mockResolvedValue({ status: 'SENT', invoice: null })
      prisma.order.update.mockResolvedValue({ id: 'o1', code: 'ORD-1', status: 'PREPARING', table: null })

      await service.update('o1', { status: 'PREPARING' })

      expect(prisma.orderItem.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('split — tách bill', () => {
    it('báo lỗi nếu không truyền itemIds', async () => {
      await expect(service.split('o1', [])).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi NotFoundException nếu order không tồn tại', async () => {
      prisma.order.findFirst.mockResolvedValue(null)
      await expect(service.split('o1', ['item-1'])).rejects.toThrow(NotFoundException)
    })

    it('báo lỗi nếu order đã bị hủy', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'CANCELLED', items: [], invoice: null })
      await expect(service.split('o1', ['item-1'])).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu order đã thanh toán', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'PAID', items: [], invoice: null })
      await expect(service.split('o1', ['item-1'])).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu itemIds có món không hợp lệ / đã hủy / đã trả', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'o1', status: 'SERVED', invoice: null,
        items: [{ id: 'item-1', status: 'SERVED' }, { id: 'item-2', status: 'CANCELLED' }],
      })
      await expect(service.split('o1', ['item-2'])).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi nếu tách toàn bộ món (phải chừa ít nhất 1 món)', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'o1', status: 'SERVED', invoice: null,
        items: [{ id: 'item-1', status: 'SERVED' }],
      })
      await expect(service.split('o1', ['item-1'])).rejects.toThrow(BadRequestException)
    })

    it('tách thành công: chuyển item sang order mới, tính lại tổng cả 2 order', async () => {
      prisma.order.findFirst
        .mockResolvedValueOnce({
          id: 'o1', code: 'ORD-1', status: 'SERVED', invoice: null, type: 'DINE_IN',
          tableId: 't1', createdById: 'u1', customerId: null,
          items: [{ id: 'item-1', status: 'SERVED' }, { id: 'item-2', status: 'SERVED' }],
        })
        .mockResolvedValueOnce({ id: 'o1', items: [], table: null, invoice: null }) // this.findOne(order.id)
      prisma.order.create.mockResolvedValue({ id: 'o2', code: 'ORD-2' })
      prisma.orderItem.updateMany.mockResolvedValue({ count: 1 })
      prisma.orderItem.findMany.mockResolvedValue([{ totalPrice: '15000' }])
      prisma.order.update.mockResolvedValue({})
      prisma.order.findUnique.mockResolvedValue({ id: 'o2', items: [], table: null })

      const result = await service.split('o1', ['item-1'])

      expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['item-1'] } },
        data: { orderId: 'o2' },
      })
      expect(result.splitOrder).toEqual({ id: 'o2', items: [], table: null })
    })
  })

  describe('merge — gộp bàn/order', () => {
    it('báo lỗi nếu sourceOrderId trống hoặc trùng với id đích', async () => {
      await expect(service.merge('o1', '')).rejects.toThrow(BadRequestException)
      await expect(service.merge('o1', 'o1')).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi NotFoundException nếu order đích hoặc nguồn không tồn tại', async () => {
      prisma.order.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'o2' })
      await expect(service.merge('o1', 'o2')).rejects.toThrow(NotFoundException)
    })

    it('báo lỗi nếu order nguồn hoặc đích đã hủy/đã thanh toán', async () => {
      prisma.order.findFirst
        .mockResolvedValueOnce({ id: 'o1', status: 'PAID', invoice: null })
        .mockResolvedValueOnce({ id: 'o2', status: 'SERVED', invoice: null, items: [] })
      await expect(service.merge('o1', 'o2')).rejects.toThrow(BadRequestException)
    })

    it('gộp thành công: chuyển item, void invoice nguồn nếu có, hủy order nguồn, tính lại tổng đích', async () => {
      prisma.order.findFirst
        .mockResolvedValueOnce({ id: 'o1', code: 'ORD-1', status: 'SERVED', invoice: null, tableId: 't1' })
        .mockResolvedValueOnce({
          id: 'o2', code: 'ORD-2', status: 'SERVED', invoice: { id: 'inv-2' }, tableId: 't2', items: [],
        })
      prisma.orderItem.updateMany.mockResolvedValue({ count: 2 })
      prisma.invoice.update.mockResolvedValue({})
      prisma.order.update.mockResolvedValue({})
      prisma.order.count.mockResolvedValue(0)
      prisma.cafeTable.update.mockResolvedValue({})
      prisma.orderItem.findMany.mockResolvedValue([])

      // this.findOne(target.id) called at the end
      const findOneSpy = jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'o1' } as any)

      const result = await service.merge('o1', 'o2')

      expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'o2' },
        data: { orderId: 'o1' },
      })
      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv-2' }, data: { status: 'VOID' } })
      expect(prisma.order.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'o2' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }))
      expect(prisma.cafeTable.update).toHaveBeenCalledWith({ where: { id: 't2' }, data: { status: 'AVAILABLE' } })
      expect(result).toEqual({ id: 'o1' })
      findOneSpy.mockRestore()
    })

    it('không trả bàn nguồn về AVAILABLE nếu vẫn còn order khác đang hoạt động ở bàn đó', async () => {
      prisma.order.findFirst
        .mockResolvedValueOnce({ id: 'o1', code: 'ORD-1', status: 'SERVED', invoice: null, tableId: 't1' })
        .mockResolvedValueOnce({ id: 'o2', code: 'ORD-2', status: 'SERVED', invoice: null, tableId: 't2', items: [] })
      prisma.orderItem.updateMany.mockResolvedValue({ count: 1 })
      prisma.order.update.mockResolvedValue({})
      prisma.order.count.mockResolvedValue(2)
      prisma.orderItem.findMany.mockResolvedValue([])
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'o1' } as any)

      await service.merge('o1', 'o2')

      expect(prisma.cafeTable.update).not.toHaveBeenCalled()
    })
  })
})
