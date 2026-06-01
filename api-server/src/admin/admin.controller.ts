import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DisputeResolution, WithdrawalStatus } from '@prisma/client';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('jwt')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard stats' })
  async stats() {
    return this.adminService.getStats();
  }

  // GIG MODERATION
  @Get('gigs/moderation')
  @ApiOperation({ summary: 'Gigs pending review' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async gigsModeration(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listGigsForModeration(status, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 20);
  }

  @Post('gigs/:id/moderate')
  @ApiOperation({ summary: 'Moderate gig' })
  async moderateGig(
    @Param('id', ParseIntPipe) id: number,
    @Body('decision') decision: 'approve' | 'reject' | 'ban',
    @Body('reason') reason?: string,
  ) {
    return this.adminService.moderateGig(id, decision, reason);
  }

  // REVIEW MODERATION
  @Get('reviews/moderation')
  @ApiOperation({ summary: 'Reviews pending approval' })
  async reviewsModeration(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listReviewsForModeration(page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 20);
  }

  @Post('reviews/:id/moderate')
  @ApiOperation({ summary: 'Moderate review' })
  async moderateReview(@Param('id', ParseIntPipe) id: number, @Body('decision') decision: 'approve' | 'reject') {
    return this.adminService.moderateReview(id, decision);
  }

  // USER MANAGEMENT
  @Post('users/:id/ban')
  @ApiOperation({ summary: 'Ban user' })
  async banUser(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Body('until') until?: string,
  ) {
    return this.adminService.banUser(id, reason, until ? new Date(until) : undefined);
  }

  @Post('users/:id/unban')
  @ApiOperation({ summary: 'Unban user' })
  async unbanUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.unbanUser(id);
  }

  // PROMOTE GIG
  @Post('gigs/:id/promote')
  @ApiOperation({ summary: 'Promote gig to top' })
  async promoteGig(
    @Param('id', ParseIntPipe) id: number,
    @Body('rank') rank: number,
    @Body('until') until: string,
  ) {
    return this.adminService.promoteGig(id, rank, new Date(until));
  }

  // Payments
  @Get('payments')
  @ApiOperation({ summary: 'List TM CELL payments' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listPayments(
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listPayments(status, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 20);
  }

  @Post('payments/:id/approve')
  @ApiOperation({ summary: 'Approve TM CELL payment' })
  async approvePayment(@CurrentUser('sub') adminId: number, @Param('id', ParseIntPipe) id: number) {
    return this.adminService.approvePayment(id, adminId);
  }

  @Post('payments/:id/reject')
  @ApiOperation({ summary: 'Reject TM CELL payment' })
  async rejectPayment(
    @CurrentUser('sub') adminId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('note') note?: string,
  ) {
    return this.adminService.rejectPayment(id, adminId, note);
  }

  // Disputes
  @Get('disputes')
  @ApiOperation({ summary: 'List disputes' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listDisputes(
    @Query('status') status?: 'open' | 'resolving' | 'resolved' | 'cancelled',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listDisputes(status, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 20);
  }

  @Post('disputes/:id/resolve')
  @ApiOperation({ summary: 'Resolve dispute' })
  async resolveDispute(
    @CurrentUser('sub') adminId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('resolution') resolution: DisputeResolution,
    @Body('reason') reason?: string,
  ) {
    return this.adminService.resolveDispute(id, adminId, resolution, reason);
  }

  // Users KYC
  @Get('users-kyc')
  @ApiOperation({ summary: 'List users with KYC status' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listUsersKyc(
    @Query('status') status?: 'none' | 'pending' | 'approved' | 'rejected',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listUsersKyc(status, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 20);
  }

  @Patch('users/:id/verify')
  @ApiOperation({ summary: 'Verify/reject user KYC' })
  async verifyUser(@Param('id', ParseIntPipe) id: number, @Body('status') status: 'approved' | 'rejected') {
    return this.adminService.verifyUser(id, status);
  }

  // ─── Withdrawals ──────────────────────────────────────────────────────────

  @Get('withdrawals')
  @ApiOperation({ summary: 'List withdrawal requests' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'processing', 'completed', 'rejected'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listWithdrawals(
    @Query('status') status?: WithdrawalStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listWithdrawals(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('withdrawals/:id/approve')
  @ApiOperation({ summary: 'Approve withdrawal — deducts amount from user wallet' })
  async approveWithdrawal(
    @CurrentUser('sub') adminId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminService.approveWithdrawal(id, adminId);
  }

  @Post('withdrawals/:id/reject')
  @ApiOperation({ summary: 'Reject withdrawal — returns held funds to user wallet' })
  async rejectWithdrawal(
    @CurrentUser('sub') adminId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('note') note?: string,
  ) {
    return this.adminService.rejectWithdrawal(id, adminId, note);
  }

  // ─── User Management ──────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all users (CRM)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  async listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
    );
  }

  // ─── Order Messages (for dispute arbitration) ─────────────────────────────

  @Get('orders/:orderId/messages')
  @ApiOperation({ summary: 'Get order chat history for dispute review' })
  async getOrderMessages(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.adminService.getOrderMessages(orderId);
  }

  // ─── Platform Config ───────────────────────────────────────────────────────

  /**
   * GET /admin/config
   *
   * Returns all platform config key-value pairs (fee %, maintenance mode, etc.)
   * Allows the ops team to inspect current settings without needing DB access.
   */
  @Get('config')
  @ApiOperation({
    summary: 'Get all platform config values (admin)',
    description:
      'Returns all Config rows. Key examples:\n' +
      '  platformFeePercent — escrow commission % (default 20)\n' +
      '  maintenanceMode    — "true" | "false"\n' +
      '  maxWithdrawalNano  — per-request cap in nanoTON\n' +
      '  minWithdrawalNano  — minimum withdrawal in nanoTON',
  })
  async getConfig() {
    return this.adminService.getConfig();
  }

  /**
   * PATCH /admin/config/:key
   *
   * Upserts a single config value by key.
   * Critical values (platformFeePercent, maintenance mode) are validated.
   * Takes effect immediately — no redeployment required.
   */
  @Patch('config/:key')
  @ApiOperation({
    summary: 'Set a platform config value (admin)',
    description:
      'Upserts Config row for the given key. Validates:\n' +
      '  platformFeePercent → integer 0–100\n' +
      '  *Nano keys         → non-negative integer\n' +
      '  maintenanceMode    → "true" | "false"',
  })
  async setConfig(
    @Param('key') key: string,
    @Body('value') value: string,
  ) {
    return this.adminService.setConfig(key, value);
  }
}
