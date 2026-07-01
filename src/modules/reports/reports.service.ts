import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [orders, invoices, products, ingredients, tables] = await this.prisma.$transaction([
      this.prisma.order.count(),
      this.prisma.invoice.aggregate({ _sum: { totalAmount: true }, where: { status: 'PAID' } }),
      this.prisma.product.count({ where: { isActive: true } }),
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

  async revenue() {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: 'PAID' },
      orderBy: { paidAt: 'desc' },
      select: { code: true, totalAmount: true, paidAt: true, issuedAt: true },
    })

    return invoices.map((invoice) => ({
      code: invoice.code,
      date: invoice.paidAt ?? invoice.issuedAt,
      totalAmount: Number(invoice.totalAmount),
    }))
  }

  async sales() {
    const items = await this.prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { quantity: 'desc' } },
    })

    return items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item._sum.quantity ?? 0,
      revenue: Number(item._sum.totalPrice ?? 0),
    }))
  }
}
