import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PaymentMethod } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId: id,
          method: this.method(body.method),
          amount: body.amount ?? invoice.totalAmount,
          note: body.note ?? null,
        },
      })
      await tx.invoice.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } })
      await tx.order.update({ where: { id: invoice.orderId }, data: { status: 'PAID' } })

      if (invoice.order.tableId) {
        await tx.cafeTable.update({
          where: { id: invoice.order.tableId },
          data: { status: 'SERVING' },
        })
      }

      return payment
    })
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
