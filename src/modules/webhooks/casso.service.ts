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
    if (payload.error !== 0) return { processed: 0 }

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
    return { processed }
  }

  private async matchAndPay(tx: CassoTransaction): Promise<boolean> {
    const desc = (tx.description ?? '').toUpperCase()

    // Match "THECORNER <code>" or "THEBREWCORNER <code>"
    const match = desc.match(/THE(?:BREW)?CORNER\s+([A-Z0-9\-]+)/)
    if (!match) {
      this.logger.log(`No order code in: "${tx.description}"`)
      return false
    }

    const orderCode = match[1].trim()
    const order = await this.prisma.order.findFirst({
      where: { code: orderCode },
      include: { invoice: true },
    })

    if (!order) {
      this.logger.warn(`Order not found: ${orderCode}`)
      return false
    }

    if (order.invoice?.status === 'PAID') {
      this.logger.log(`Order ${orderCode} already paid`)
      return false
    }

    const invoice = await this.invoicesService.create({
      orderId: order.id,
      subtotal: parseFloat(String(order.totalAmount ?? tx.amount)),
      discountAmount: 0,
      totalAmount: tx.amount,
    })

    await this.invoicesService.pay(invoice.id, {
      method: 'BANK_TRANSFER',
      amount: tx.amount,
      note: `Casso: ${tx.tid}`,
    })

    this.logger.log(`Auto-paid order ${orderCode} — ${tx.amount} VND (tid: ${tx.tid})`)
    return true
  }
}
