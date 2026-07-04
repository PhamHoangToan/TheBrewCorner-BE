import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { AuthUser, DbRole, PUBLIC_KEY, ROLES_KEY } from './auth.decorators'

// Guard toàn cục:
//  1. Best-effort: nếu request có JWT hợp lệ → gắn req.user = { id, code, role } (không throw nếu thiếu).
//  2. Route có @Roles(...) → BẮT BUỘC đã đăng nhập và đúng role, nếu không → 401/403.
//  3. Route có @Public() → luôn cho qua.
//  4. Route không @Roles và không @Public → cho qua (rollout an toàn, chưa siết toàn bộ).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest()

    // (1) Populate req.user nếu có JWT hợp lệ. Bỏ qua token dev cũ (không phải JWT).
    const authHeader = String(req.headers?.authorization ?? '')
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token && !token.startsWith('dev-token')) {
      try {
        const payload = this.jwt.verify<{ sub: string; code: string; role: DbRole }>(token)
        const user: AuthUser = { id: payload.sub, code: payload.code, role: payload.role }
        req.user = user
      } catch {
        // Token sai/hết hạn → coi như chưa đăng nhập, không chặn ở đây (chặn ở bước role nếu cần).
      }
    }

    // (3) Public → luôn cho qua.
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    // (4) Không khai báo role → cho qua.
    const roles = this.reflector.getAllAndOverride<DbRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!roles || roles.length === 0) return true

    // (2) Có @Roles → bắt buộc đăng nhập + đúng role.
    if (!req.user) throw new UnauthorizedException('Cần đăng nhập')
    if (!roles.includes(req.user.role)) throw new ForbiddenException('Không có quyền truy cập chức năng này')
    return true
  }
}
