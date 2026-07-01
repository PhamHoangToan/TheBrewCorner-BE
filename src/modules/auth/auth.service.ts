import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { hashPassword, verifyPassword } from '../../common/password.util'
import { UsersService } from '../users/users.service'

const roleToFe = {
  ADMIN: 'admin',
  CASHIER: 'cashier',
  BARISTA: 'barista',
  WAITER: 'waiter',
  CUSTOMER: 'customer',
} as const

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async login(body: Record<string, any>) {
    const identifier = body.email ?? body.username ?? body.code
    if (!identifier) throw new UnauthorizedException('Missing login identifier')
    if (!body.password) throw new UnauthorizedException('Missing password')

    const user = await this.usersService.findForLogin(String(identifier))
    if (!user) throw new UnauthorizedException('Invalid credentials')
    if (!verifyPassword(String(body.password), user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials')
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
    return {
      token: `dev-token-${user.id}`,
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
