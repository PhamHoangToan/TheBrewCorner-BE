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

interface SendParams {
  role: NotifRole | NotifRole[]
  title: string
  body: string
  type: NotifType
  refId?: string
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
            title: params.title,
            body: params.body,
            type: params.type,
            refId: params.refId ?? null,
          },
        })
        this.gateway.server.to(`role:${role}`).emit('notification:new', notif)
      } catch (err) {
        console.error(`[Notification] Failed to send to ${role}:`, (err as any)?.message ?? err)
      }
    }
  }

  async findByRole(role: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { role },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { role } }),
    ])
    return { items, total, page, limit }
  }

  async markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { read: true } })
  }

  async markAllRead(role: string) {
    await this.prisma.notification.updateMany({ where: { role, read: false }, data: { read: true } })
    return { success: true }
  }

  async countUnread(role: string) {
    const count = await this.prisma.notification.count({ where: { role, read: false } })
    return { count }
  }

  emitOrderUpdate(orderId: string, payload: unknown) {
    this.gateway.emitOrderUpdate(orderId, payload)
  }
}
