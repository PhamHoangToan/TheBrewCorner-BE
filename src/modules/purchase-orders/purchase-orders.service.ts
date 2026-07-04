import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'
import { IngredientsService } from '../ingredients/ingredients.service'

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingredientsService: IngredientsService,
  ) {}

  // Đề xuất nhập hàng: nguyên liệu sắp hết (forecast ≤ N ngày) → gợi ý SL nhập đủ dùng 14 ngày
  async suggestions(days = 7) {
    const forecast = await this.ingredientsService.forecast()
    return forecast
      .filter((f) => f.hasEnoughData && f.daysUntilStockout != null && f.daysUntilStockout <= days)
      .map((f) => {
        // đủ dùng 14 ngày, trừ tồn hiện có, làm tròn lên
        const target = f.avgDailyUsage * 14
        const suggestedQty = Math.max(0, Math.ceil(target - f.stockQuantity))
        return {
          ingredientId: f.ingredientId,
          ingredientName: f.name,
          unit: f.unit,
          stockQuantity: f.stockQuantity,
          avgDailyUsage: f.avgDailyUsage,
          daysUntilStockout: f.daysUntilStockout,
          suggestedQty: suggestedQty > 0 ? suggestedQty : Math.ceil(target),
        }
      })
  }

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = {}
    if (query.status) where.status = String(query.status)
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: { items: true, supplier: true },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true, supplier: true },
    })
    if (!po) throw new NotFoundException('Purchase order not found')
    return po
  }

  async create(body: Record<string, any>) {
    const items = (body.items ?? []) as Record<string, any>[]
    if (!items.length) throw new BadRequestException('Đơn đặt hàng phải có ít nhất 1 mặt hàng')

    let supplierId: string | null = body.supplierId ?? null
    let supplierName: string = body.supplierName ?? ''
    if (supplierId) {
      const s = await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } })
      if (s) supplierName = s.name
      else supplierId = null
    }
    if (!supplierName.trim()) throw new BadRequestException('Thiếu nhà cung cấp')

    return this.prisma.purchaseOrder.create({
      data: {
        code: body.code ?? `PO-${Date.now()}`,
        supplierId,
        supplierName,
        status: 'DRAFT',
        note: body.note ?? null,
        createdById: body.createdById ?? null,
        items: {
          create: items.map((it) => ({
            ingredientId: it.ingredientId ?? null,
            ingredientName: it.ingredientName ?? it.name ?? 'Nguyên liệu',
            quantity: Number(it.quantity ?? 0),
            unit: it.unit ?? 'kg',
            estPrice: Number(it.estPrice ?? it.unitPrice ?? 0),
          })),
        },
      },
      include: { items: true, supplier: true },
    })
  }

  async setStatus(id: string, status: string) {
    const po = await this.findOne(id)
    if (po.status === 'RECEIVED') throw new BadRequestException('Đơn đã nhận hàng, không đổi trạng thái được')
    const next = String(status).toUpperCase()
    if (!['DRAFT', 'SENT', 'CANCELLED'].includes(next)) throw new BadRequestException('Trạng thái không hợp lệ')
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: next as any } })
  }

  // Nhận hàng: sinh phiếu nhập kho từ PO rồi đánh dấu RECEIVED
  async receive(id: string, body: Record<string, any> = {}) {
    const po = await this.findOne(id)
    if (po.status === 'RECEIVED') throw new BadRequestException('Đơn này đã nhận hàng rồi')
    if (po.status === 'CANCELLED') throw new BadRequestException('Đơn đã hủy')

    const stockImport = await this.ingredientsService.createStockImport({
      supplierId: po.supplierId ?? undefined,
      supplierName: po.supplierName,
      note: `Từ đơn đặt hàng ${po.code}`,
      createdById: body.createdById ?? po.createdById ?? undefined,
      items: po.items.map((it) => ({
        ingredientId: it.ingredientId ?? undefined,
        ingredientName: it.ingredientName,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.estPrice),
        expiryDate: body.expiryDate ?? undefined,
      })),
    })

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date(), stockImportId: (stockImport as any)?.id ?? null },
    })
    return { received: true, stockImport }
  }

  async remove(id: string) {
    await this.findOne(id)
    await this.prisma.purchaseOrder.delete({ where: { id } })
    return { deleted: true }
  }
}
