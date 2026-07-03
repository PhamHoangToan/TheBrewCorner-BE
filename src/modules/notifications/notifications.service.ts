import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsGateway } from './notifications.gateway'

export type NotifRole = 'admin' | 'cashier' | 'barista' | 'waiter'
export type NotifType =
  | 'ORDER_NEW'
  | 'ORDER_PREPARING'
  | 'ORDER_READY'
  | 'ORDER_CANCELLED'
  | 'ITEM_PREPARING'
  | 'ITEM_READY'
  | 'ITEM_SERVED'
  | 'ITEM_CANCELLED'
  | 'RETURN_REQUEST'
  | 'RETURN_APPROVED'
  | 'RETURN_REJECTED'
  | 'CHECKOUT_REQUESTED'
  | 'LOW_STOCK'
  | 'STOCK_FORECAST'
  | 'PAYROLL_READY'
  | 'RESERVATION_NEW'
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'SHIFT_ASSIGNED'
  | 'SHIFT_REQUEST_APPROVED'
  | 'SHIFT_REQUEST_REJECTED'
  | 'CORRECTION_APPROVED'
  | 'CORRECTION_REJECTED'
  | 'PAYROLL_APPROVED'

interface SendParams {
  role: NotifRole | NotifRole[]
  title: string
  body: string
  type: NotifType
  refId?: string
  // Thông báo cá nhân (duyệt nghỉ phép, phân ca...) — chỉ user này thấy, không phát cho cả role
  userId?: string
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async send(params: SendParams) {
    const roles = Array.isArray(params.role) ? params.role : [params.role]
    for (const role of roles) {
      try {
        const notif = await this.prisma.notification.create({
          data: {
            role,
            userId: params.userId ?? null,
            title: params.title,
            body: params.body,
            type: params.type,
            refId: params.refId ?? null,
          },
        })
        // Thông báo cá nhân không phát lên socket theo role — mobile app lấy qua polling
        if (!params.userId) {
          this.gateway.server.to(`role:${role}`).emit('notification:new', notif)
        }
      } catch (err) {
        console.error(`[Notification] Failed to send to ${role}:`, (err as any)?.message ?? err)
      }
    }
  }

  // Chuông thông báo web nội bộ — chỉ thông báo chung theo role, không lộ thông báo cá nhân
  async findByRole(role: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit
    const where = { role, userId: null }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ])
    return { items, total, page, limit }
  }

  // Màn hình thông báo app Employee — thông báo cá nhân của đúng user
  async findByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit
    const where = { userId }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { read: true } })
  }

  async markAllRead(filter: { role?: string; userId?: string }) {
    const where = filter.userId ? { userId: filter.userId, read: false } : { role: filter.role, userId: null, read: false }
    await this.prisma.notification.updateMany({ where, data: { read: true } })
    return { success: true }
  }

  async countUnread(filter: { role?: string; userId?: string }) {
    const where = filter.userId ? { userId: filter.userId, read: false } : { role: filter.role, userId: null, read: false }
    const count = await this.prisma.notification.count({ where })
    return { count }
  }

  emitOrderUpdate(orderId: string, payload: unknown) {
    this.gateway.emitOrderUpdate(orderId, payload)
  }
}
