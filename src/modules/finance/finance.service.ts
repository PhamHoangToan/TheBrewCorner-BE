import { Injectable } from '@nestjs/common'
import { FinanceType } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { money, pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where = query.type ? { deletedAt: null, type: this.type(query.type) } : { deletedAt: null }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.financeTransaction.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { createdBy: true } }),
      this.prisma.financeTransaction.count({ where }),
    ])
    return { items, total, page, limit }
  }

  create(body: Record<string, any>) {
    const type = this.type(body.type ?? body.loai)
    return this.prisma.financeTransaction.create({
      data: {
        code: body.code ?? body.maphieu ?? body.maphieuthu ?? body.maphieuchi ?? `${type === 'RECEIPT' ? 'PT' : 'PC'}-${Date.now()}`,
        type,
        content: body.content ?? body.noidung ?? body.mucdich ?? '',
        amount: money(body.amount ?? body.sotien) ?? 0,
        createdById: body.createdById,
      },
    })
  }

  update(id: string, body: Record<string, any>) {
    return this.prisma.financeTransaction.update({
      where: { id },
      data: {
        code: body.code ?? body.maphieu,
        type: body.type || body.loai ? this.type(body.type ?? body.loai) : undefined,
        content: body.content ?? body.noidung ?? body.mucdich,
        amount: money(body.amount ?? body.sotien),
        createdById: body.createdById,
      },
    })
  }

  async remove(id: string) {
    await this.prisma.financeTransaction.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  private type(value: unknown): FinanceType {
    const raw = String(value ?? 'RECEIPT').toLowerCase()
    return raw.includes('chi') || raw.includes('expense') ? 'EXPENSE' : 'RECEIPT'
  }
}
