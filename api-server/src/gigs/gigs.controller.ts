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
  HttpCode,
  HttpStatus,
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
  extras?: Array<{ title: string; description?: string; price: number; deliveryDays?: number }>;
  packages?: Array<{ name: string; description?: string; price: number; deliveryDays?: number; revisions?: number; includes?: string[] }>;
}

@ApiTags('Gigs')
@Controller('gigs')
export class GigsController {
  constructor(private gigsService: GigsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Create a gig',
    description:
      'S3-1: Enforces subscription tier gig limits.\n' +
      '  free → max 3 | pro → max 20 | business → unlimited\n' +
      'Throws 403 if the seller has reached their plan limit.',
  })
  async create(@CurrentUser('sub') userId: number, @Body() dto: CreateGigDto) {
    return this.gigsService.create(userId, dto as unknown as Prisma.GigCreateInput & { categoryId: number });
  }

  @Get()
  @ApiOperation({
    summary: 'List / search gigs',
    description:
      'S3-3: Default sortBy is "rank" — weighted formula: isPromoted (×1000) + ' +
      'seller level (pro=400/top=300/rising=200/new=100) + rating×100.\n' +
      'When "search" is provided, uses full-text GIN search (ts_rank order).\n' +
      'Other sortBy: price_asc | price_desc | rating | orders | newest',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'sellerId', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Full-text GIN search' })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'sortBy', required: false, description: 'rank (default) | price_asc | price_desc | rating | orders | newest' })
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
  @ApiOperation({ summary: 'Get gig by ID — increments view counter (S3-4)' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.gigsService.findOne(id);
  }

  /**
   * S3-2: Pause an active gig.
   * Transitions: active → paused. Hides gig from all public queries instantly.
   * In-progress orders are NOT affected. Only the owner may pause.
   */
  @Patch(':id/pause')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause an active gig (S3-2)',
    description:
      'Transitions: active → paused.\n' +
      'Paused gigs are hidden from catalog, search, and featured — immediately.\n' +
      'In-progress orders continue unaffected. Only the gig owner may call this.',
  })
  async pause(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.gigsService.pause(userId, id);
  }

  /**
   * S3-2: Resume a paused gig.
   * Transitions: paused → active. Re-validates subscription tier limit.
   */
  @Patch(':id/resume')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resume a paused gig (S3-2)',
    description:
      'Transitions: paused → active.\n' +
      'Re-validates tier limit — throws 403 if current plan would be exceeded ' +
      '(e.g. subscription expired while gig was paused and free limit is already full).',
  })
  async resume(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.gigsService.resume(userId, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Update a gig (title, description, price, tags, images, etc.)' })
  async update(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Prisma.GigUpdateInput,
  ) {
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
