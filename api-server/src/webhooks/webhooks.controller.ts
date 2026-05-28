import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register webhook' })
  async create(@CurrentUser('sub') userId: number, @Body() dto: { url: string; events: string[]; secret?: string }) {
    return this.webhooksService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'My webhooks' })
  async list(@CurrentUser('sub') userId: number) {
    return this.webhooksService.list(userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete webhook' })
  async remove(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    return this.webhooksService.delete(userId, id);
  }
}
