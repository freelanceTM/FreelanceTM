import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class CreateOrderDto {
  gigId: number;
  requirements?: string;
}

class UpdateStatusDto {
  status: 'pending' | 'active' | 'delivered' | 'completed' | 'cancelled' | 'disputed';
}

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create an order' })
  async create(@CurrentUser('sub') userId: number, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my orders' })
  @ApiQuery({ name: 'role', required: false, enum: ['buyer', 'seller'] })
  async findAll(@CurrentUser('sub') userId: number, @Query('role') role?: 'buyer' | 'seller') {
    return this.ordersService.findAll(userId, role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details' })
  async findOne(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.ordersService.updateStatus(userId, id, dto.status as any);
  }
}
