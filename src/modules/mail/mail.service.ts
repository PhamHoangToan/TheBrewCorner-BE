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
    if (!user || !pass) {
      this.logger.warn('SMTP_USER/SMTP_PASS chưa được cấu hình — bỏ qua gửi email (chỉ log ra console)')
      return null
    }

    const port = Number(process.env.SMTP_PORT ?? 465)
    this.transporter = createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port,
      secure: port === 465, // 465 = TLS ngay từ đầu; 587 (và các port khác) = STARTTLS
      auth: { user, pass },
      // Render <-> Gmail bắt tay TLS chậm hơn local, default timeout của Nodemailer (~2 phút
      // connection nhưng greeting/socket ngắn hơn) từng gây "Connection timeout" giả (bị treo
      // chứ không hẳn bị chặn hẳn) — nới rộng để phân biệt timeout thật với bị chặn hẳn.
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
    })
    return this.transporter
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
