import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { MembershipTier, PaymentMethod } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'
import { NotificationsService } from '../notifications/notifications.service'

const POINTS_PER_VND = 1 / 10000 // 10.000đ chi tiêu = 1 điểm
const TIER_THRESHOLDS: Array<{ tier: MembershipTier; minSpent: number }> = [
  { tier: 'GOLD', minSpent: 10_000_000 },
  { tier: 'SILVER', minSpent: 2_000_000 },
  { tier: 'BASIC', minSpent: 0 },
]

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        skip,
        take,
        orderBy: { issuedAt: 'desc' },
        include: { order: { include: { table: true, items: true } }, cashier: true, promotion: true, payments: true },
      }),
      this.prisma.invoice.count(),
    ])
    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.invoice.findUnique({
      where: { id },
      include: { order: { include: { table: true, items: true } }, cashier: true, promotion: true, payments: true },
    })
    if (!item) throw new NotFoundException('Invoice not found')
    return item
  }

  async create(body: Record<string, any>) {
    const order = await this.prisma.order.findUnique({
      where: { id: body.orderId },
      include: { table: true, invoice: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    if ((order as any).invoice?.status === 'PAID') {
      throw new ConflictException('Order này đã được thanh toán rồi')
    }

    return this.prisma.invoice.upsert({
      where: { orderId: order.id },
      update: {
        cashierId: body.cashierId,
        promotionId: body.promotionId ?? null,
        subtotal: body.subtotal ?? order.subtotal,
        discountAmount: body.discountAmount ?? 0,
        totalAmount: body.totalAmount ?? order.totalAmount,
      },
      create: {
        code: body.code ?? `HD-${Date.now()}`,
        orderId: order.id,
        cashierId: body.cashierId,
        promotionId: body.promotionId ?? null,
        subtotal: body.subtotal ?? order.subtotal,
        discountAmount: body.discountAmount ?? 0,
        totalAmount: body.totalAmount ?? order.totalAmount,
        status: 'UNPAID',
      },
      include: { order: true, promotion: true, payments: true },
    })
  }

  update(id: string, body: Record<string, any>) {
    return this.prisma.invoice.update({
      where: { id },
      data: {
        cashierId: body.cashierId,
        promotionId: body.promotionId,
        subtotal: body.subtotal,
        discountAmount: body.discountAmount,
        totalAmount: body.totalAmount,
        status: body.status,
        paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
      },
      include: { payments: true },
    })
  }

  async pay(id: string, body: Record<string, any>) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { order: { include: { items: true } } },
    })
    if (!invoice) throw new NotFoundException('Invoice not found')

    if (invoice.status === 'PAID') {
      const existing = await this.prisma.invoicePayment.findFirst({ where: { invoiceId: id } })
      if (existing) return existing
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const [payment] = await Promise.all([
        tx.invoicePayment.create({
          data: {
            invoiceId: id,
            method: this.method(body.method),
            amount: body.amount ?? invoice.totalAmount,
            note: body.note ?? null,
          },
        }),
        tx.invoice.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } }),
        tx.order.update({ where: { id: invoice.orderId }, data: { status: 'PAID' } }),
        ...(invoice.order.tableId
          ? [tx.cafeTable.update({ where: { id: invoice.order.tableId }, data: { status: 'SERVING' } })]
          : []),
      ])

      if (invoice.order.customerId) {
        const amount = parseFloat(String(invoice.totalAmount))
        const earnedPoints = Math.floor(amount * POINTS_PER_VND)
        if (earnedPoints > 0) {
          const [, user] = await Promise.all([
            tx.loyaltyTransaction.create({
              data: {
                userId: invoice.order.customerId,
                orderId: invoice.orderId,
                points: earnedPoints,
                type: 'EARN',
                description: `Tích điểm hóa đơn ${invoice.code}`,
              },
            }),
            tx.user.update({
              where: { id: invoice.order.customerId },
              data: {
                loyaltyPoints: { increment: earnedPoints },
                totalSpent: { increment: amount },
              },
            }),
          ])
          const tier = this.tierFor(parseFloat(String(user.totalSpent)))
          if (tier !== user.membershipTier) {
            await tx.user.update({ where: { id: user.id }, data: { membershipTier: tier } })
          }
        }
      }

      return payment
    }, { timeout: 15000, maxWait: 10000 })

    // Emit realtime ngoài transaction — chỉ là side-effect socket, không cần rollback nếu lỗi
    this.notifications.emitOrderUpdate(invoice.orderId, { status: 'PAID' })

    return result
  }

  private tierFor(totalSpent: number): MembershipTier {
    return TIER_THRESHOLDS.find((t) => totalSpent >= t.minSpent)?.tier ?? 'BASIC'
  }

  async remove(id: string) {
    await this.prisma.invoice.delete({ where: { id } })
    return { deleted: true }
  }

  private method(value: unknown): PaymentMethod {
    const raw = String(value ?? 'CASH').toUpperCase()
    if (raw.includes('BANK')) return 'BANK_TRANSFER'
    if (raw.includes('CARD')) return 'CARD'
    if (raw.includes('WALLET')) return 'E_WALLET'
    return 'CASH'
  }
}
