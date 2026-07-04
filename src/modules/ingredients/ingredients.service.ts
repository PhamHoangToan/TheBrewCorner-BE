import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { money, pagination, QueryParams } from '../../common/crud.types'
import { LowStockJob } from '../jobs/low-stock.job'
import { SuppliersService } from '../suppliers/suppliers.service'
import { consumeBatchesFEFO } from '../../common/stock-batch.util'

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lowStockJob: LowStockJob,
    private readonly suppliersService: SuppliersService,
  ) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where = query.search
      ? { deletedAt: null, name: { contains: query.search } }
      : { deletedAt: null }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ingredient.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.ingredient.count({ where }),
    ])

    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.ingredient.findFirst({ where: { id, deletedAt: null } })
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
    await this.prisma.ingredient.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  async stockStats() {
    const ingredients = await this.prisma.ingredient.findMany({
      where: { deletedAt: null },
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

  // Dự đoán ngày hết hàng dựa trên tốc độ tiêu thụ trung bình (xuất kho lý do SALES) 14 ngày gần nhất
  async forecast() {
    const windowDays = 14
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

    const rows = await this.prisma.$queryRaw<Array<{
      id: string
      name: string
      unit: string
      stockQuantity: number
      totalUsed: number | null
    }>>`
      SELECT i.id, i.name, i.unit,
             CAST(i.stockQuantity AS DECIMAL(10,2)) AS stockQuantity,
             CAST(COALESCE(SUM(sei.quantity), 0) AS DECIMAL(10,2)) AS totalUsed
      FROM ingredients i
      LEFT JOIN stock_export_items sei ON sei.ingredientId = i.id
      LEFT JOIN stock_exports se ON se.id = sei.stockExportId
        AND se.reason = 'SALES' AND se.exportDate >= ${since}
      WHERE i.isActive = 1 AND i.deletedAt IS NULL
      GROUP BY i.id, i.name, i.unit, i.stockQuantity
      ORDER BY i.name ASC
    `

    return rows.map((row) => {
      const stockQuantity = Number(row.stockQuantity)
      const totalUsed = Number(row.totalUsed ?? 0)
      const avgDailyUsage = totalUsed / windowDays

      if (avgDailyUsage <= 0) {
        return {
          ingredientId: row.id,
          name: row.name,
          unit: row.unit,
          stockQuantity,
          avgDailyUsage: 0,
          daysUntilStockout: null,
          predictedStockoutDate: null,
          hasEnoughData: false,
        }
      }

      const daysUntilStockout = stockQuantity / avgDailyUsage
      const predictedStockoutDate = new Date(Date.now() + daysUntilStockout * 24 * 60 * 60 * 1000)

      return {
        ingredientId: row.id,
        name: row.name,
        unit: row.unit,
        stockQuantity,
        avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
        daysUntilStockout: Math.round(daysUntilStockout * 10) / 10,
        predictedStockoutDate: predictedStockoutDate.toISOString(),
        hasEnoughData: true,
      }
    })
  }

  // Lô nguyên liệu sắp/đã hết hạn (còn hàng) — cảnh báo HSD
  async expiring(days = 7) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const batches = await this.prisma.stockBatch.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { lte: until } },
      include: { ingredient: { select: { name: true, unit: true, code: true } } },
      orderBy: { expiryDate: 'asc' },
    })
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return batches.map((b) => {
      const daysLeft = Math.round((new Date(b.expiryDate).getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000))
      return {
        id: b.id,
        ingredientName: b.ingredient?.name ?? '',
        code: b.ingredient?.code ?? '',
        unit: b.ingredient?.unit ?? '',
        quantity: Number(b.quantity),
        expiryDate: b.expiryDate,
        daysLeft,
        expired: daysLeft < 0,
      }
    })
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

    // Gắn phiếu nhập với NCC: ưu tiên supplierId từ FE mới, fallback tự tạo/tìm theo tên
    // để tương thích dữ liệu cũ chỉ có supplierName dạng text
    let supplierId: string | null = body.supplierId ?? null
    let supplierName: string = body.supplierName ?? body.nhacungcap ?? ''
    if (supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null } })
      if (supplier) supplierName = supplier.name
      else supplierId = null
    } else if (supplierName.trim()) {
      const supplier = await this.suppliersService.findOrCreateByName(supplierName)
      if (supplier) {
        supplierId = supplier.id
        supplierName = supplier.name
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.stockImport.create({
        data: {
          code: body.code ?? body.maphieunhap ?? `PNK-${Date.now()}`,
          importDate: new Date(body.importDate ?? body.ngaynhap ?? new Date()),
          supplierName,
          supplierId,
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

        // Tạo lô theo hạn dùng nếu phiếu nhập có HSD (để cảnh báo HSD + xuất FEFO)
        const expiry = item.expiryDate ?? item.hsd ?? item.hanSuDung
        if (expiry) {
          await tx.stockBatch.create({
            data: {
              ingredientId: ingredient.id,
              stockImportId: doc.id,
              initialQty: quantity,
              quantity,
              expiryDate: new Date(expiry),
            },
          })
        }
      }

      return tx.stockImport.findUnique({ where: { id: doc.id }, include: { items: true } })
    }, { timeout: 15000, maxWait: 10000 })
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
        // Trừ lô theo FEFO (hết hạn sớm dùng trước)
        await consumeBatchesFEFO(tx, ingredient.id, quantity)
      }

      return tx.stockExport.findUnique({ where: { id: doc.id }, include: { items: true } })
    }, { timeout: 15000, maxWait: 10000 })

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
