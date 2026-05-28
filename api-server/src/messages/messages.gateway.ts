import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger, UnauthorizedException, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';

@WebSocketGateway({
  namespace: 'messages',
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MessagesGateway.name);

  constructor(
    private jwtService: JwtService,
    private messagesService: MessagesService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwtService.verifyAsync(token, { secret: process.env.JWT_SECRET });
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      this.logger.log(`Client connected: user ${payload.sub}`);
    } catch {
      this.logger.warn('Invalid token on connection');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinOrder')
  async handleJoinOrder(
    @MessageBody() data: { orderId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId as number;
    // Verify access via service? Here we trust but verify on message send.
    const room = `order_${data.orderId}`;
    await client.join(room);
    client.emit('joined', { orderId: data.orderId });
  }

  @SubscribeMessage('leaveOrder')
  async handleLeaveOrder(
    @MessageBody() data: { orderId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `order_${data.orderId}`;
    await client.leave(room);
    client.emit('left', { orderId: data.orderId });
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() payload: { orderId: number; content: string; attachments?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId as number;
    if (!userId) return;

    try {
      const message = await this.messagesService.createMessage(
        payload.orderId,
        userId,
        payload.content,
        payload.attachments,
      );

      this.server.to(`order_${payload.orderId}`).emit('newMessage', message);
    } catch (err) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(
    @MessageBody() payload: { orderId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId as number;
    if (!userId) return;
    await this.messagesService.markAsRead(payload.orderId, userId);
    this.server.to(`order_${payload.orderId}`).emit('messagesRead', { orderId: payload.orderId, by: userId });
  }
}
