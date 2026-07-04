import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { PrismaService } from '../../prisma/prisma.service'
import { ActivityLogService } from '../../modules/activity-log/activity-log.service'

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// Các nhóm route không cần ghi log (đăng nhập, webhook nội bộ, chính API log, upload file thô)
const SKIP_PATH_PREFIXES = ['/api/auth', '/api/webhooks', '/api/activity-logs', '/api/upload']

const MODULE_LABELS: Record<string, string> = {
  tables: 'Bàn',
  orders: 'Đơn hàng',
  invoices: 'Hóa đơn',
  products: 'Sản phẩm',
  categories: 'Danh mục',
  users: 'Nhân viên',
  shifts: 'Ca làm việc',
  attendance: 'Chấm công',
  payroll: 'Bảng lương',
  'leave-requests': 'Nghỉ phép',
  ingredients: 'Nguyên liệu',
  promotions: 'Khuyến mãi',
  finance: 'Thu chi',
  areas: 'Khu vực',
}

const ACTION_BY_METHOD: Record<string, string> = {
  POST: 'CREATE',
  PATCH: 'UPDATE',
  PUT: 'UPDATE',
  DELETE: 'DELETE',
}

const VERB_BY_METHOD: Record<string, string> = {
  POST: 'Tạo mới',
  PATCH: 'Cập nhật',
  PUT: 'Cập nhật',
  DELETE: 'Xóa',
}

// Mô tả riêng cho các hành động quan trọng, khớp theo "TênController.tênHandler"
const SPECIFIC_DESCRIPTIONS: Record<string, string> = {
  'TablesController.create': 'Tạo bàn mới',
  'TablesController.update': 'Cập nhật thông tin bàn',
  'TablesController.remove': 'Xóa bàn',
  'OrdersController.create': 'Tạo đơn hàng mới',
  'OrdersController.update': 'Cập nhật đơn hàng',
  'OrdersController.updateItem': 'Cập nhật trạng thái món trong đơn',
  'OrdersController.approveReturn': 'Đồng ý trả món',
  'OrdersController.rejectReturn': 'Từ chối trả món',
  'InvoicesController.create': 'Tạo hóa đơn',
  'InvoicesController.pay': 'Thanh toán hóa đơn',
  'UsersController.create': 'Thêm nhân viên mới',
  'UsersController.changePassword': 'Đổi mật khẩu',
  'LeaveRequestsController.approve': 'Duyệt đơn nghỉ phép',
  'LeaveRequestsController.reject': 'Từ chối đơn nghỉ phép',
  'AttendanceController.approveCorrection': 'Duyệt bổ sung chấm công',
  'AttendanceController.rejectCorrection': 'Từ chối bổ sung chấm công',
  'PayrollController.calculate': 'Tính lương',
  'PayrollController.setSalaryConfig': 'Cấu hình lương nhân viên',
  'PayrollController.approve': 'Duyệt bảng lương',
  'PayrollController.markPaid': 'Xác nhận đã trả lương',
}

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest()
    const method = String(req.method ?? '')
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0]

    if (!MUTATING_METHODS.has(method) || SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))) {
      return next.handle()
    }

    const controllerName = context.getClass().name
    const handlerName = context.getHandler().name

    return next.handle().pipe(
      tap({
        next: () => this.log(req, method, path, controllerName, handlerName, 200),
        error: (err) => this.log(req, method, path, controllerName, handlerName, err?.status ?? 500),
      }),
    )
  }

  private async log(req: any, method: string, path: string, controllerName: string, handlerName: string, statusCode: number) {
    try {
      // RolesGuard (chạy trước interceptor) đã gắn req.user từ JWT. Fallback token dev cũ để tương thích.
      const authHeader = String(req.headers?.authorization ?? '')
      const token = authHeader.replace(/^Bearer\s+/i, '')
      const userId = req.user?.id ?? (token.startsWith('dev-token-') ? token.replace('dev-token-', '') : null)

      let userName: string | null = null
      let userRole: string | null = null
      if (userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } })
        userName = user?.name ?? null
        userRole = user?.role ?? null
      }

      const moduleKey = path.replace(/^\/api\//, '').split('/')[0] ?? ''
      const moduleLabel = MODULE_LABELS[moduleKey] ?? moduleKey
      const key = `${controllerName}.${handlerName}`
      const description = SPECIFIC_DESCRIPTIONS[key] ?? `${VERB_BY_METHOD[method] ?? method} — ${moduleLabel}`

      await this.activityLogService.record({
        userId,
        userName,
        userRole,
        method,
        path,
        module: moduleKey,
        action: ACTION_BY_METHOD[method] ?? method,
        description,
        statusCode,
      })
    } catch {
      // Không để lỗi ghi log ảnh hưởng tới luồng chính — bỏ qua im lặng.
    }
  }
}
