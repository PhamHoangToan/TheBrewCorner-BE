import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

// Whitelist các model hỗ trợ soft delete (có cột deletedAt) — key là type trên URL
const TRASH_MODELS = {
  users: 'user',
  products: 'product',
  categories: 'category',
  ingredients: 'ingredient',
  promotions: 'promotion',
  areas: 'area',
  tables: 'cafeTable',
  shifts: 'shift',
  'shift-assignments': 'shiftAssignment',
  orders: 'order',
  invoices: 'invoice',
  finance: 'financeTransaction',
  attendance: 'attendanceLog',
  suppliers: 'supplier',
} as const

export type TrashType = keyof typeof TRASH_MODELS

@Injectable()
export class TrashService {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(type: string) {
    const model = TRASH_MODELS[type as TrashType]
    if (!model) {
      throw new BadRequestException(`Loại "${type}" không hỗ trợ — dùng: ${Object.keys(TRASH_MODELS).join(', ')}`)
    }
    return (this.prisma as any)[model]
  }

  types() {
    return Object.keys(TRASH_MODELS)
  }

  async findAll(type: string) {
    const items = await this.delegate(type).findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      take: 200,
    })
    return { items, total: items.length }
  }

  async restore(type: string, id: string) {
    const item = await this.delegate(type).findFirst({ where: { id, deletedAt: { not: null } } })
    if (!item) throw new NotFoundException('Không tìm thấy bản ghi đã ẩn')
    await this.delegate(type).update({ where: { id }, data: { deletedAt: null } })
    return { restored: true }
  }
}
