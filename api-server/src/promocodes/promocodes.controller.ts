import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PromocodesService } from './promocodes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Promocodes')
@Controller('promocodes')
export class PromocodesController {
  constructor(private promocodesService: PromocodesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Create promo code (admin)' })
  async create(@Body() dto: { code: string; type: 'percent' | 'fixed'; value: number; maxUses?: number; expiresAt?: string }) {
    return this.promocodesService.create({
      ...dto,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  @Post('apply/:code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Apply promo code' })
  async apply(@Param('code') code: string) {
    return this.promocodesService.validate(code);
  }

  @Get()
  @ApiOperation({ summary: 'List promo codes' })
  async list() {
    return this.promocodesService.list();
  }
}
