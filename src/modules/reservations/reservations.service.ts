import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(body: Record<string, any>) {
    if (!body.customerName || !body.customerPhone || !body.reservedTime) {
      throw new BadRequestException('Thiếu thông tin họ tên, số điện thoại hoặc thời gian đặt bàn')
    }

    const reservation = await this.prisma.reservation.create({
      data: {
        customerId: body.customerId ?? null,
        customerName: String(body.customerName),
        customerPhone: String(body.customerPhone),
        tableId: body.tableId ?? null,
        numberOfGuests: Number(body.numberOfGuests ?? 1),
        reservedTime: new Date(body.reservedTime),
        note: body.note ? String(body.note).slice(0, 255) : null,
      },
      include: { table: true },
    })

    await this.notifications.send({
      role: ['admin', 'waiter'],
      title: 'Yêu cầu đặt bàn mới',
      body: `${reservation.customerName} — ${reservation.numberOfGuests} khách — ${reservation.reservedTime.toLocaleString('vi-VN')}`,
      type: 'RESERVATION_NEW',
      refId: reservation.id,
    })

    return reservation
  }

  async findAll(query: { status?: string; date?: string }) {
    const where: Record<string, any> = {}
    if (query.status) where.status = query.status
    if (query.date) {
      const start = new Date(`${query.date}T00:00:00`)
      const end = new Date(`${query.date}T23:59:59.999`)
      where.reservedTime = { gte: start, lte: end }
    }

    const items = await this.prisma.reservation.findMany({
      where,
      orderBy: { reservedTime: 'asc' },
      include: { table: true },
    })
    return { items, total: items.length }
  }

  async findByCustomer(customerId: string) {
    const items = await this.prisma.reservation.findMany({
      where: { customerId },
      orderBy: { reservedTime: 'desc' },
      include: { table: true },
    })
    return { items, total: items.length }
  }

  async confirm(id: string, tableId?: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } })
    if (!reservation) throw new NotFoundException('Không tìm thấy yêu cầu đặt bàn')

    if (tableId) {
      const table = await this.prisma.cafeTable.findUnique({ where: { id: tableId } })
      if (!table) throw new BadRequestException('Bàn không tồn tại')
      if (table.status !== 'AVAILABLE') throw new BadRequestException('Bàn đã được chọn không còn trống')
    }

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'CONFIRMED', tableId: tableId ?? reservation.tableId },
      include: { table: true },
    })

    if (updated.tableId) {
      await this.prisma.cafeTable.update({ where: { id: updated.tableId }, data: { status: 'RESERVED' } })
    }

    return updated
  }

  // customerId có giá trị → khách tự hủy (thêm ràng buộc sở hữu/thời gian).
  // Không truyền (admin/waiter hủy hộ qua FE nội bộ) → giữ hành vi cũ, không giới hạn.
  async cancel(id: string, customerId?: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } })
    if (!reservation) throw new NotFoundException('Không tìm thấy yêu cầu đặt bàn')

    if (customerId) {
      if (reservation.customerId !== customerId) throw new ForbiddenException('Bạn không có quyền hủy đặt bàn này')
      if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
        throw new BadRequestException('Chỉ hủy được yêu cầu đang chờ hoặc đã xác nhận')
      }
      const minutesLeft = (reservation.reservedTime.getTime() - Date.now()) / 60000
      if (minutesLeft < 60) {
        throw new BadRequestException('Chỉ hủy được trước giờ đến ít nhất 60 phút')
      }
    }

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    if (reservation.tableId) {
      const table = await this.prisma.cafeTable.findUnique({ where: { id: reservation.tableId } })
      if (table?.status === 'RESERVED') {
        await this.prisma.cafeTable.update({ where: { id: reservation.tableId }, data: { status: 'AVAILABLE' } })
      }
    }

    return updated
  }
}
