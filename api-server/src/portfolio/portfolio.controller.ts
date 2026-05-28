import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, Query, UseGuards, UploadedFile, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { PortfolioService } from './portfolio.service';
import { StorageService } from '../storage/storage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(
    private portfolioService: PortfolioService,
    private storage: StorageService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiOperation({ summary: 'Add portfolio item with images' })
  @ApiConsumes('multipart/form-data')
  async create(
    @CurrentUser('sub') userId: number,
    @Body() dto: any,
    @UploadedFiles() files?: Array<Express.Multer.File>,
  ) {
    const imageUrls: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const uploaded = await this.storage.uploadFile(file.buffer, file.originalname, file.mimetype, 'portfolio');
        imageUrls.push(uploaded.url);
      }
    }
    return this.portfolioService.create(userId, { ...dto, imageUrls });
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Portfolio by user' })
  async byUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.portfolioService.listByUser(userId);
  }

  @Get('public')
  @ApiOperation({ summary: 'Public portfolio feed' })
  async public(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.portfolioService.listPublic(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      categoryId ? parseInt(categoryId, 10) : undefined,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Delete portfolio item' })
  async remove(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.delete(userId, id);
  }
}
