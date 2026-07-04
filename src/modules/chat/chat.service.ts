import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsGateway } from '../notifications/notifications.gateway'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly notifications: NotificationsService,
  ) {}

  // 1 khách (đăng nhập hoặc vãng lai theo localStorage threadId ở FE) chỉ nên có 1 thread OPEN
  // tại 1 thời điểm — nếu khách đã có thread mở, trả lại thread đó thay vì tạo trùng.
  async createThread(body: { customerId?: string; guestName?: string }) {
    const customerId = body.customerId?.trim() || null
    if (customerId) {
      const existing = await this.prisma.chatThread.findFirst({
        where: { customerId, status: 'OPEN' },
        orderBy: { lastMessageAt: 'desc' },
      })
      if (existing) return existing
    }

    return this.prisma.chatThread.create({
      data: {
        customerId,
        guestName: customerId ? null : (body.guestName?.trim().slice(0, 120) || 'Khách vãng lai'),
      },
    })
  }

  async getThread(id: string) {
    const thread = await this.prisma.chatThread.findUnique({ where: { id } })
    if (!thread) throw new NotFoundException('Không tìm thấy hội thoại')
    return thread
  }

  async listMessages(threadId: string) {
    await this.getThread(threadId)
    return this.prisma.chatMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } })
  }

  // Khách gửi tin — public, không cần đăng nhập
  async sendCustomerMessage(threadId: string, content: string) {
    const thread = await this.getThread(threadId)
    const text = content?.trim()
    if (!text) throw new BadRequestException('Nội dung tin nhắn không được để trống')

    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { threadId, senderType: 'CUSTOMER', content: text.slice(0, 2000) },
      }),
      this.prisma.chatThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date(), status: 'OPEN' }, // khách nhắn lại → mở lại nếu đã đóng
      }),
    ])

    this.gateway.emitChatMessage(threadId, message)
    await this.notifications.send({
      role: ['admin', 'cashier'],
      title: 'Khách nhắn tin hỗ trợ',
      body: thread.guestName ? `${thread.guestName}: ${text.slice(0, 100)}` : text.slice(0, 100),
      type: 'CHAT_NEW_MESSAGE',
      refId: threadId,
    })
    return message
  }

  // Nhân viên trả lời — @Roles ADMIN/CASHIER ở controller
  async sendStaffReply(threadId: string, staffId: string, content: string) {
    await this.getThread(threadId)
    const text = content?.trim()
    if (!text) throw new BadRequestException('Nội dung tin nhắn không được để trống')

    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { threadId, senderType: 'STAFF', senderId: staffId, content: text.slice(0, 2000) },
      }),
      this.prisma.chatThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
    ])

    this.gateway.emitChatMessage(threadId, message)
    return message
  }

  // Danh sách hội thoại cho nhân viên — kèm tin nhắn cuối + số tin chưa đọc từ khách
  async listThreads(status?: string) {
    const threads = await this.prisma.chatThread.findMany({
      where: status ? { status } : undefined,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })

    const unreadCounts = await this.prisma.chatMessage.groupBy({
      by: ['threadId'],
      where: { threadId: { in: threads.map((t) => t.id) }, senderType: 'CUSTOMER', read: false },
      _count: true,
    })
    const unreadMap = new Map(unreadCounts.map((u) => [u.threadId, u._count]))

    return threads.map((t) => ({
      id: t.id,
      customerId: t.customerId,
      customerName: t.customer?.name ?? t.guestName ?? 'Khách vãng lai',
      status: t.status,
      lastMessageAt: t.lastMessageAt,
      lastMessage: t.messages[0]?.content ?? null,
      unreadCount: unreadMap.get(t.id) ?? 0,
    }))
  }

  async markRead(threadId: string) {
    await this.getThread(threadId)
    await this.prisma.chatMessage.updateMany({
      where: { threadId, senderType: 'CUSTOMER', read: false },
      data: { read: true },
    })
    return { ok: true }
  }

  async closeThread(threadId: string) {
    await this.getThread(threadId)
    return this.prisma.chatThread.update({ where: { id: threadId }, data: { status: 'CLOSED' } })
  }
}
