import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { GigsService } from './gigs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Prisma } from '@prisma/client';

class CreateGigDto {
  title: string;
  description: string;
  price: number;
  categoryId: number;
  deliveryDays?: number;
  revisions?: number;
  status?: 'draft' | 'active' | 'paused';
  tags?: string[];
  images?: string[];
}

@ApiTags('Gigs')
@Controller('gigs')
export class GigsController {
  constructor(private gigsService: GigsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Create a gig' })
  async create(@CurrentUser('sub') userId: number, @Body() dto: CreateGigDto) {
    return this.gigsService.create(userId, dto as unknown as Prisma.GigCreateInput & { categoryId: number });
  }

  @Get()
  @ApiOperation({ summary: 'List gigs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'sellerId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'sortBy', required: false, description: 'price_asc|price_desc|rating|orders' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sellerId') sellerId?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sortBy') sortBy?: string,
    @CurrentUser('sub') requesterId?: number,
  ) {
    return this.gigsService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      sellerId: sellerId ? parseInt(sellerId, 10) : undefined,
      search,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      sortBy,
      requesterId,
    });
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured gigs' })
  async findFeatured() {
    return { gigs: await this.gigsService.findFeatured() };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform stats' })
  async findStats() {
    return this.gigsService.findStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get gig by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.gigsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Update a gig' })
  async update(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: Prisma.GigUpdateInput) {
    return this.gigsService.update(userId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Delete a gig' })
  async remove(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    await this.gigsService.remove(userId, id);
    return { success: true };
  }
}
