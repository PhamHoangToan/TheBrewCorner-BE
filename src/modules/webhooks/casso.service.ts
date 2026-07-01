import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { InvoicesService } from '../invoices/invoices.service'

interface CassoTransaction {
  id: number
  tid: string
  description: string
  amount: number
  when: string
  bank_sub_acc_id?: string
  corresponsiveName?: string
  transactionType?: string
}

interface CassoPayload {
  error: number
  data: CassoTransaction | CassoTransaction[]
}

@Injectable()
export class CassoService {
  private readonly logger = new Logger(CassoService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async handleWebhook(payload: CassoPayload) {
    if (payload.error !== 0) return { success: 1, processed: 0 }

    const transactions: CassoTransaction[] = Array.isArray(payload.data)
      ? payload.data
      : [payload.data]

    let processed = 0
    for (const tx of transactions) {
      if (tx.transactionType && tx.transactionType !== 'in') continue
      try {
        const ok = await this.matchAndPay(tx)
        if (ok) processed++
      } catch (err: any) {
        this.logger.error(`Transaction ${tx.tid} error: ${err?.message}`)
      }
    }

    this.logger.log(`Casso webhook: ${transactions.length} tx(s), ${processed} processed`)
    return { success: 1, processed }
  }

  private async matchAndPay(tx: CassoTransaction): Promise<boolean> {
    const desc = (tx.description ?? '').toUpperCase()

    // Match "THECORNER <code>" or "THEBREWCORNER <code>"
    const match = desc.match(/THE(?:BREW)?CORNER\s+([A-Z0-9\-]+)/)
    if (!match) {
      this.logger.log(`No order code in: "${tx.description}"`)
      return false
    }

    const code = match[1].trim()
    const order = await this.prisma.order.findFirst({
      where: { code },
      include: { invoice: true },
    })

    if (order) return this.payOrder(order, tx)
    return this.payPendingTransfer(code, tx)
  }

  private async payOrder(
    order: { id: string; code: string; totalAmount: unknown; invoice: { status: string } | null },
    tx: CassoTransaction,
  ): Promise<boolean> {
    if (order.invoice?.status === 'PAID') {
      this.logger.log(`Order ${order.code} already paid`)
      return false
    }

    const expected = parseFloat(String(order.totalAmount ?? 0))
    if (expected > 0 && tx.amount < expected) {
      this.logger.warn(
        `Order ${order.code}: số tiền chuyển khoản (${tx.amount}) thấp hơn tổng hóa đơn (${expected}) — không tự động thanh toán, cần cashier kiểm tra thủ công`,
      )
      return false
    }

    const invoice = await this.invoicesService.create({
      orderId: order.id,
      subtotal: expected || tx.amount,
      discountAmount: 0,
      totalAmount: expected || tx.amount,
    })

    await this.invoicesService.pay(invoice.id, {
      method: 'BANK_TRANSFER',
      amount: tx.amount,
      note: `Casso: ${tx.tid}`,
    })

    this.logger.log(`Auto-paid order ${order.code} — ${tx.amount} VND (tid: ${tx.tid})`)
    return true
  }

  // Khách hàng bên Customer app chọn "chuyển khoản" trước khi đơn hàng được tạo — chưa có
  // order.code để match. Casso description dùng mã tham chiếu tạm (PendingTransfer.code) thay thế;
  // FE poll trạng thái này rồi mới cho tạo order kèm invoice đã PAID.
  private async payPendingTransfer(code: string, tx: CassoTransaction): Promise<boolean> {
    const pending = await this.prisma.pendingTransfer.findUnique({ where: { code } })
    if (!pending) {
      this.logger.warn(`Không tìm thấy order hoặc mã tham chiếu: ${code}`)
      return false
    }

    if (pending.status !== 'WAITING') {
      this.logger.log(`Pending transfer ${code} đã ở trạng thái ${pending.status}`)
      return false
    }

    const expected = parseFloat(String(pending.amount))
    if (tx.amount < expected) {
      this.logger.warn(
        `Pending transfer ${code}: số tiền chuyển khoản (${tx.amount}) thấp hơn dự kiến (${expected})`,
      )
      return false
    }

    await this.prisma.pendingTransfer.update({
      where: { code },
      data: { status: 'PAID', paidAt: new Date(), tid: tx.tid },
    })

    this.logger.log(`Pending transfer ${code} đã xác nhận thanh toán — ${tx.amount} VND (tid: ${tx.tid})`)
    return true
  }
}
