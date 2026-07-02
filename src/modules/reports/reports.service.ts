import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [orders, invoices, products, ingredients, tables] = await this.prisma.$transaction([
      this.prisma.order.count(),
      this.prisma.invoice.aggregate({ _sum: { totalAmount: true }, where: { status: 'PAID' } }),
      this.prisma.product.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.ingredient.count({ where: { stockQuantity: { lte: this.prisma.ingredient.fields.minQuantity } as any } }),
      this.prisma.cafeTable.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } }),
    ])

    return {
      orders,
      revenue: Number(invoices._sum.totalAmount ?? 0),
      products,
      lowStockIngredients: ingredients,
      tables,
    }
  }

  async revenue(query: { startDate?: string; endDate?: string }) {
    const range = this.dateRange(query)
    const invoices = await this.prisma.invoice.findMany({
      where: { status: 'PAID', ...(range ? { paidAt: range } : {}) },
      orderBy: { paidAt: 'desc' },
      select: { code: true, totalAmount: true, paidAt: true, issuedAt: true },
    })

    return invoices.map((invoice) => ({
      code: invoice.code,
      date: invoice.paidAt ?? invoice.issuedAt,
      totalAmount: Number(invoice.totalAmount),
    }))
  }

  async sales(query: { startDate?: string; endDate?: string }) {
    const range = this.dateRange(query)
    const items = await this.prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      _sum: { quantity: true, totalPrice: true },
      where: range ? { order: { invoice: { status: 'PAID', paidAt: range } } } : undefined,
      orderBy: { _sum: { quantity: 'desc' } },
    })

    return items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item._sum.quantity ?? 0,
      revenue: Number(item._sum.totalPrice ?? 0),
    }))
  }

  async topProducts(query: { startDate?: string; endDate?: string; limit?: string }) {
    const items = await this.sales(query)
    const limit = Number(query.limit ?? 10)
    return items.slice(0, limit)
  }

  async revenueByHour(query: { startDate?: string; endDate?: string }) {
    const range = this.dateRange(query)
    const since = range?.gte ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const until = range?.lte ?? new Date()

    const rows = await this.prisma.$queryRaw<Array<{ hour: number; revenue: number; orderCount: number }>>`
      SELECT HOUR(paidAt) AS hour,
             CAST(SUM(totalAmount) AS DECIMAL(14,2)) AS revenue,
             COUNT(*) AS orderCount
      FROM invoices
      WHERE status = 'PAID' AND paidAt BETWEEN ${since} AND ${until}
      GROUP BY HOUR(paidAt)
    `

    const byHour = new Map(rows.map((r) => [Number(r.hour), r]))
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue: Number(byHour.get(hour)?.revenue ?? 0),
      orderCount: Number(byHour.get(hour)?.orderCount ?? 0),
    }))
  }

  private dateRange(query: { startDate?: string; endDate?: string }) {
    if (!query.startDate && !query.endDate) return undefined
    const gte = query.startDate ? new Date(`${query.startDate}T00:00:00`) : undefined
    const lte = query.endDate ? new Date(`${query.endDate}T23:59:59.999`) : undefined
    return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
  }
}
