import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { ReservationsService } from './reservations.service'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

const makeReservation = (overrides: Partial<any> = {}) => ({
  id: 'res-1',
  customerId: 'cust-1',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0901234567',
  tableId: null,
  numberOfGuests: 2,
  reservedTime: new Date('2026-07-10T19:00:00'),
  note: null,
  status: 'PENDING',
  ...overrides,
})

describe('ReservationsService', () => {
  let service: ReservationsService
  let prisma: any
  let notifications: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        {
          provide: PrismaService,
          useValue: {
            reservation: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            cafeTable: {
              update: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: NotificationsService,
          useValue: { send: jest.fn() },
        },
      ],
    }).compile()

    service = module.get(ReservationsService)
    prisma = module.get(PrismaService)
    notifications = module.get(NotificationsService)
  })

  describe('create', () => {
    it('báo lỗi nếu thiếu customerName/customerPhone/reservedTime', async () => {
      await expect(service.create({ customerPhone: '0901234567', reservedTime: '2026-07-10T19:00:00' }))
        .rejects.toThrow(BadRequestException)
      await expect(service.create({ customerName: 'A', reservedTime: '2026-07-10T19:00:00' }))
        .rejects.toThrow(BadRequestException)
      await expect(service.create({ customerName: 'A', customerPhone: '0901234567' }))
        .rejects.toThrow(BadRequestException)
    })

    it('tạo reservation PENDING và gửi thông báo tới admin + waiter', async () => {
      const reservation = makeReservation()
      prisma.reservation.create.mockResolvedValue(reservation)

      const result = await service.create({
        customerId: 'cust-1',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0901234567',
        numberOfGuests: 2,
        reservedTime: '2026-07-10T19:00:00',
      })

      expect(result).toEqual(reservation)
      expect(prisma.reservation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'cust-1',
          customerName: 'Nguyễn Văn A',
          customerPhone: '0901234567',
          numberOfGuests: 2,
        }),
      }))
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({
        role: ['admin', 'waiter'],
        type: 'RESERVATION_NEW',
        refId: 'res-1',
      }))
    })

    it('mặc định numberOfGuests = 1 nếu không truyền', async () => {
      prisma.reservation.create.mockResolvedValue(makeReservation({ numberOfGuests: 1 }))

      await service.create({
        customerName: 'Nguyễn Văn A',
        customerPhone: '0901234567',
        reservedTime: '2026-07-10T19:00:00',
      })

      expect(prisma.reservation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ numberOfGuests: 1 }),
      }))
    })
  })

  describe('findAll', () => {
    it('lọc theo status khi có truyền', async () => {
      prisma.reservation.findMany.mockResolvedValue([])
      await service.findAll({ status: 'PENDING' })
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { status: 'PENDING' },
      }))
    })

    it('lọc theo khoảng ngày khi có truyền date', async () => {
      prisma.reservation.findMany.mockResolvedValue([])
      await service.findAll({ date: '2026-07-10' })
      const call = prisma.reservation.findMany.mock.calls[0][0]
      expect(call.where.reservedTime.gte).toEqual(new Date('2026-07-10T00:00:00'))
      expect(call.where.reservedTime.lte).toEqual(new Date('2026-07-10T23:59:59.999'))
    })

    it('không filter gì nếu không truyền tham số', async () => {
      prisma.reservation.findMany.mockResolvedValue([])
      await service.findAll({})
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
    })
  })

  describe('findByCustomer', () => {
    it('trả về danh sách reservation của khách hàng', async () => {
      const items = [makeReservation()]
      prisma.reservation.findMany.mockResolvedValue(items)

      const result = await service.findByCustomer('cust-1')

      expect(result).toEqual({ items, total: 1 })
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { customerId: 'cust-1' },
      }))
    })
  })

  describe('confirm', () => {
    it('báo lỗi NotFoundException nếu không tìm thấy reservation', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null)
      await expect(service.confirm('missing')).rejects.toThrow(NotFoundException)
    })

    it('set status CONFIRMED và set bàn RESERVED nếu có tableId', async () => {
      prisma.reservation.findUnique.mockResolvedValue(makeReservation({ tableId: 'table-1' }))
      prisma.reservation.update.mockResolvedValue(makeReservation({ tableId: 'table-1', status: 'CONFIRMED' }))

      await service.confirm('res-1')

      expect(prisma.reservation.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'res-1' },
        data: { status: 'CONFIRMED' },
      }))
      expect(prisma.cafeTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'RESERVED' } })
    })

    it('không đụng bàn nếu reservation không có tableId', async () => {
      prisma.reservation.findUnique.mockResolvedValue(makeReservation({ tableId: null }))
      prisma.reservation.update.mockResolvedValue(makeReservation({ tableId: null, status: 'CONFIRMED' }))

      await service.confirm('res-1')

      expect(prisma.cafeTable.update).not.toHaveBeenCalled()
    })
  })

  describe('cancel', () => {
    it('báo lỗi NotFoundException nếu không tìm thấy reservation', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null)
      await expect(service.cancel('missing')).rejects.toThrow(NotFoundException)
    })

    it('set status CANCELLED và trả bàn về AVAILABLE nếu bàn đang RESERVED', async () => {
      prisma.reservation.findUnique.mockResolvedValue(makeReservation({ tableId: 'table-1' }))
      prisma.reservation.update.mockResolvedValue(makeReservation({ tableId: 'table-1', status: 'CANCELLED' }))
      prisma.cafeTable.findUnique.mockResolvedValue({ id: 'table-1', status: 'RESERVED' })

      await service.cancel('res-1')

      expect(prisma.cafeTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'AVAILABLE' } })
    })

    it('không đụng bàn nếu bàn không còn ở trạng thái RESERVED (đã dùng cho việc khác)', async () => {
      prisma.reservation.findUnique.mockResolvedValue(makeReservation({ tableId: 'table-1' }))
      prisma.reservation.update.mockResolvedValue(makeReservation({ tableId: 'table-1', status: 'CANCELLED' }))
      prisma.cafeTable.findUnique.mockResolvedValue({ id: 'table-1', status: 'SERVING' })

      await service.cancel('res-1')

      expect(prisma.cafeTable.update).not.toHaveBeenCalled()
    })

    it('không đụng bàn nếu reservation không có tableId', async () => {
      prisma.reservation.findUnique.mockResolvedValue(makeReservation({ tableId: null }))
      prisma.reservation.update.mockResolvedValue(makeReservation({ tableId: null, status: 'CANCELLED' }))

      await service.cancel('res-1')

      expect(prisma.cafeTable.findUnique).not.toHaveBeenCalled()
      expect(prisma.cafeTable.update).not.toHaveBeenCalled()
    })
  })
})
