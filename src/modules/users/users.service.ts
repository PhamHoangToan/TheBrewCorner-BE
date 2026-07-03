import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, StaffStatus, UserRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'
import { generateRandomPassword, hashPassword, verifyPassword } from '../../common/password.util'
import { MailService } from '../mail/mail.service'

const roleMap: Record<string, UserRole> = {
  admin: 'ADMIN',
  cashier: 'CASHIER',
  barista: 'BARISTA',
  waiter: 'WAITER',
  customer: 'CUSTOMER',
}

const statusMap: Record<string, StaffStatus> = {
  active: 'ACTIVE',
  'dang lam': 'ACTIVE',
  'đang làm': 'ACTIVE',
  on_leave: 'ON_LEAVE',
  'nghi phep': 'ON_LEAVE',
  'nghỉ phép': 'ON_LEAVE',
  inactive: 'INACTIVE',
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where: Prisma.UserWhereInput = { deletedAt: null }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { code: { contains: query.search } },
        { phone: { contains: query.search } },
      ]
    }
    if (query.role) where.role = this.role(query.role)
    if (query.staffOnly === 'true') where.role = { not: 'CUSTOMER' }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: this.publicSelect(),
      }),
      this.prisma.user.count({ where }),
    ])

    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.publicSelect(),
    })
    if (!item) throw new NotFoundException('User not found')
    return item
  }

  async loyalty(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, loyaltyPoints: true, totalSpent: true, membershipTier: true },
    })
    if (!user) throw new NotFoundException('User not found')

    const transactions = await this.prisma.loyaltyTransaction.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return {
      loyaltyPoints: user.loyaltyPoints,
      totalSpent: parseFloat(String(user.totalSpent)),
      membershipTier: user.membershipTier,
      transactions,
    }
  }

  async create(body: Record<string, any>) {
    const email = body.email ?? null

    // Nếu người gọi không truyền sẵn mật khẩu (trường hợp admin thêm nhân viên mới
    // từ trang Staff), tự sinh 1 mật khẩu ngẫu nhiên và gửi qua email của nhân viên.
    let generatedPassword: string | undefined
    let passwordHash: string
    if (body.passwordHash) {
      passwordHash = body.passwordHash
    } else if (body.password) {
      passwordHash = hashPassword(String(body.password))
    } else {
      generatedPassword = generateRandomPassword()
      passwordHash = hashPassword(generatedPassword)
    }

    const user = await this.prisma.user.create({
      data: {
        code: body.code ?? body.manv ?? `NV-${Date.now()}`,
        name: body.name ?? body.hoten,
        email,
        phone: body.phone ?? body.lienhe ?? null,
        address: body.address ?? null,
        avatarUrl: body.avatarUrl ?? null,
        shiftName: body.shiftName ?? body.shift ?? null,
        passwordHash,
        mustChangePassword: !!generatedPassword,
        role: this.role(body.role ?? body.vaitro),
        status: this.status(body.status ?? body.trangthai),
      },
      select: this.publicSelect(),
    })

    if (generatedPassword && email) {
      void this.mailService.sendStaffAccountEmail(email, {
        name: user.name,
        code: user.code,
        password: generatedPassword,
      })
    }

    return user
  }

  async update(id: string, body: Record<string, any>) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          code: body.code ?? body.manv,
          name: body.name ?? body.hoten,
          email: body.email,
          phone: body.phone ?? body.lienhe,
          address: body.address,
          avatarUrl: body.avatarUrl,
          shiftName: body.shiftName ?? body.shift,
          birthday: body.birthday ? new Date(body.birthday) : undefined,
          role: body.role || body.vaitro ? this.role(body.role ?? body.vaitro) : undefined,
          status: body.status || body.trangthai ? this.status(body.status ?? body.trangthai) : undefined,
        },
        select: this.publicSelect(),
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '')
        if (target.includes('email')) throw new BadRequestException('Email already exists')
        if (target.includes('phone')) throw new BadRequestException('Phone already exists')
      }
      throw error
    }
  }

  async remove(id: string) {
    // Soft delete: chỉ ẩn khỏi danh sách/đăng nhập, không xóa khỏi DB — giữ nguyên
    // lịch sử ca làm, chấm công, lương, đơn hàng đã gắn với nhân viên này.
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  async findForLogin(emailOrCode: string) {
    return this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: emailOrCode }, { code: emailOrCode }, { phone: emailOrCode }],
      },
    })
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Không tìm thấy người dùng')
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng')
    }
    if (newPassword.length < 6) throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự')

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(newPassword), mustChangePassword: false },
    })
    return { success: true }
  }

  private role(value: unknown): UserRole {
    const key = String(value ?? 'waiter').toLowerCase()
    return roleMap[key] ?? 'WAITER'
  }

  private status(value: unknown): StaffStatus {
    const key = String(value ?? 'active').toLowerCase()
    return statusMap[key] ?? 'ACTIVE'
  }

  private publicSelect() {
    return {
      id: true,
      code: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      avatarUrl: true,
      shiftName: true,
      mustChangePassword: true,
      birthday: true,
      role: true,
      status: true,
      employmentType: true,
      baseSalary: true,
      otRatePerHour: true,
      paidLeaveDaysLeft: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.UserSelect
  }
}
