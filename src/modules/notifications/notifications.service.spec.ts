import { Test, TestingModule } from '@nestjs/testing'
import { NotificationsService } from './notifications.service'
import { NotificationsGateway } from './notifications.gateway'
import { PrismaService } from '../../prisma/prisma.service'

const makeNotif = (overrides: Partial<any> = {}) => ({
  id: 'notif-1',
  role: 'barista',
  title: 'Test',
  body: 'Test body',
  type: 'ORDER_NEW',
  refId: 'order-1',
  read: false,
  createdAt: new Date(),
  ...overrides,
})

describe('NotificationsService', () => {
  let service: NotificationsService
  let prisma: any
  let gateway: any
  let emitMock: jest.Mock
  let toMock: jest.Mock

  beforeEach(async () => {
    emitMock = jest.fn()
    toMock = jest.fn().mockReturnValue({ emit: emitMock })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: {
            notification: {
              create: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: NotificationsGateway,
          useValue: { server: { to: toMock } },
        },
      ],
    }).compile()

    service = module.get<NotificationsService>(NotificationsService)
    prisma = module.get(PrismaService)
    gateway = module.get(NotificationsGateway)
  })

  // ─── send ───────────────────────────────────────────────────────────────────

  describe('send — ORDER_NEW (barista + cashier + waiter)', () => {
    it('creates DB record and emits to role:barista for single role', async () => {
      const notif = makeNotif()
      jest.spyOn(prisma.notification, 'create').mockResolvedValue(notif)

      await service.send({ role: 'barista', title: 'Order mới', body: 'Bàn 1 — 2 món', type: 'ORDER_NEW', refId: 'order-1' })

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { role: 'barista', title: 'Order mới', body: 'Bàn 1 — 2 món', type: 'ORDER_NEW', refId: 'order-1' },
      })
      expect(toMock).toHaveBeenCalledWith('role:barista')
      expect(emitMock).toHaveBeenCalledWith('notification:new', notif)
    })

    it('sends to barista, cashier and waiter when role is array', async () => {
      jest.spyOn(prisma.notification, 'create')
        .mockResolvedValueOnce(makeNotif({ role: 'barista', type: 'ORDER_NEW' }))
        .mockResolvedValueOnce(makeNotif({ role: 'cashier', type: 'ORDER_NEW' }))
        .mockResolvedValueOnce(makeNotif({ role: 'waiter', type: 'ORDER_NEW' }))

      await service.send({ role: ['barista', 'cashier', 'waiter'], title: 'Order mới', body: 'Bàn 1 — 2 món', type: 'ORDER_NEW', refId: 'order-1' })

      expect(prisma.notification.create).toHaveBeenCalledTimes(3)
      expect(toMock).toHaveBeenCalledWith('role:barista')
      expect(toMock).toHaveBeenCalledWith('role:cashier')
      expect(toMock).toHaveBeenCalledWith('role:waiter')
    })
  })

  describe('send — ORDER_PREPARING (cashier + waiter)', () => {
    it('sends to both cashier and waiter rooms', async () => {
      jest.spyOn(prisma.notification, 'create')
        .mockResolvedValueOnce(makeNotif({ role: 'cashier', type: 'ORDER_PREPARING' }))
        .mockResolvedValueOnce(makeNotif({ role: 'waiter', type: 'ORDER_PREPARING' }))

      await service.send({ role: ['cashier', 'waiter'], title: 'Đang pha chế', body: 'Bàn 1 — barista đang làm', type: 'ORDER_PREPARING', refId: 'order-1' })

      expect(prisma.notification.create).toHaveBeenCalledTimes(2)
      expect(toMock).toHaveBeenCalledWith('role:cashier')
      expect(toMock).toHaveBeenCalledWith('role:waiter')
    })
  })

  describe('send — ORDER_READY (cashier + waiter)', () => {
    it('sends to both cashier and waiter rooms', async () => {
      jest.spyOn(prisma.notification, 'create')
        .mockResolvedValueOnce(makeNotif({ role: 'cashier', type: 'ORDER_READY' }))
        .mockResolvedValueOnce(makeNotif({ role: 'waiter', type: 'ORDER_READY' }))

      await service.send({ role: ['cashier', 'waiter'], title: 'Món sẵn sàng', body: 'Bàn 1 — sẵn sàng phục vụ', type: 'ORDER_READY', refId: 'order-1' })

      expect(prisma.notification.create).toHaveBeenCalledTimes(2)
      expect(toMock).toHaveBeenCalledWith('role:cashier')
      expect(toMock).toHaveBeenCalledWith('role:waiter')
    })
  })

  describe('send — ITEM_SERVED (cashier + waiter)', () => {
    it('emits to both rooms', async () => {
      jest.spyOn(prisma.notification, 'create')
        .mockResolvedValueOnce(makeNotif({ role: 'cashier', type: 'ITEM_SERVED' }))
        .mockResolvedValueOnce(makeNotif({ role: 'waiter', type: 'ITEM_SERVED' }))

      await service.send({ role: ['cashier', 'waiter'], title: 'Món đã sẵn sàng', body: 'Cà phê sữa — Bàn 3', type: 'ITEM_SERVED', refId: 'order-2' })

      expect(toMock).toHaveBeenCalledWith('role:cashier')
      expect(toMock).toHaveBeenCalledWith('role:waiter')
      expect(emitMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('send — RETURN_REQUEST (barista)', () => {
    it('emits to role:barista', async () => {
      const notif = makeNotif({ type: 'RETURN_REQUEST' })
      jest.spyOn(prisma.notification, 'create').mockResolvedValue(notif)

      await service.send({ role: 'barista', title: 'Yêu cầu trả món', body: 'Trà đào — Bàn 2', type: 'RETURN_REQUEST', refId: 'item-1' })

      expect(toMock).toHaveBeenCalledWith('role:barista')
      expect(emitMock).toHaveBeenCalledWith('notification:new', notif)
    })
  })

  describe('send — RETURN_APPROVED (waiter)', () => {
    it('emits to role:waiter', async () => {
      const notif = makeNotif({ role: 'waiter', type: 'RETURN_APPROVED' })
      jest.spyOn(prisma.notification, 'create').mockResolvedValue(notif)

      await service.send({ role: 'waiter', title: 'Trả món được chấp nhận', body: 'Trà đào đã được duyệt', type: 'RETURN_APPROVED', refId: 'item-1' })

      expect(toMock).toHaveBeenCalledWith('role:waiter')
    })
  })

  describe('send — RETURN_REJECTED (waiter)', () => {
    it('emits to role:waiter', async () => {
      const notif = makeNotif({ role: 'waiter', type: 'RETURN_REJECTED' })
      jest.spyOn(prisma.notification, 'create').mockResolvedValue(notif)

      await service.send({ role: 'waiter', title: 'Trả món bị từ chối', body: 'Không đồng ý', type: 'RETURN_REJECTED', refId: 'item-1' })

      expect(toMock).toHaveBeenCalledWith('role:waiter')
    })
  })

  describe('send — CHECKOUT_REQUESTED (cashier)', () => {
    it('emits to role:cashier', async () => {
      const notif = makeNotif({ role: 'cashier', type: 'CHECKOUT_REQUESTED' })
      jest.spyOn(prisma.notification, 'create').mockResolvedValue(notif)

      await service.send({ role: 'cashier', title: 'Yêu cầu thanh toán', body: 'Bàn 5 yêu cầu thanh toán', type: 'CHECKOUT_REQUESTED', refId: 'order-5' })

      expect(toMock).toHaveBeenCalledWith('role:cashier')
    })
  })

  describe('send — ORDER_CANCELLED (cashier + waiter)', () => {
    it('sends to both cashier and waiter rooms', async () => {
      jest.spyOn(prisma.notification, 'create')
        .mockResolvedValueOnce(makeNotif({ role: 'cashier', type: 'ORDER_CANCELLED' }))
        .mockResolvedValueOnce(makeNotif({ role: 'waiter', type: 'ORDER_CANCELLED' }))

      await service.send({ role: ['cashier', 'waiter'], title: 'Order bị huỷ', body: 'Bàn 1 — order đã bị huỷ', type: 'ORDER_CANCELLED', refId: 'order-1' })

      expect(toMock).toHaveBeenCalledWith('role:cashier')
      expect(toMock).toHaveBeenCalledWith('role:waiter')
    })
  })

  describe('send — ITEM_PREPARING (cashier + waiter)', () => {
    it('emits to cashier and waiter rooms', async () => {
      jest.spyOn(prisma.notification, 'create')
        .mockResolvedValueOnce(makeNotif({ role: 'cashier', type: 'ITEM_PREPARING' }))
        .mockResolvedValueOnce(makeNotif({ role: 'waiter', type: 'ITEM_PREPARING' }))

      await service.send({ role: ['cashier', 'waiter'], title: 'Đang pha chế', body: 'Cà phê sữa — Bàn 2', type: 'ITEM_PREPARING', refId: 'order-2' })

      expect(toMock).toHaveBeenCalledWith('role:cashier')
      expect(toMock).toHaveBeenCalledWith('role:waiter')
    })
  })

  describe('send — ITEM_READY (cashier + waiter)', () => {
    it('emits to cashier and waiter rooms', async () => {
      jest.spyOn(prisma.notification, 'create')
        .mockResolvedValueOnce(makeNotif({ role: 'cashier', type: 'ITEM_READY' }))
        .mockResolvedValueOnce(makeNotif({ role: 'waiter', type: 'ITEM_READY' }))

      await service.send({ role: ['cashier', 'waiter'], title: 'Món sẵn sàng', body: 'Cà phê sữa — Bàn 2', type: 'ITEM_READY', refId: 'order-2' })

      expect(toMock).toHaveBeenCalledWith('role:cashier')
      expect(toMock).toHaveBeenCalledWith('role:waiter')
    })
  })

  describe('send — ITEM_CANCELLED (cashier + waiter)', () => {
    it('emits to cashier and waiter rooms', async () => {
      jest.spyOn(prisma.notification, 'create')
        .mockResolvedValueOnce(makeNotif({ role: 'cashier', type: 'ITEM_CANCELLED' }))
        .mockResolvedValueOnce(makeNotif({ role: 'waiter', type: 'ITEM_CANCELLED' }))

      await service.send({ role: ['cashier', 'waiter'], title: 'Món bị huỷ', body: 'Cà phê sữa — Bàn 2', type: 'ITEM_CANCELLED', refId: 'order-2' })

      expect(toMock).toHaveBeenCalledWith('role:cashier')
      expect(toMock).toHaveBeenCalledWith('role:waiter')
    })
  })

  describe('send — lỗi graceful', () => {
    it('does not throw when prisma.create fails', async () => {
      jest.spyOn(prisma.notification, 'create').mockRejectedValue(new Error('DB error'))

      await expect(
        service.send({ role: 'barista', title: 'Test', body: 'Body', type: 'ORDER_NEW' }),
      ).resolves.toBeUndefined()
    })
  })

  // ─── findByRole ─────────────────────────────────────────────────────────────

  describe('findByRole', () => {
    it('returns paginated notifications for a role', async () => {
      const items = [makeNotif(), makeNotif({ id: 'notif-2' })]
      jest.spyOn(prisma, '$transaction').mockResolvedValue([items, 5])

      const result = await service.findByRole('barista', 1, 2)

      expect(result).toEqual({ items, total: 5, page: 1, limit: 2 })
      expect(prisma.$transaction).toHaveBeenCalled()
    })

    it('defaults to page 1, limit 20', async () => {
      jest.spyOn(prisma, '$transaction').mockResolvedValue([[], 0])
      const result = await service.findByRole('cashier')
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })
  })

  // ─── markRead ───────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('sets read=true for the given id', async () => {
      const updated = makeNotif({ read: true })
      jest.spyOn(prisma.notification, 'update').mockResolvedValue(updated)

      const result = await service.markRead('notif-1')

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { read: true },
      })
      expect(result.read).toBe(true)
    })
  })

  // ─── markAllRead ─────────────────────────────────────────────────────────────

  describe('markAllRead', () => {
    it('updates all unread for role to read=true', async () => {
      jest.spyOn(prisma.notification, 'updateMany').mockResolvedValue({ count: 3 })

      const result = await service.markAllRead('waiter')

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { role: 'waiter', read: false },
        data: { read: true },
      })
      expect(result).toEqual({ success: true })
    })
  })

  // ─── countUnread ─────────────────────────────────────────────────────────────

  describe('countUnread', () => {
    it('returns unread count for role', async () => {
      jest.spyOn(prisma.notification, 'count').mockResolvedValue(7)

      const result = await service.countUnread('admin')

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { role: 'admin', read: false },
      })
      expect(result).toEqual({ count: 7 })
    })
  })
})
