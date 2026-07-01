import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd   = new Date(todayStart.getTime() + 86_400_000)
    const week7Start = new Date(todayStart.getTime() - 6 * 86_400_000)

    const [todayPaidOrders, ordersToday, tables, users] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: 'PAID', createdAt: { gte: todayStart, lt: todayEnd } },
        select: { totalAmount: true },
      }),
      this.prisma.order.count({
        where: { status: { notIn: ['CANCELLED', 'DRAFT'] }, createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.cafeTable.findMany({ select: { status: true } }),
      this.prisma.user.count(),
    ])

    const revenueToday = todayPaidOrders.reduce((s, o) => s + Number(o.totalAmount), 0)

    // Doanh thu 7 ngày
    const revenueWeek = await this.buildRevenueChart(todayStart)

    // Trạng thái bàn
    const tableStatus = {
      available:         tables.filter((t) => t.status === 'AVAILABLE').length,
      serving:           tables.filter((t) => t.status === 'SERVING').length,
      checkoutRequested: tables.filter((t) => t.status === 'CHECKOUT_REQUESTED').length,
    }

    // Nguyên liệu sắp hết
    const [lowStockResult] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM ingredients
      WHERE isActive = 1 AND minQuantity > 0 AND stockQuantity <= minQuantity
    `
    const lowStockCount = Number(lowStockResult?.count ?? 0)

    // Top 5 sản phẩm bán chạy (7 ngày)
    const topRaw = await this.prisma.$queryRaw<{ name: string; qty: number }[]>`
      SELECT p.name, SUM(oi.quantity) AS qty
      FROM order_items oi
      JOIN products p ON p.id = oi.productId
      JOIN orders   o ON o.id = oi.orderId
      WHERE o.createdAt >= ${week7Start} AND o.status NOT IN ('CANCELLED','DRAFT')
      GROUP BY oi.productId, p.name
      ORDER BY qty DESC
      LIMIT 5
    `
    const topProducts = topRaw.map((r) => ({ name: r.name, qty: Number(r.qty) }))

    // Đơn hàng gần đây
    const recentOrders = await this.prisma.order.findMany({
      where: { status: { notIn: ['CANCELLED', 'DRAFT'] } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true, code: true, totalAmount: true, status: true, createdAt: true, type: true,
        table: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    })

    return {
      revenueToday,
      ordersToday,
      tablesServing: tableStatus.serving,
      tablesTotal:   tables.length,
      lowStockCount,
      staffCount:    users,
      tableStatus,
      revenueWeek,
      topProducts,
      recentOrders: recentOrders.map((o) => ({
        id:          o.id,
        code:        o.code,
        tableName:   o.table?.name ?? 'Mang về',
        createdBy:   o.createdBy?.name ?? '—',
        totalAmount: Number(o.totalAmount),
        status:      o.status,
        type:        o.type,
        createdAt:   o.createdAt,
      })),
    }
  }

  private async buildRevenueChart(todayStart: Date) {
    const result: { date: string; revenue: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart.getTime() - i * 86_400_000)
      const dayEnd   = new Date(dayStart.getTime() + 86_400_000)
      const rows     = await this.prisma.order.findMany({
        where: { status: 'PAID', createdAt: { gte: dayStart, lt: dayEnd } },
        select: { totalAmount: true },
      })
      result.push({
        date:    dayStart.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        revenue: rows.reduce((s, o) => s + Number(o.totalAmount), 0),
      })
    }
    return result
  }
}
