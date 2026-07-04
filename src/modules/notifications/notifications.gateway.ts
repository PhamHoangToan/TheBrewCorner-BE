import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  handleConnection(client: Socket) {
    const role = client.handshake.query.role as string
    if (role) {
      client.join(`role:${role}`)
    }
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('join')
  handleJoin(@MessageBody() data: { role: string }, @ConnectedSocket() client: Socket) {
    if (data?.role) {
      client.rooms.forEach((room) => { if (room !== client.id) client.leave(room) })
      client.join(`role:${data.role}`)
    }
  }

  // Customer app join theo orderId để nhận cập nhật trạng thái đơn realtime (VD: đã pha xong)
  @SubscribeMessage('join:order')
  handleJoinOrder(@MessageBody() data: { orderId: string }, @ConnectedSocket() client: Socket) {
    if (data?.orderId) {
      client.join(`order:${data.orderId}`)
    }
  }

  emitOrderUpdate(orderId: string, payload: unknown) {
    this.server.to(`order:${orderId}`).emit('order:updated', payload)
  }

  // Chat hỗ trợ — cả khách (widget Customer) lẫn nhân viên (trang /support-chat) join theo threadId
  @SubscribeMessage('join:chat')
  handleJoinChat(@MessageBody() data: { threadId: string }, @ConnectedSocket() client: Socket) {
    if (data?.threadId) client.join(`chat:${data.threadId}`)
  }

  emitChatMessage(threadId: string, payload: unknown) {
    this.server.to(`chat:${threadId}`).emit('chat:message', payload)
  }
}
