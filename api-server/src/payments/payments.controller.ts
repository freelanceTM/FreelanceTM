import { Controller, Post, Get, UseGuards, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { StorageService } from '../storage/storage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private storage: StorageService,
  ) {}

  /**
   * Tight limit: triggers a MinIO/S3 upload on every call — expensive and
   * trivially abusable for storage flooding. Users should not need more than
   * a handful of top-up requests per minute.
   * 2 attempts/s burst cap, 3 attempts/min sustained, 10 attempts/hr absolute.
   */
  @Post('topup')
  @UseInterceptors(FileInterceptor('screenshot'))
  @ApiOperation({ summary: 'TM CELL top-up request with screenshot' })
  @ApiConsumes('multipart/form-data')
  @Throttle({
    short: { limit: 2, ttl: 1_000 },
    medium: { limit: 3, ttl: 60_000 },
    long: { limit: 10, ttl: 3_600_000 },
  })
  async topup(
    @CurrentUser('sub') userId: number,
    @Body('amount') amount: string,
    @Body('note') note?: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let screenshotUrl: string | undefined;
    if (file) {
      const uploaded = await this.storage.uploadFile(file.buffer, file.originalname, file.mimetype, 'payments');
      screenshotUrl = uploaded.url;
    }
    return this.paymentsService.create(userId, amount, screenshotUrl, note);
  }

  @Get('my')
  @ApiOperation({ summary: 'My payment history' })
  async myPayments(@CurrentUser('sub') userId: number) {
    return this.paymentsService.listMyPayments(userId);
  }
}
