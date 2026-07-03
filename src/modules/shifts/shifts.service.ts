import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'
import { AttendanceService } from '../attendance/attendance.service'
import { NotificationsService, NotifRole } from '../notifications/notifications.service'
import { mentionsPaidLeave } from '../../common/leave-note.util'
import { isFutureDate } from '../../common/date.util'

const ROLE_TO_NOTIF: Record<string, NotifRole> = {
  ADMIN: 'admin', CASHIER: 'cashier', BARISTA: 'barista', WAITER: 'waiter',
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where = { deletedAt: null }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shift.findMany({ where, skip, take, orderBy: { code: 'asc' } }),
      this.prisma.shift.count({ where }),
    ])
    return { items, total, page, limit }
  }

  create(body: Record<string, any>) {
    return this.prisma.shift.create({
      data: {
        code: body.code ?? `CA-${Date.now()}`,
        name: body.name ?? body.calamviec ?? body.ten,
        startTime: body.startTime ?? body.gioVao ?? '06:00',
        endTime: body.endTime ?? body.gioRa ?? '14:00',
        isActive: body.isActive ?? true,
      },
    })
  }

  update(id: string, body: Record<string, any>) {
    return this.prisma.shift.update({
      where: { id },
      data: {
        code: body.code,
        name: body.name ?? body.calamviec ?? body.ten,
        startTime: body.startTime ?? body.gioVao,
        endTime: body.endTime ?? body.gioRa,
        isActive: body.isActive,
      },
    })
  }

  async remove(id: string) {
    await this.prisma.shift.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  async assignments(query: QueryParams & { userId?: string; month?: string; year?: string }) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = { deletedAt: null }
    if (query.userId) where.userId = query.userId
    if (query.month && query.year) {
      const m = Number(query.month)
      const y = Number(query.year)
      where.workDate = {
        gte: new Date(Date.UTC(y, m - 1, 1)),
        lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
      }
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shiftAssignment.findMany({
        where,
        skip,
        take,
        orderBy: { workDate: 'desc' },
        include: { user: true, shift: true },
      }),
      this.prisma.shiftAssignment.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async updateAssignment(id: string, body: Record<string, any>) {
    const userId = body.userId ?? (body.nhanVien ? await this.findUserId(body.nhanVien) : undefined)
    const shiftId = body.shiftId ?? (body.gioVao || body.gioRa ? await this.findOrCreateShift(body) : undefined)
    const status = body.status ? this.shiftStatus(body.status) : undefined
    return this.prisma.shiftAssignment.update({
      where: { id },
      data: {
        ...(userId ? { userId } : {}),
        ...(shiftId ? { shiftId } : {}),
        ...(body.workDate ?? body.ngay ? { workDate: new Date(body.workDate ?? body.ngay) } : {}),
        ...(status ? { status } : {}),
        note: body.note,
      },
      include: { user: true, shift: true },
    })
  }

  private shiftStatus(value: string) {
    const map: Record<string, any> = {
      SCHEDULED: 'SCHEDULED', 'Lên lịch': 'SCHEDULED',
      IN_PROGRESS: 'IN_PROGRESS', 'Đang làm': 'IN_PROGRESS',
      COMPLETED: 'COMPLETED', 'Hoàn thành': 'COMPLETED',
      ABSENT: 'ABSENT', 'Vắng mặt': 'ABSENT',
    }
    return map[value] ?? 'SCHEDULED'
  }

  async removeAssignment(id: string) {
    await this.prisma.shiftAssignment.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  async createAssignment(body: Record<string, any>) {
    const userId = body.userId ?? (await this.findUserId(body.nhanVien))
    const shiftId = body.shiftId ?? (await this.findOrCreateShift(body))
    const shift = await this.prisma.shift.findUniqueOrThrow({ where: { id: shiftId } })
    const workDate = new Date(body.workDate ?? body.ngay ?? new Date())
    const isLeave = this.isLeaveOrAbsent(body)
    const isFuture = isFutureDate(workDate)

    const status = isFuture ? 'SCHEDULED' : isLeave ? 'ABSENT' : 'COMPLETED'

    const assignment = await this.prisma.shiftAssignment.create({
      data: {
        userId,
        shiftId,
        workDate,
        status,
        note: body.note ?? null,
      },
      include: { user: true, shift: true },
    })

    // Chỉ tự tạo chấm công cho ca đã/đang diễn ra (không phải ngày trong tương lai)
    // và không phải ca nghỉ phép/vắng mặt.
    if (!isFuture && !isLeave) {
      await this.attendanceService.createManual({
        userId,
        workDate: workDate.toISOString(),
        checkIn: this.combineDateTime(workDate, shift.startTime),
        checkOut: this.combineDateTime(workDate, shift.endTime),
        note: 'Tự động từ ca làm việc',
      })
    }

    // Báo cho nhân viên biết được phân ca mới (chỉ ca tương lai — nhập bù quá khứ không cần báo)
    if (isFuture) {
      await this.notifications.send({
        role: ROLE_TO_NOTIF[assignment.user.role] ?? 'waiter',
        userId: assignment.user.id,
        title: 'Bạn được phân ca mới',
        body: `${assignment.shift.name} (${assignment.shift.startTime}–${assignment.shift.endTime}) ngày ${workDate.toLocaleDateString('vi-VN')}`,
        type: 'SHIFT_ASSIGNED',
        refId: assignment.id,
      })
    }

    return assignment
  }

  private isLeaveOrAbsent(body: Record<string, any>): boolean {
    const status = String(body.status ?? '').toLowerCase()
    return status === 'absent' || status === 'vắng mặt'.toLowerCase() || mentionsPaidLeave(body.note)
  }

  private combineDateTime(workDate: Date, hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number)
    const dt = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), h, m))
    return dt.toISOString()
  }

  private async findUserId(nameOrId: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id: nameOrId }, { name: nameOrId }] },
    })
    if (user) return user.id
    const created = await this.prisma.user.create({
      data: {
        code: `NV-${Date.now()}`,
        name: nameOrId ?? 'Nhan vien',
        passwordHash: 'dev-password-change-me',
        role: 'WAITER',
      },
    })
    return created.id
  }

  // ── Yêu cầu đăng ký / nhượng ca từ app Employee — admin duyệt trên FE nội bộ ──

  async createRequest(body: Record<string, any>) {
    const type = String(body.type ?? 'REGISTER').toUpperCase() === 'SWAP' ? 'SWAP' : 'REGISTER'
    const userId = String(body.userId ?? '')
    const workDate = new Date(body.workDate ?? '')
    if (!userId || Number.isNaN(workDate.getTime())) throw new BadRequestException('Thiếu userId/workDate')

    let shiftId = String(body.shiftId ?? '')
    let targetAssignmentId: string | null = null

    if (type === 'SWAP') {
      // Nhượng lại ca đã được phân: xác thực assignment thuộc đúng user + ngày
      targetAssignmentId = String(body.targetAssignmentId ?? '')
      const assignment = await this.prisma.shiftAssignment.findFirst({
        where: { id: targetAssignmentId, userId, deletedAt: null },
      })
      if (!assignment) throw new NotFoundException('Không tìm thấy ca cần nhượng lại')
      shiftId = assignment.shiftId
    } else {
      const shift = await this.prisma.shift.findFirst({ where: { id: shiftId, deletedAt: null } })
      if (!shift) throw new NotFoundException('Ca làm việc không tồn tại')
      const existing = await this.prisma.shiftAssignment.findFirst({
        where: { userId, shiftId, workDate, deletedAt: null },
      })
      if (existing) throw new BadRequestException('Bạn đã được phân ca này rồi')
    }

    const pending = await this.prisma.shiftChangeRequest.findFirst({
      where: { userId, shiftId, workDate, status: 'PENDING' },
    })
    if (pending) throw new BadRequestException('Bạn đã gửi yêu cầu cho ca này, vui lòng chờ duyệt')

    return this.prisma.shiftChangeRequest.create({
      data: {
        userId,
        type,
        shiftId,
        workDate,
        targetAssignmentId,
        reason: String(body.reason ?? '').slice(0, 500),
      },
      include: { shift: true },
    })
  }

  async requests(query: QueryParams & { userId?: string; status?: string }) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = {}
    if (query.userId) where.userId = query.userId
    if (query.status) where.status = query.status
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shiftChangeRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, code: true, role: true } },
          shift: true,
        },
      }),
      this.prisma.shiftChangeRequest.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async approveRequest(id: string) {
    const request = await this.prisma.shiftChangeRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu')
    if (request.status !== 'PENDING') throw new BadRequestException('Yêu cầu đã được xử lý')

    if (request.type === 'REGISTER') {
      try {
        await this.createAssignment({
          userId: request.userId,
          shiftId: request.shiftId,
          workDate: request.workDate.toISOString(),
          note: 'Đăng ký ca qua app',
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new BadRequestException('Nhân viên đã có ca này rồi')
        }
        throw error
      }
    } else if (request.targetAssignmentId) {
      // SWAP: nhượng lại ca — ẩn assignment cũ để admin phân người khác
      await this.prisma.shiftAssignment.update({
        where: { id: request.targetAssignmentId },
        data: { deletedAt: new Date() },
      })
    }

    const approved = await this.prisma.shiftChangeRequest.update({
      where: { id },
      data: { status: 'APPROVED', decidedAt: new Date() },
      include: { user: { select: { id: true, role: true } }, shift: true },
    })
    await this.notifications.send({
      role: ROLE_TO_NOTIF[approved.user.role] ?? 'waiter',
      userId: approved.user.id,
      title: approved.type === 'SWAP' ? 'Yêu cầu nhượng ca được duyệt' : 'Đăng ký ca được duyệt',
      body: `${approved.shift.name} ngày ${approved.workDate.toLocaleDateString('vi-VN')}`,
      type: 'SHIFT_REQUEST_APPROVED',
      refId: approved.id,
    })
    return approved
  }

  async rejectRequest(id: string, reason: string) {
    const request = await this.prisma.shiftChangeRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu')
    if (request.status !== 'PENDING') throw new BadRequestException('Yêu cầu đã được xử lý')

    const rejected = await this.prisma.shiftChangeRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: reason ?? null, decidedAt: new Date() },
      include: { user: { select: { id: true, role: true } }, shift: true },
    })
    await this.notifications.send({
      role: ROLE_TO_NOTIF[rejected.user.role] ?? 'waiter',
      userId: rejected.user.id,
      title: rejected.type === 'SWAP' ? 'Yêu cầu nhượng ca bị từ chối' : 'Đăng ký ca bị từ chối',
      body: reason ? `Lý do: ${reason}` : `${rejected.shift.name} ngày ${rejected.workDate.toLocaleDateString('vi-VN')}`,
      type: 'SHIFT_REQUEST_REJECTED',
      refId: rejected.id,
    })
    return rejected
  }

  private async findOrCreateShift(body: Record<string, any>) {
    const startTime = body.startTime ?? body.gioVao ?? '06:00'
    const endTime = body.endTime ?? body.gioRa ?? '14:00'
    const code = `${startTime}-${endTime}`.replace(/[^0-9]/g, '')
    const shift = await this.prisma.shift.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: body.calamviec ?? `${startTime}-${endTime}`,
        startTime,
        endTime,
      },
    })
    return shift.id
  }
}
