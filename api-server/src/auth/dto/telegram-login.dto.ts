import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TelegramLoginDto {
  @ApiProperty({ description: 'Telegram WebApp initData string' })
  @IsString()
  initData: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  role?: string;
}
