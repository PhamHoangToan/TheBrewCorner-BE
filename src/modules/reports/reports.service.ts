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

  private dateRange(query: { startDate?: string; endDate?: string }) {
    if (!query.startDate && !query.endDate) return undefined
    const gte = query.startDate ? new Date(`${query.startDate}T00:00:00`) : undefined
    const lte = query.endDate ? new Date(`${query.endDate}T23:59:59.999`) : undefined
    return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
  }
}
