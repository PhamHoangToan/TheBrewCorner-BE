import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { money, pagination, QueryParams } from '../../common/crud.types'
import { LowStockJob } from '../jobs/low-stock.job'

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lowStockJob: LowStockJob,
  ) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where = query.search
      ? { name: { contains: query.search } }
      : {}

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ingredient.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.ingredient.count({ where }),
    ])

    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.ingredient.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('Ingredient not found')
    return item
  }

  create(body: Record<string, any>) {
    return this.prisma.ingredient.create({
      data: {
        code: body.code ?? body.ma ?? `NVL-${Date.now()}`,
        name: body.name ?? body.ten ?? body.tennvl,
        unit: body.unit ?? body.donVi ?? body.donvi ?? 'kg',
        stockQuantity: money(body.stockQuantity ?? body.tonKho ?? body.soluong) ?? 0,
        minQuantity: money(body.minQuantity ?? body.canhBao) ?? 0,
        isActive: body.isActive ?? true,
      },
    })
  }

  update(id: string, body: Record<string, any>) {
    return this.prisma.ingredient.update({
      where: { id },
      data: {
        code: body.code ?? body.ma,
        name: body.name ?? body.ten ?? body.tennvl,
        unit: body.unit ?? body.donVi ?? body.donvi,
        usagePerUnit: body.usagePerUnit != null ? money(body.usagePerUnit) : undefined,
        stockQuantity: money(body.stockQuantity ?? body.tonKho ?? body.soluong),
        minQuantity: money(body.minQuantity ?? body.canhBao),
        isActive: body.isActive,
      },
    })
  }

  async remove(id: string) {
    await this.prisma.ingredient.delete({ where: { id } })
    return { deleted: true }
  }

  async stockStats() {
    const ingredients = await this.prisma.ingredient.findMany({
      include: {
        importItems: true,
        exportItems: true,
      },
      orderBy: { code: 'asc' },
    })

    return ingredients.map((ingredient) => ({
      ingredientId: ingredient.id,
      code: ingredient.code,
      name: ingredient.name,
      unit: ingredient.unit,
      imported: ingredient.importItems.reduce((sum, item) => sum + Number(item.quantity), 0),
      exported: ingredient.exportItems.reduce((sum, item) => sum + Number(item.quantity), 0),
      stock: Number(ingredient.stockQuantity),
      minQuantity: Number(ingredient.minQuantity),
    }))
  }

  async stockImports(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockImport.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { items: { include: { ingredient: true } }, createdBy: true },
      }),
      this.prisma.stockImport.count(),
    ])
    return { items, total, page, limit }
  }

  async createStockImport(body: Record<string, any>) {
    const items = (body.items ?? []) as Record<string, any>[]
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.stockImport.create({
        data: {
          code: body.code ?? body.maphieunhap ?? `PNK-${Date.now()}`,
          importDate: new Date(body.importDate ?? body.ngaynhap ?? new Date()),
          supplierName: body.supplierName ?? body.nhacungcap ?? '',
          note: body.note ?? body.ghichu ?? null,
          totalAmount: items.reduce(
            (sum, item) => sum + Number(item.soluong ?? item.quantity ?? 0) * Number(item.dongia ?? item.unitPrice ?? 0),
            0,
          ),
          createdById: body.createdById,
        },
      })

      for (const item of items) {
        const ingredient = await this.findOrCreateIngredient(tx, item)
        const quantity = Number(item.quantity ?? item.soluong ?? 0)
        const unitPrice = Number(item.unitPrice ?? item.dongia ?? 0)
        await tx.stockImportItem.create({
          data: {
            stockImportId: doc.id,
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            quantity,
            unit: item.unit ?? item.donvi ?? ingredient.unit,
            unitPrice,
            totalPrice: quantity * unitPrice,
          },
        })
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { stockQuantity: { increment: quantity } },
        })
      }

      return tx.stockImport.findUnique({ where: { id: doc.id }, include: { items: true } })
    })
  }

  async stockExports(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockExport.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { items: { include: { ingredient: true } }, createdBy: true },
      }),
      this.prisma.stockExport.count(),
    ])
    return { items, total, page, limit }
  }

  async createStockExport(body: Record<string, any>) {
    const items = (body.items ?? []) as Record<string, any>[]
    const result = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.stockExport.create({
        data: {
          code: body.code ?? body.maphieuxuat ?? `PXK-${Date.now()}`,
          exportDate: new Date(body.exportDate ?? body.ngayxuat ?? new Date()),
          reason: this.exportReason(body.reason ?? body.lydo),
          note: body.note ?? body.ghichu ?? null,
          createdById: body.createdById,
        },
      })

      for (const item of items) {
        const ingredient = await this.findOrCreateIngredient(tx, item)
        const quantity = Number(item.quantity ?? item.soluong ?? 0)
        await tx.stockExportItem.create({
          data: {
            stockExportId: doc.id,
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            quantity,
            unit: item.unit ?? item.donvi ?? ingredient.unit,
          },
        })
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { stockQuantity: { decrement: quantity } },
        })
      }

      return tx.stockExport.findUnique({ where: { id: doc.id }, include: { items: true } })
    })

    // Kiểm tra ngay các nguyên liệu vừa xuất có sắp hết không
    const exportedIds = items
      .map((i: Record<string, any>) => i.ingredientId ?? i.code ?? i.ma)
      .filter(Boolean) as string[]
    this.lowStockJob.checkSpecificIngredients(exportedIds).catch(() => {})

    return result
  }

  private async findOrCreateIngredient(tx: any, item: Record<string, any>) {
    const idOrCode = item.ingredientId ?? item.code ?? item.ma
    const name = item.ingredientName ?? item.name ?? item.tennvl ?? item.ten
    const existing = idOrCode
      ? await tx.ingredient.findFirst({ where: { OR: [{ id: idOrCode }, { code: idOrCode }] } })
      : await tx.ingredient.findFirst({ where: { name } })

    if (existing) return existing
    return tx.ingredient.create({
      data: {
        code: item.code ?? item.ma ?? `NVL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name,
        unit: item.unit ?? item.donvi ?? 'kg',
        stockQuantity: 0,
        minQuantity: 0,
      },
    })
  }

  private exportReason(value: unknown) {
    const raw = String(value ?? 'OTHER').toLowerCase()
    if (raw.includes('ban') || raw.includes('bán') || raw.includes('sales')) return 'SALES'
    if (raw.includes('huy') || raw.includes('hủy') || raw.includes('damaged')) return 'DAMAGED'
    if (raw.includes('expired')) return 'EXPIRED'
    return 'OTHER'
  }
}
