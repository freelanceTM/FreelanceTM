import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Headers,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /categories
   *
   * Returns all categories ordered by gig count (most popular first).
   * No auth required — used by gig creation UI and category browse pages.
   */
  @Get()
  @ApiOperation({
    summary: 'List all categories (public)',
    description: 'Ordered by gigCount descending (most popular first). No auth required.',
  })
  async findAll() {
    return this.categoriesService.findAll();
  }

  /**
   * GET /categories/:slug
   *
   * Returns a single category by slug (e.g. "telegram", "design").
   * No auth required — used for category landing pages.
   */
  @Get(':slug')
  @ApiOperation({
    summary: 'Get category by slug (public)',
  })
  async findBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  /**
   * POST /categories
   *
   * Admin-only: create a new category.
   * Protected by X-Admin-Secret header (same pattern as subscriptions).
   */
  @Post()
  @ApiOperation({
    summary: 'Create a category (admin)',
    description: 'Requires X-Admin-Secret header.',
  })
  async create(
    @Headers('x-admin-secret') secret: string,
    @Body() dto: { name: string; slug: string; description?: string; icon?: string },
  ) {
    this.requireAdmin(secret);
    return this.categoriesService.create(dto);
  }

  /**
   * PATCH /categories/:id
   *
   * Admin-only: update name, description, or icon of an existing category.
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a category (admin)',
    description: 'Requires X-Admin-Secret header.',
  })
  async update(
    @Headers('x-admin-secret') secret: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; description?: string; icon?: string },
  ) {
    this.requireAdmin(secret);
    return this.categoriesService.update(id, dto);
  }

  private requireAdmin(secret: string) {
    const expected = this.config.get<string>('ADMIN_SECRET');
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Invalid or missing X-Admin-Secret header');
    }
  }
}
