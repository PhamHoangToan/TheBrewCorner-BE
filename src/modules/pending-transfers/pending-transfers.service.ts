import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class PendingTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(amount: number) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateCode()
      try {
        return await this.prisma.pendingTransfer.create({
          data: { code, amount },
        })
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err
      }
    }
    throw new Error('Không thể tạo mã tham chiếu chuyển khoản, vui lòng thử lại')
  }

  async findByCode(code: string) {
    const item = await this.prisma.pendingTransfer.findUnique({ where: { code } })
    if (!item) throw new NotFoundException('Không tìm thấy mã tham chiếu chuyển khoản')
    return item
  }

  private generateCode(): string {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase()
    return `CK-${random}`
  }
}
