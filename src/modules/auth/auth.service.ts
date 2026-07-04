import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { createHash, randomBytes } from 'crypto'
import { hashPassword, verifyPassword } from '../../common/password.util'
import { PrismaService } from '../../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { MailService } from '../mail/mail.service'

const roleToFe = {
  ADMIN: 'admin',
  CASHIER: 'cashier',
  BARISTA: 'barista',
  WAITER: 'waiter',
  CUSTOMER: 'customer',
} as const

// Web nội bộ (TheBrewCorner-FE) chỉ dành cho 4 tài khoản đại diện mỗi role.
// Nhân viên khác đăng nhập qua app mobile (TheBrewCorner-Employee), app này
// không gửi header X-Client nên không bị chặn bởi whitelist dưới đây.
const WEB_INTERNAL_ALLOWED_CODES = ['NV001', 'NV002', 'NV003', 'NV004']

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // Quên mật khẩu: luôn trả ok (không lộ email tồn tại hay không). Nếu có user → gửi link đặt lại.
  async forgotPassword(email: string) {
    const normalized = String(email ?? '').trim().toLowerCase()
    if (!normalized) throw new BadRequestException('Vui lòng nhập email')

    const user = await this.usersService.findForLogin(normalized)
    if (user && user.email) {
      const rawToken = randomBytes(32).toString('hex')
      const tokenHash = createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, token: tokenHash, expiresAt },
      })
      const base = process.env.APP_RESET_URL ?? 'http://localhost:5173/reset-password'
      const resetUrl = `${base}?token=${rawToken}`
      await this.mail.sendPasswordResetEmail(user.email, resetUrl, user.name)
    }
    return { ok: true }
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token) throw new BadRequestException('Thiếu token')
    if (!newPassword || newPassword.length < 6) throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự')

    const tokenHash = createHash('sha256').update(String(token)).digest('hex')
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token: tokenHash } })
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn')
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(newPassword), mustChangePassword: false } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ])
    return { ok: true }
  }

  async login(body: Record<string, any>, client?: string) {
    const identifier = body.email ?? body.username ?? body.code
    if (!identifier) throw new UnauthorizedException('Missing login identifier')
    if (!body.password) throw new UnauthorizedException('Missing password')

    const user = await this.usersService.findForLogin(String(identifier))
    if (!user) throw new UnauthorizedException('Invalid credentials')
    if (!verifyPassword(String(body.password), user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials')
    }
    if (
      client === 'web-internal' &&
      user.role !== 'CUSTOMER' &&
      !WEB_INTERNAL_ALLOWED_CODES.includes(user.code)
    ) {
      throw new UnauthorizedException('Tài khoản này chỉ đăng nhập được trên app di động')
    }

    return this.authResponse(user)
  }

  async register(body: Record<string, any>) {
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const phone = String(body.phone ?? '').trim()
    const password = String(body.password ?? '')

    if (!name) throw new BadRequestException('Name is required')
    if (!email) throw new BadRequestException('Email is required')
    if (!phone) throw new BadRequestException('Phone is required')
    if (password.length < 6) throw new BadRequestException('Password must be at least 6 characters')

    const exists = await this.usersService.findForLogin(email)
    if (exists) throw new BadRequestException('Email already exists')

    const phoneExists = await this.usersService.findForLogin(phone)
    if (phoneExists) throw new BadRequestException('Phone already exists')

    const user = await this.usersService.create({
      code: `KH-${Date.now()}`,
      name,
      email,
      phone,
      passwordHash: hashPassword(password),
      role: 'customer',
      status: 'active',
    })

    return this.authResponse(user)
  }

  devMe() {
    return {
      id: 'dev',
      name: 'Dev User',
      role: 'admin',
    }
  }

  private authResponse(user: {
    id: string
    code: string
    name: string
    email?: string | null
    phone?: string | null
    address?: string | null
    role: keyof typeof roleToFe
    mustChangePassword?: boolean
  }) {
    // JWT thật: payload mang userId (sub), mã NV và role DB để RolesGuard phân quyền.
    const token = this.jwt.sign({ sub: user.id, code: user.code, role: user.role })
    return {
      token,
      user: {
        id: user.id,
        code: user.code,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: roleToFe[user.role],
        mustChangePassword: user.mustChangePassword ?? false,
      },
    }
  }
}
