import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WithdrawalRequestDto {
  @ApiProperty({ example: '1000000000', description: 'Amount in nanoTON' })
  @IsString()
  @IsNotEmpty()
  amountNano: string;

  @ApiProperty({
    example: 'EQD...abc',
    description: 'Destination TON wallet address or bank card number',
  })
  @IsString()
  @IsNotEmpty()
  destination: string;

  @ApiPropertyOptional({
    example: 'ton_wallet',
    enum: ['ton_wallet', 'bank_card'],
    default: 'ton_wallet',
  })
  @IsOptional()
  @IsString()
  @IsIn(['ton_wallet', 'bank_card'])
  destinationType?: string;
}
