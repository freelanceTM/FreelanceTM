import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * SPEC #4 §4.4 — payload for sending an order-linked message over HTTP.
 * Mirrors the socket gateway 'sendMessage' payload.
 */
export class SendMessageDto {
  @IsString()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
