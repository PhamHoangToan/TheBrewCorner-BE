import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { MembershipTier, PaymentMethod } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'
import { POINTS_PER_VND, redeemLoyaltyPoints, reverseLoyaltyForRefund } from '../../common/loyalty.util'
import { NotificationsService } from '../notifications/notifications.service'
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
    const where = { deletedAt: null }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { issuedAt: 'desc' },
        include: { order: { include: { table: true, items: true } }, cashier: true, promotion: true, payments: true, refunds: true },
      }),
      this.prisma.invoice.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { order: { include: { table: true, items: true } }, cashier: true, promotion: true, payments: true, refunds: true },
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

    // Cashier áp dụng đổi điểm: FE đã trừ redeemValue vào discountAmount/totalAmount,
    // BE trừ điểm + ghi giao dịch REDEEM (chặn dùng 2 lần cho cùng order)
    const redeemPoints = Math.max(0, Math.floor(Number(body.redeemPoints ?? 0)))
    if (redeemPoints > 0) {
      if (!order.customerId) throw new BadRequestException('Order không gắn với khách hàng thành viên')
      await redeemLoyaltyPoints(this.prisma, {
        userId: order.customerId,
        orderId: order.id,
        orderCode: order.code,
        points: redeemPoints,
      })
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

    // Tách trạng thái thanh toán khỏi tiến độ pha chế: invoice.status là nguồn sự thật
    // thanh toán. Order.status chỉ lên 'PAID' (hoàn tất trọn vẹn) khi đơn ĐÃ phục vụ xong —
    // thanh toán trước khi barista làm xong thì giữ nguyên SENT/PREPARING/READY để bếp còn thấy.
    const fulfilled = ['SERVED', 'CHECKOUT_REQUESTED', 'PAID'].includes(invoice.order.status)
    const finalOrderStatus = fulfilled ? 'PAID' : invoice.order.status

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
        ...(fulfilled
          ? [
              tx.order.update({ where: { id: invoice.orderId }, data: { status: 'PAID' } }),
              // Đơn hoàn tất: các item còn dang dở coi như đã phục vụ (barista thường chỉ
              // cập nhật cấp order, item dễ kẹt PENDING làm TableMap/KDS hiểu nhầm còn việc)
              tx.orderItem.updateMany({
                where: { orderId: invoice.orderId, status: { notIn: ['SERVED', 'RETURNED', 'CANCELLED'] } },
                data: { status: 'SERVED' },
              }),
            ]
          : []),
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
    this.notifications.emitOrderUpdate(invoice.orderId, { status: finalOrderStatus, invoiceStatus: 'PAID' })

    return result
  }

  private tierFor(totalSpent: number): MembershipTier {
    return TIER_THRESHOLDS.find((t) => totalSpent >= t.minSpent)?.tier ?? 'BASIC'
  }

  // Hoàn tiền hóa đơn đã thanh toán (toàn phần hoặc một phần).
  // Ghi InvoiceRefund + phiếu chi (FinanceTransaction EXPENSE). Hoàn toàn bộ → đảo ngược điểm loyalty.
  async refund(id: string, body: Record<string, any>) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { order: true, refunds: true },
    })
    if (!invoice) throw new NotFoundException('Invoice not found')
    if (!['PAID', 'PARTIAL_REFUND'].includes(invoice.status)) {
      throw new BadRequestException('Chỉ có thể hoàn tiền hóa đơn đã thanh toán')
    }

    const total = parseFloat(String(invoice.totalAmount))
    const already = invoice.refunds.reduce((s, r) => s + parseFloat(String(r.amount)), 0)
    const remaining = total - already
    const amount = Math.round(Number(body.amount ?? remaining))
    if (!(amount > 0)) throw new BadRequestException('Số tiền hoàn phải lớn hơn 0')
    if (amount > remaining + 0.5) {
      throw new BadRequestException(`Vượt quá số tiền còn có thể hoàn (còn ${remaining.toLocaleString('vi-VN')}đ)`)
    }
    const reason = String(body.reason ?? '').trim()
    if (!reason) throw new BadRequestException('Cần nhập lý do hoàn tiền')
    const method = this.method(body.method)
    const isFull = already + amount >= total - 0.5

    const refund = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoiceRefund.create({
        data: { invoiceId: id, amount, reason, method, refundedById: body.refundedById ?? null },
      })
      await tx.invoice.update({
        where: { id },
        data: { status: isFull ? 'REFUNDED' : 'PARTIAL_REFUND' },
      })
      await tx.financeTransaction.create({
        data: {
          code: `PC-RF-${Date.now()}`,
          type: 'EXPENSE',
          content: `Hoàn tiền HD ${invoice.code}: ${reason}`.slice(0, 255),
          amount,
          createdById: body.refundedById ?? null,
        },
      })
      return created
    }, { timeout: 15000, maxWait: 10000 })

    // Hoàn toàn bộ → đảo ngược điểm tích/đổi (idempotent, ngoài transaction chính)
    if (isFull && invoice.order.customerId) {
      await reverseLoyaltyForRefund(this.prisma, { orderId: invoice.orderId, refundAmount: total })
    }

    this.notifications.emitOrderUpdate(invoice.orderId, {
      invoiceStatus: isFull ? 'REFUNDED' : 'PARTIAL_REFUND',
    })
    return { refund, invoice: await this.findOne(id) }
  }

  async remove(id: string) {
    await this.prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } })
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
