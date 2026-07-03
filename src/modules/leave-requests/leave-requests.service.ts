import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'
import { mentionsPaidLeave } from '../../common/leave-note.util'
import { datesInRange } from '../../common/date.util'
import { NotificationsService, NotifRole } from '../notifications/notifications.service'

const ROLE_TO_NOTIF: Record<string, NotifRole> = {
  ADMIN: 'admin', CASHIER: 'cashier', BARISTA: 'barista', WAITER: 'waiter',
}

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(body: { userId: string; startDate: string; endDate: string; type: string; reason: string }) {
    return this.prisma.leaveRequest.create({
      data: {
        userId: body.userId,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        type: body.type as any,
        reason: body.reason,
      },
    })
  }

  async findAll(query: QueryParams & { userId?: string; status?: string }) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = {}
    if (query.userId) where.userId = query.userId
    if (query.status) where.status = query.status
    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, code: true, role: true } } },
      }),
      this.prisma.leaveRequest.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async approve(id: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException('Không tìm thấy đơn nghỉ phép')
    if (request.status !== 'PENDING') throw new BadRequestException('Đơn đã được xử lý')

    const dates = datesInRange(request.startDate, request.endDate)

    if (request.type !== 'UNPAID') {
      // Đánh dấu các ShiftAssignment trong khoảng ngày để payroll tự nhận diện qua mentionsPaidLeave().
      // Note ghi rõ loại nghỉ (phép năm/ốm) để Shift/Attendance bên admin và mobile hiển thị đúng.
      const leaveLabel = this.leaveTypeLabel(request.type)
      for (const workDate of dates) {
        const assignment = await this.prisma.shiftAssignment.findFirst({
          where: { userId: request.userId, workDate },
        })
        if (assignment) {
          const note = mentionsPaidLeave(assignment.note)
            ? assignment.note
            : assignment.note
              ? `${assignment.note} · ${leaveLabel}`
              : leaveLabel
          await this.prisma.shiftAssignment.update({
            where: { id: assignment.id },
            data: { status: 'ABSENT', note },
          })
        }
      }

      const user = await this.prisma.user.findUnique({ where: { id: request.userId } })
      const nextBalance = Math.max((user?.paidLeaveDaysLeft ?? 0) - dates.length, 0)
      await this.prisma.user.update({
        where: { id: request.userId },
        data: { paidLeaveDaysLeft: nextBalance },
      })
    }

    const approved = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'APPROVED', decidedAt: new Date() },
      include: { user: { select: { id: true, role: true } } },
    })
    await this.notifications.send({
      role: ROLE_TO_NOTIF[approved.user.role] ?? 'waiter',
      userId: approved.user.id,
      title: 'Đơn nghỉ phép được duyệt',
      body: `Đơn nghỉ từ ${approved.startDate.toLocaleDateString('vi-VN')} đến ${approved.endDate.toLocaleDateString('vi-VN')} đã được chấp nhận`,
      type: 'LEAVE_APPROVED',
      refId: approved.id,
    })
    return approved
  }

  async reject(id: string, reason: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException('Không tìm thấy đơn nghỉ phép')
    if (request.status !== 'PENDING') throw new BadRequestException('Đơn đã được xử lý')

    const rejected = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: reason, decidedAt: new Date() },
      include: { user: { select: { id: true, role: true } } },
    })
    await this.notifications.send({
      role: ROLE_TO_NOTIF[rejected.user.role] ?? 'waiter',
      userId: rejected.user.id,
      title: 'Đơn nghỉ phép bị từ chối',
      body: reason ? `Lý do: ${reason}` : 'Đơn nghỉ phép của bạn không được chấp nhận',
      type: 'LEAVE_REJECTED',
      refId: rejected.id,
    })
    return rejected
  }

  private leaveTypeLabel(type: string): string {
    if (type === 'SICK') return 'Nghỉ phép (ốm)'
    return 'Nghỉ phép năm'
  }
}
