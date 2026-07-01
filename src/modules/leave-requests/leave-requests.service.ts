import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class LeaveRequestsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const dates = this.datesInRange(request.startDate, request.endDate)

    if (request.type !== 'UNPAID') {
      // Đánh dấu các ShiftAssignment trong khoảng ngày để payroll tự nhận diện qua usesPaidLeave().
      // Note ghi rõ loại nghỉ (phép năm/ốm) để Shift/Attendance bên admin và mobile hiển thị đúng.
      const leaveLabel = this.leaveTypeLabel(request.type)
      for (const workDate of dates) {
        const assignment = await this.prisma.shiftAssignment.findFirst({
          where: { userId: request.userId, workDate },
        })
        if (assignment) {
          const note = this.mentionsLeave(assignment.note)
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

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'APPROVED', decidedAt: new Date() },
    })
  }

  async reject(id: string, reason: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException('Không tìm thấy đơn nghỉ phép')
    if (request.status !== 'PENDING') throw new BadRequestException('Đơn đã được xử lý')

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: reason, decidedAt: new Date() },
    })
  }

  private mentionsLeave(note?: string | null): boolean {
    const normalized = String(note ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    return normalized.includes('phep')
  }

  private leaveTypeLabel(type: string): string {
    if (type === 'SICK') return 'Nghỉ phép (ốm)'
    return 'Nghỉ phép năm'
  }

  private datesInRange(start: Date, end: Date): Date[] {
    const dates: Date[] = []
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
    while (cur <= last) {
      dates.push(new Date(cur))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    return dates
  }
}
