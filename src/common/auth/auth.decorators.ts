import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'

// Role trong JWT/DB: 'ADMIN' | 'CASHIER' | 'BARISTA' | 'WAITER' | 'CUSTOMER'
export type DbRole = 'ADMIN' | 'CASHIER' | 'BARISTA' | 'WAITER' | 'CUSTOMER'

export interface AuthUser {
  id: string
  code: string
  role: DbRole
}

// Đánh dấu route KHÔNG cần đăng nhập (bỏ qua RolesGuard hoàn toàn).
export const PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(PUBLIC_KEY, true)

// Yêu cầu user đã đăng nhập VÀ có 1 trong các role liệt kê.
// Không gắn @Roles → route vẫn cho qua (rollout an toàn: siết dần).
export const ROLES_KEY = 'roles'
export const Roles = (...roles: DbRole[]) => SetMetadata(ROLES_KEY, roles)

// Lấy user đã xác thực từ request (do RolesGuard gắn vào req.user). Undefined nếu chưa đăng nhập.
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] | undefined => {
    const req = ctx.switchToHttp().getRequest()
    const user: AuthUser | undefined = req.user
    if (!user) return undefined
    return data ? user[data] : user
  },
)
