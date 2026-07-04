import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } })
    if (!wallet) wallet = await this.prisma.wallet.create({ data: { userId } })
    return wallet
  }

  async summary(userId: string) {
    const wallet = await this.getOrCreate(userId)
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return {
      balance: parseFloat(String(wallet.balance)) || 0,
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: parseFloat(String(t.amount)) || 0,
        type: t.type,
        note: t.note,
        createdAt: t.createdAt,
      })),
    }
  }

  async credit(userId: string, amount: number, type: string, refId?: string, note?: string) {
    if (!(amount > 0)) throw new BadRequestException('Số tiền không hợp lệ')
    const wallet = await this.getOrCreate(userId)
    await this.prisma.$transaction([
      this.prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } }),
      this.prisma.walletTransaction.create({ data: { walletId: wallet.id, amount, type, refId: refId ?? null, note: note ?? null } }),
    ])
    return this.summary(userId)
  }

  async debit(userId: string, amount: number, refId?: string, note?: string) {
    if (!(amount > 0)) throw new BadRequestException('Số tiền không hợp lệ')
    const wallet = await this.getOrCreate(userId)
    if ((parseFloat(String(wallet.balance)) || 0) < amount) throw new BadRequestException('Số dư ví không đủ')
    await this.prisma.$transaction([
      this.prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } }),
      this.prisma.walletTransaction.create({ data: { walletId: wallet.id, amount: -amount, type: 'PAYMENT', refId: refId ?? null, note: note ?? null } }),
    ])
  }

  // Nạp ví sau khi Casso xác nhận PendingTransfer PAID (idempotent theo code)
  async topupFromPending(userId: string, code: string) {
    const pending = await this.prisma.pendingTransfer.findUnique({ where: { code } })
    if (!pending || pending.status !== 'PAID') throw new BadRequestException('Chưa nhận được tiền chuyển khoản')
    const existing = await this.prisma.walletTransaction.findFirst({ where: { refId: code, type: 'TOPUP' } })
    if (existing) return this.summary(userId)
    const amount = parseFloat(String(pending.amount)) || 0
    await this.prisma.pendingTransfer.update({ where: { code }, data: { status: 'CONSUMED' } })
    return this.credit(userId, amount, 'TOPUP', code, 'Nạp ví qua chuyển khoản')
  }
}
