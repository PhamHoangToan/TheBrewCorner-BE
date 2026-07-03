import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where: Prisma.SupplierWhereInput = { deletedAt: null }
    if (query.search) {
      where.OR = [{ name: { contains: query.search } }, { code: { contains: query.search } }]
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { imports: true } } },
      }),
      this.prisma.supplier.count({ where }),
    ])
    return { items, total, page, limit }
  }

  // Chi tiết NCC kèm lịch sử nhập + tổng tiền đã nhập
  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        imports: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { items: true },
        },
      },
    })
    if (!supplier) throw new NotFoundException('Không tìm thấy nhà cung cấp')

    const totalAmount = await this.prisma.stockImport.aggregate({
      where: { supplierId: id },
      _sum: { totalAmount: true },
      _count: true,
    })

    return {
      ...supplier,
      totalImports: totalAmount._count,
      totalImportAmount: parseFloat(String(totalAmount._sum.totalAmount ?? 0)),
    }
  }

  create(body: Record<string, any>) {
    return this.prisma.supplier.create({
      data: {
        code: body.code ?? `NCC-${Date.now()}`,
        name: body.name ?? body.ten,
        phone: body.phone ?? null,
        address: body.address ?? null,
        note: body.note ?? null,
      },
    })
  }

  update(id: string, body: Record<string, any>) {
    return this.prisma.supplier.update({
      where: { id },
      data: {
        code: body.code,
        name: body.name ?? body.ten,
        phone: body.phone,
        address: body.address,
        note: body.note,
      },
    })
  }

  async remove(id: string) {
    await this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  // Tìm theo id/tên, tự tạo nếu chưa có — dùng khi tạo phiếu nhập kho (tương thích
  // dữ liệu cũ chỉ có supplierName dạng text)
  async findOrCreateByName(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return null
    const existing = await this.prisma.supplier.findFirst({
      where: { name: trimmed, deletedAt: null },
    })
    if (existing) return existing
    return this.prisma.supplier.create({
      data: { code: `NCC-${Date.now()}`, name: trimmed },
    })
  }
}
