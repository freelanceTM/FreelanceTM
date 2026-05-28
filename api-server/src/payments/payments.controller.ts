import { Controller, Post, Get, UseGuards, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
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

  @Post('topup')
  @UseInterceptors(FileInterceptor('screenshot'))
  @ApiOperation({ summary: 'TM CELL top-up request with screenshot' })
  @ApiConsumes('multipart/form-data')
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
