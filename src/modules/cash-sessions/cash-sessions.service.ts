import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Mở ca quỹ — mỗi thu ngân chỉ 1 ca OPEN cùng lúc
  async open(body: Record<string, any>) {
    const userId = String(body.userId ?? '')
    if (!userId) throw new BadRequestException('Thiếu userId')

    const existing = await this.prisma.cashSession.findFirst({ where: { userId, status: 'OPEN' } })
    if (existing) throw new BadRequestException('Đã có ca đang mở — vui lòng đóng ca trước')

    return this.prisma.cashSession.create({
      data: {
        userId,
        openingFloat: Math.max(0, Number(body.openingFloat ?? 0)),
        note: body.note ? String(body.note).slice(0, 255) : null,
      },
    })
  }

  // Ca đang mở của 1 thu ngân (null nếu chưa mở) — kèm số liệu tạm tính hiện tại
  async current(userId: string) {
    if (!userId) throw new BadRequestException('Thiếu userId')
    const session = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    })
    if (!session) return null
    const summary = await this.summarize(session.openedAt, new Date())
    const expectedCash = (parseFloat(String(session.openingFloat)) || 0) + summary.expectedNet
    return { ...session, ...summary, expectedCash }
  }

  async findOne(id: string) {
    const session = await this.prisma.cashSession.findUnique({ where: { id }, include: { user: true } })
    if (!session) throw new NotFoundException('Cash session not found')
    return session
  }

  // Đóng ca — chốt expectedCash, đếm tiền thực, ghi chênh lệch
  async close(id: string, body: Record<string, any>) {
    const session = await this.prisma.cashSession.findUnique({ where: { id } })
    if (!session) throw new NotFoundException('Cash session not found')
    if (session.status === 'CLOSED') throw new BadRequestException('Ca này đã đóng')

    const closedAt = new Date()
    const summary = await this.summarize(session.openedAt, closedAt)
    const expectedCash = (parseFloat(String(session.openingFloat)) || 0) + summary.expectedNet
    const countedCash = Math.round(Number(body.countedCash ?? 0))
    const difference = countedCash - expectedCash

    return this.prisma.cashSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt,
        expectedCash,
        countedCash,
        difference,
        note: body.note ? String(body.note).slice(0, 255) : session.note,
      },
    })
  }

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = {}
    if (query.userId) where.userId = String(query.userId)
    if (query.status) where.status = String(query.status)

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cashSession.findMany({ where, skip, take, orderBy: { openedAt: 'desc' }, include: { user: true } }),
      this.prisma.cashSession.count({ where }),
    ])
    return { items, total, page, limit }
  }

  // Tạm tính tiền mặt kỳ vọng trong khoảng [from, to]:
  //   openingFloat KHÔNG cộng ở đây (cộng ở current/close) — chỉ trả các dòng phát sinh.
  //   Tiền mặt vào: InvoicePayment CASH. Tiền mặt ra: InvoiceRefund CASH.
  //   Thu/chi thủ công (Finance) trừ các phiếu chi hoàn tiền (code 'PC-RF-') để không trùng refund.
  private async summarize(from: Date, to: Date) {
    const [cashPayments, cashRefunds, receipts, expenses] = await Promise.all([
      this.prisma.invoicePayment.aggregate({
        _sum: { amount: true },
        where: { method: 'CASH', paidAt: { gte: from, lte: to } },
      }),
      this.prisma.invoiceRefund.aggregate({
        _sum: { amount: true },
        where: { method: 'CASH', createdAt: { gte: from, lte: to } },
      }),
      this.prisma.financeTransaction.aggregate({
        _sum: { amount: true },
        where: { type: 'RECEIPT', deletedAt: null, createdAt: { gte: from, lte: to }, code: { not: { startsWith: 'PC-RF-' } } },
      }),
      this.prisma.financeTransaction.aggregate({
        _sum: { amount: true },
        where: { type: 'EXPENSE', deletedAt: null, createdAt: { gte: from, lte: to }, code: { not: { startsWith: 'PC-RF-' } } },
      }),
    ])

    const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0
    const cashIn = num(cashPayments._sum.amount)
    const cashOut = num(cashRefunds._sum.amount)
    const otherReceipt = num(receipts._sum.amount)
    const otherExpense = num(expenses._sum.amount)

    return {
      cashPayments: cashIn,
      cashRefunds: cashOut,
      otherReceipt,
      otherExpense,
      // expectedCash CHƯA gồm openingFloat — người gọi cộng thêm
      expectedNet: cashIn - cashOut + otherReceipt - otherExpense,
    } as any
  }
}
