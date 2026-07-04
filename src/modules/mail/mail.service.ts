import { Injectable, Logger } from '@nestjs/common'
import { createTransport, Transporter } from 'nodemailer'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private transporter: Transporter | null = null

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter

    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    if (!user || !pass) return null

    const port = Number(process.env.SMTP_PORT ?? 465)
    this.transporter = createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port,
      secure: port === 465, // 465 = TLS ngay từ đầu; 587 (và các port khác) = STARTTLS
      auth: { user, pass },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
    })
    return this.transporter
  }

  // Render chặn outbound SMTP (465/587) nên nodemailer luôn ETIMEDOUT khi deploy —
  // dùng Resend (gửi qua HTTPS, không bị chặn) làm đường chính. SMTP chỉ còn dùng
  // được khi chạy local (không có RESEND_API_KEY thì fallback xuống SMTP, nếu
  // cũng thiếu SMTP_USER/PASS thì log ra console).
  private async sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return false

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? 'The Brew Corner <onboarding@resend.dev>',
        to,
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Resend API trả lỗi ${res.status}: ${body}`)
    }
    return true
  }

  // Gửi chung: Resend (chính) → SMTP (local) → log (dev). Không ném lỗi ra ngoài.
  private async deliver(to: string, subject: string, html: string) {
    try {
      if (await this.sendViaResend(to, subject, html)) return
    } catch (error) {
      this.logger.error(`Resend thất bại cho ${to}: ${(error as Error).message}`)
    }
    const transporter = this.getTransporter()
    if (!transporter) {
      this.logger.log(`[DEV] Bỏ qua gửi email thật tới ${to} — ${subject}`)
      return
    }
    try {
      await transporter.sendMail({ from: process.env.MAIL_FROM ?? process.env.SMTP_USER, to, subject, html })
    } catch (error) {
      this.logger.error(`SMTP gửi thất bại cho ${to}: ${(error as Error).message}`)
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string, name?: string) {
    const subject = 'Đặt lại mật khẩu — The Brew Corner'
    const html = `
      <div style="font-family: Arial, sans-serif; color: #2D1A0E;">
        <h2 style="color: #662C21;">Xin chào ${name ?? ''},</h2>
        <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản tại <strong>The Brew Corner</strong>.</p>
        <p>Nhấn nút bên dưới để đặt lại mật khẩu (liên kết hết hạn sau 30 phút):</p>
        <p style="margin: 20px 0;">
          <a href="${resetUrl}" style="background:#662C21;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Đặt lại mật khẩu</a>
        </p>
        <p style="color:#7a5040;font-size:13px;">Nếu nút không hoạt động, mở liên kết: <br/>${resetUrl}</p>
        <p style="color:#aaa;font-size:12px;">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
      </div>
    `
    await this.deliver(to, subject, html)
  }

  async sendCampaignEmail(to: string, title: string, content: string) {
    const html = `
      <div style="font-family: Arial, sans-serif; color: #2D1A0E; max-width: 560px;">
        <h2 style="color: #662C21;">${title}</h2>
        <div style="white-space: pre-wrap; line-height: 1.6;">${content}</div>
        <p style="color:#aaa;font-size:12px;margin-top:24px;">The Brew Corner — Cà phê & Trà</p>
      </div>
    `
    await this.deliver(to, title, html)
  }

  async sendStaffAccountEmail(to: string, data: { name: string; code: string; password: string }) {
    const subject = 'Tài khoản nhân viên The Brew Corner của bạn'
    const html = `
      <div style="font-family: Arial, sans-serif; color: #2D1A0E;">
        <h2 style="color: #662C21;">Chào ${data.name},</h2>
        <p>Tài khoản nhân viên của bạn tại <strong>The Brew Corner</strong> đã được tạo. Thông tin đăng nhập (dùng cho app Nhân viên):</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 12px; color: #7a5040;">Mã nhân viên</td><td style="padding: 6px 12px;"><b>${data.code}</b></td></tr>
          <tr><td style="padding: 6px 12px; color: #7a5040;">Email đăng nhập</td><td style="padding: 6px 12px;"><b>${to}</b></td></tr>
          <tr><td style="padding: 6px 12px; color: #7a5040;">Mật khẩu</td><td style="padding: 6px 12px;"><b>${data.password}</b></td></tr>
        </table>
        <p>Vui lòng đổi mật khẩu sau lần đăng nhập đầu tiên và không chia sẻ thông tin này cho người khác.</p>
        <p style="color: #aaa; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
      </div>
    `

    try {
      if (await this.sendViaResend(to, subject, html)) return
    } catch (error) {
      this.logger.error(`Gửi email qua Resend thất bại cho ${to}: ${(error as Error).message}`)
      return
    }

    const transporter = this.getTransporter()
    if (!transporter) {
      this.logger.log(`[DEV] Bỏ qua gửi email thật — thông tin tài khoản cho ${to}: mã ${data.code}, mật khẩu ${data.password}`)
      return
    }

    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
        to,
        subject,
        html,
      })
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { command?: string; responseCode?: number }
      this.logger.error(
        `Gửi email tài khoản thất bại cho ${to} — code=${err.code} command=${err.command} responseCode=${err.responseCode}: ${err.message}`,
      )
    }
  }
}
