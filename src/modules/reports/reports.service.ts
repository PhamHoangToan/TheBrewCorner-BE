import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { convertToStockUnit } from '../../common/unit-conversion.util'

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

  // Báo cáo lãi/lỗ theo món: giá vốn (COGS) = tổng nguyên liệu theo recipe × giá nhập
  // gần nhất của từng nguyên liệu; lợi nhuận tính trên số món đã bán (invoice PAID) trong khoảng ngày
  async profit(query: { startDate?: string; endDate?: string }) {
    const [products, importItems, sold] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null },
        include: {
          recipes: { include: { ingredient: { select: { id: true, unit: true, usagePerUnit: true } } } },
        },
      }),
      // Giá nhập gần nhất mỗi nguyên liệu (lô nhập mới nhất)
      this.prisma.stockImportItem.findMany({
        include: { stockImport: { select: { createdAt: true } } },
        orderBy: { stockImport: { createdAt: 'desc' } },
      }),
      this.sales(query),
    ])

    const latestPrice = new Map<string, number>()
    for (const item of importItems) {
      if (!latestPrice.has(item.ingredientId)) {
        latestPrice.set(item.ingredientId, parseFloat(String(item.unitPrice)))
      }
    }

    const soldByProduct = new Map(sold.map((s) => [s.productId, s]))

    const rows = products.map((product) => {
      // Giá vốn 1 món = Σ (lượng recipe quy về đơn vị kho × giá nhập 1 đơn vị kho)
      const cost = product.recipes.reduce((sum, recipe) => {
        const unitPrice = latestPrice.get(recipe.ingredientId) ?? 0
        const waste = parseFloat(String(recipe.wastePercent ?? 0))
        const rawQty = parseFloat(String(recipe.quantity)) * (1 + waste / 100)
        const usagePerUnit = parseFloat(String(recipe.ingredient.usagePerUnit ?? 1)) || 1
        const stockQty = convertToStockUnit(rawQty, recipe.unit ?? '', recipe.ingredient.unit ?? '', usagePerUnit)
        return sum + stockQty * unitPrice
      }, 0)

      const price = parseFloat(String(product.price))
      const soldInfo = soldByProduct.get(product.id)
      const soldQty = soldInfo?.quantity ?? 0
      const revenue = soldInfo?.revenue ?? 0
      const totalCost = cost * soldQty

      return {
        productId: product.id,
        name: product.name,
        price,
        cost: Math.round(cost),
        margin: Math.round(price - cost),
        marginPercent: price > 0 ? Math.round(((price - cost) / price) * 100) : 0,
        hasRecipe: product.recipes.length > 0,
        soldQty,
        revenue,
        totalCost: Math.round(totalCost),
        profit: Math.round(revenue - totalCost),
      }
    })

    rows.sort((a, b) => b.profit - a.profit)

    return {
      items: rows,
      summary: {
        totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
        totalCost: rows.reduce((s, r) => s + r.totalCost, 0),
        totalProfit: rows.reduce((s, r) => s + r.profit, 0),
      },
    }
  }

  // Báo cáo cuối ngày (Z-report): doanh thu theo phương thức thanh toán, hoàn tiền,
  // và các ca quỹ đã chốt trong ngày.
  async zReport(query: { date?: string }) {
    const day = query.date ? new Date(`${query.date}T00:00:00`) : new Date()
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0)
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999)

    const [payments, refunds, sessions] = await Promise.all([
      this.prisma.invoicePayment.groupBy({
        by: ['method'],
        _sum: { amount: true },
        _count: true,
        where: { paidAt: { gte: from, lte: to } },
      }),
      this.prisma.invoiceRefund.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.cashSession.findMany({
        where: { OR: [{ closedAt: { gte: from, lte: to } }, { status: 'OPEN', openedAt: { gte: from, lte: to } }] },
        include: { user: { select: { name: true, code: true } } },
        orderBy: { openedAt: 'asc' },
      }),
    ])

    const byMethod = payments.map((p) => ({
      method: p.method,
      count: p._count,
      amount: parseFloat(String(p._sum.amount ?? 0)) || 0,
    }))
    const grossRevenue = byMethod.reduce((s, m) => s + m.amount, 0)
    const totalRefund = parseFloat(String(refunds._sum.amount ?? 0)) || 0

    return {
      date: from,
      byMethod,
      grossRevenue,
      totalRefund,
      refundCount: refunds._count,
      netRevenue: grossRevenue - totalRefund,
      cashSessions: sessions.map((s) => ({
        id: s.id,
        cashier: s.user?.name ?? s.userId,
        status: s.status,
        openingFloat: parseFloat(String(s.openingFloat)) || 0,
        expectedCash: s.expectedCash != null ? parseFloat(String(s.expectedCash)) : null,
        countedCash: s.countedCash != null ? parseFloat(String(s.countedCash)) : null,
        difference: s.difference != null ? parseFloat(String(s.difference)) : null,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
      })),
    }
  }

  // Báo cáo hao hụt/đổ bỏ (xuất kho lý do DAMAGED/EXPIRED) — giá trị = SL × giá nhập gần nhất
  async waste(query: { startDate?: string; endDate?: string }) {
    const range = this.dateRange(query)
    const items = await this.prisma.stockExportItem.groupBy({
      by: ['ingredientId', 'ingredientName'],
      _sum: { quantity: true },
      where: {
        stockExport: {
          reason: { in: ['DAMAGED', 'EXPIRED'] },
          ...(range ? { exportDate: range } : {}),
        },
      },
    })

    const rows = await Promise.all(
      items.map(async (it) => {
        const lastImport = await this.prisma.stockImportItem.findFirst({
          where: { ingredientId: it.ingredientId },
          orderBy: { stockImport: { importDate: 'desc' } },
          select: { unitPrice: true },
        })
        const quantity = Number(it._sum.quantity ?? 0)
        const unitPrice = Number(lastImport?.unitPrice ?? 0)
        return {
          ingredientId: it.ingredientId,
          ingredientName: it.ingredientName,
          quantity,
          unitPrice,
          cost: Math.round(quantity * unitPrice),
        }
      }),
    )
    rows.sort((a, b) => b.cost - a.cost)
    return { items: rows, totalCost: rows.reduce((s, r) => s + r.cost, 0) }
  }

  // Hiệu suất nhân viên (thu ngân): số hóa đơn + doanh thu trong kỳ
  async staffPerformance(query: { startDate?: string; endDate?: string }) {
    const range = this.dateRange(query)
    const grouped = await this.prisma.invoice.groupBy({
      by: ['cashierId'],
      _count: true,
      _sum: { totalAmount: true },
      where: { status: 'PAID', cashierId: { not: null }, ...(range ? { paidAt: range } : {}) },
    })
    const rows = await Promise.all(
      grouped.map(async (g) => {
        const user = g.cashierId
          ? await this.prisma.user.findUnique({ where: { id: g.cashierId }, select: { name: true, code: true, role: true } })
          : null
        return {
          userId: g.cashierId,
          name: user?.name ?? '—',
          code: user?.code ?? '',
          role: user?.role ?? '',
          invoiceCount: g._count,
          revenue: parseFloat(String(g._sum.totalAmount ?? 0)) || 0,
        }
      }),
    )
    rows.sort((a, b) => b.revenue - a.revenue)
    return rows
  }

  private dateRange(query: { startDate?: string; endDate?: string }) {
    if (!query.startDate && !query.endDate) return undefined
    const gte = query.startDate ? new Date(`${query.startDate}T00:00:00`) : undefined
    const lte = query.endDate ? new Date(`${query.endDate}T23:59:59.999`) : undefined
    return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
  }
}
