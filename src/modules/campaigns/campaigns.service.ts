import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'
import { MailService } from '../mail/mail.service'
import { PushService } from '../push/push.service'

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly push: PushService,
  ) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.campaign.count(),
    ])
    return { items, total, page, limit }
  }

  create(body: Record<string, any>) {
    if (!body.title || !body.content) throw new BadRequestException('Thiếu tiêu đề hoặc nội dung')
    return this.prisma.campaign.create({
      data: {
        title: String(body.title),
        content: String(body.content),
        channel: this.channel(body.channel),
        segment: this.segment(body.segment),
        status: 'DRAFT',
      },
    })
  }

  // Ước lượng số người nhận của 1 phân khúc (để preview trước khi gửi)
  async previewCount(segment: string) {
    const users = await this.resolveRecipients(this.segment(segment))
    return { count: users.length }
  }

  async send(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } })
    if (!campaign) throw new NotFoundException('Campaign not found')
    if (campaign.status === 'SENT') throw new BadRequestException('Chiến dịch đã gửi rồi')

    const users = await this.resolveRecipients(campaign.segment)
    let sent = 0
    for (const user of users) {
      try {
        if ((campaign.channel === 'EMAIL' || campaign.channel === 'BOTH') && user.email) {
          await this.mail.sendCampaignEmail(user.email, campaign.title, campaign.content)
        }
        if (campaign.channel === 'PUSH' || campaign.channel === 'BOTH') {
          // refId trỏ về campaign để tính được tỉ lệ đọc theo từng chiến dịch (xem stats()).
          await this.prisma.notification.create({
            data: { role: 'customer', userId: user.id, title: campaign.title, body: campaign.content.slice(0, 255), type: 'MARKETING', refId: campaign.id },
          })
          this.push.sendToUser(user.id, campaign.title, campaign.content.slice(0, 255), { type: 'MARKETING' }).catch(() => {})
        }
        sent++
      } catch {
        // bỏ qua user lỗi, tiếp tục gửi phần còn lại
      }
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sentCount: sent },
    })
    return { sent, total: users.length }
  }

  // Tỉ lệ đọc chỉ đo được với kênh PUSH/BOTH (dựa vào Notification.refId gắn khi gửi).
  // Kênh EMAIL không có tracking pixel nên không đo được mở/click.
  async stats(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } })
    if (!campaign) throw new NotFoundException('Campaign not found')

    if (campaign.channel === 'EMAIL') {
      return { channel: campaign.channel, trackable: false, sent: campaign.sentCount, read: null, readRate: null }
    }

    const [sent, read] = await this.prisma.$transaction([
      this.prisma.notification.count({ where: { refId: id, type: 'MARKETING' } }),
      this.prisma.notification.count({ where: { refId: id, type: 'MARKETING', read: true } }),
    ])

    // Campaign gửi TRƯỚC khi Notification.refId được gắn: đã gửi thật (sentCount > 0)
    // nhưng không có notification nào match → báo "không theo dõi được" thay vì 0/0 (0%).
    if (sent === 0 && campaign.sentCount > 0) {
      return { channel: campaign.channel, trackable: false, sent: campaign.sentCount, read: null, readRate: null }
    }

    return {
      channel: campaign.channel,
      trackable: true,
      sent,
      read,
      readRate: sent > 0 ? read / sent : 0,
    }
  }

  private async resolveRecipients(segment: string): Promise<Array<{ id: string; email: string | null }>> {
    const base: Record<string, any> = { role: 'CUSTOMER', deletedAt: null, marketingOptIn: true }

    if (segment === 'GOLD') base.membershipTier = 'GOLD'
    else if (segment === 'SILVER') base.membershipTier = 'SILVER'
    else if (segment === 'INACTIVE_30D') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      base.customerOrders = { some: {}, none: { createdAt: { gte: thirtyDaysAgo } } }
    }

    if (segment === 'BIRTHDAY_MONTH') {
      const users = await this.prisma.user.findMany({
        where: { ...base, birthday: { not: null } },
        select: { id: true, email: true, birthday: true },
      })
      const month = new Date().getMonth()
      return users.filter((u) => u.birthday && new Date(u.birthday).getMonth() === month)
    }

    return this.prisma.user.findMany({ where: base, select: { id: true, email: true } })
  }

  private channel(value: unknown): string {
    const raw = String(value ?? 'EMAIL').toUpperCase()
    if (raw === 'PUSH') return 'PUSH'
    if (raw === 'BOTH') return 'BOTH'
    return 'EMAIL'
  }

  private segment(value: unknown): string {
    const raw = String(value ?? 'ALL').toUpperCase()
    return ['ALL', 'GOLD', 'SILVER', 'INACTIVE_30D', 'BIRTHDAY_MONTH'].includes(raw) ? raw : 'ALL'
  }
}
