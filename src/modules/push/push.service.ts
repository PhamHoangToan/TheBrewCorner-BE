import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

const parseTokens = (raw: string | null | undefined): string[] => {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((t) => typeof t === 'string') : []
  } catch {
    return []
  }
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)

  constructor(private readonly prisma: PrismaService) {}

  async registerToken(userId: string, token: string) {
    if (!userId || !token) throw new BadRequestException('Thiếu userId hoặc token')
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fcmTokens: true } })
    if (!user) throw new BadRequestException('Người dùng không tồn tại')
    const tokens = parseTokens(user.fcmTokens)
    if (!tokens.includes(token)) tokens.push(token)
    await this.prisma.user.update({ where: { id: userId }, data: { fcmTokens: JSON.stringify(tokens) } })
    return { ok: true }
  }

  async removeToken(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fcmTokens: true } })
    if (!user) return { ok: true }
    const tokens = parseTokens(user.fcmTokens).filter((t) => t !== token)
    await this.prisma.user.update({ where: { id: userId }, data: { fcmTokens: JSON.stringify(tokens) } })
    return { ok: true }
  }

  // Gửi push tới tất cả thiết bị của user. Best-effort: no-op nếu chưa cấu hình FCM_SERVER_KEY.
  async sendToUser(userId: string, title: string, body: string, data?: Record<string, string>) {
    const key = process.env.FCM_SERVER_KEY
    if (!key) return
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fcmTokens: true } })
    const tokens = parseTokens(user?.fcmTokens)
    if (!tokens.length) return
    try {
      await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: { Authorization: `key=${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_ids: tokens,
          notification: { title, body },
          data: data ?? {},
        }),
      })
    } catch (err) {
      this.logger.warn(`FCM gửi thất bại cho ${userId}: ${(err as Error).message}`)
    }
  }
}
