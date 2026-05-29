import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

class UpdateMeDto {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  skills?: string[];
  telegramUsername?: string;
  portfolioUrls?: string[];
  languages?: string[];
  country?: string;
}

class OnboardingDto {
  role: 'client' | 'freelancer' | 'both';
  displayName?: string;
  bio?: string;
  skills?: string[];
  telegramUsername?: string;
  portfolioUrls?: string[];
  languages?: string[];
}

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get my profile' })
  async getMe(@CurrentUser('sub') userId: number) {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Update my profile' })
  async updateMe(@CurrentUser('sub') userId: number, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(userId, dto as any);
  }

  @Post('me/onboarding')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete onboarding' })
  async onboarding(@CurrentUser('sub') userId: number, @Body() dto: OnboardingDto) {
    return this.usersService.completeOnboarding(userId, dto);
  }

  // Legacy compatibility: old frontend calls POST /api/users/register
  //
  // H-1 fix: `role` is no longer accepted from the request body — it was
  // previously passed verbatim to legacyCreate(), allowing any caller to create
  // an account with role='admin' without any authentication.
  // Role is now hardcoded to 'client' inside legacyCreate().
  @Post('register')
  @ApiOperation({ summary: 'Legacy register/login (fallback)' })
  async legacyRegister(@Body() body: { username: string; email: string; displayName?: string }) {
    // Find or create by email — role is always 'client', never caller-supplied
    let user = await this.usersService.findByEmail(body.email);
    if (!user) {
      user = await this.usersService.legacyCreate({
        username: body.username,
        email: body.email,
        displayName: body.displayName || body.username,
      });
    }
    return user;
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get public user profile' })
  async getUser(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('sub') requesterId?: number,
  ) {
    return this.usersService.getUserById(userId, requesterId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'List users (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String })
  async listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return this.usersService.listUsers({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      role,
    });
  }
}
