import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService) {}

  // Voucher của 1 khách — tự chuyển ACTIVE quá hạn thành EXPIRED trước khi trả về
  async findByUser(userId: string) {
    await this.prisma.personalVoucher.updateMany({
      where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    })
    const items = await this.prisma.personalVoucher.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { expiresAt: 'desc' }],
      take: 50,
    })
    return { items }
  }

  // Kiểm tra voucher trước khi áp dụng ở Checkout
  async validate(body: { code?: string; userId?: string; totalAmount?: number }) {
    const voucher = await this.findUsable(String(body.code ?? ''), String(body.userId ?? ''))
    const totalAmount = Number(body.totalAmount ?? 0)
    const minOrder = parseFloat(String(voucher.minOrderAmount ?? 0))
    if (totalAmount < minOrder) {
      throw new BadRequestException(`Voucher yêu cầu đơn tối thiểu ${minOrder.toLocaleString('vi-VN')}đ`)
    }
    const discountAmount = Math.round((totalAmount * voucher.discountPercent) / 100)
    return { voucher, discountAmount, finalAmount: Math.max(totalAmount - discountAmount, 0) }
  }

  // Đánh dấu đã dùng khi order được tạo thành công
  async consume(code: string, userId: string, orderId: string) {
    const voucher = await this.findUsable(code, userId)
    await this.prisma.personalVoucher.update({
      where: { id: voucher.id },
      data: { status: 'USED', usedAt: new Date(), orderId },
    })
    return voucher
  }

  private async findUsable(code: string, userId: string) {
    if (!code || !userId) throw new BadRequestException('Thiếu mã voucher hoặc userId')
    const voucher = await this.prisma.personalVoucher.findUnique({
      where: { code: code.trim().toUpperCase() },
    })
    if (!voucher || voucher.userId !== userId) throw new BadRequestException('Voucher không tồn tại')
    if (voucher.status === 'USED') throw new BadRequestException('Voucher đã được sử dụng')
    if (voucher.status === 'EXPIRED' || voucher.expiresAt < new Date()) {
      throw new BadRequestException('Voucher đã hết hạn')
    }
    return voucher
  }
}
