import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TendersService } from './tenders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Tenders')
@Controller('tenders')
export class TendersController {
  constructor(private tendersService: TendersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Create a tender (project request)' })
  async create(@CurrentUser('sub') userId: number, @Body() dto: any) {
    return this.tendersService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tenders (marketplace)' })
  async list(
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.tendersService.list({
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tender with bids' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.tendersService.getOne(id);
  }

  @Post(':id/bid')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Place a bid on tender' })
  async bid(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: { price: number; message?: string; deliveryDays: number }) {
    return this.tendersService.placeBid(id, userId, dto);
  }

  @Patch(':id/select-bid/:bidId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Author selects winning bid' })
  async selectBid(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) tenderId: number, @Param('bidId', ParseIntPipe) bidId: number) {
    return this.tendersService.selectBid(tenderId, userId, bidId);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Cancel own tender' })
  async cancel(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.tendersService.cancel(id, userId);
  }
}
