import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { ActivityQueryDto, MonthQueryDto } from './dto/dashboard-query.dto';
import {
  GroupDashboardDto,
  MonthlySummaryDto,
  MyDashboardSummaryDto,
  PendingAmountSummaryDto,
  RecentActivityResponseDto,
} from './dto/dashboard-response.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ─── 1. My Summary ─────────────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({
    summary: 'Get personal dashboard summary',
    description:
      'Returns active group count, expenses created, total paid, total owed, and total receivable across all active groups.',
  })
  @ApiOkResponse({ type: MyDashboardSummaryDto })
  async getMyDashboardSummary(
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<MyDashboardSummaryDto> {
    return this.dashboardService.getMyDashboardSummary(user.id);
  }

  // ─── 2. Group Dashboard ────────────────────────────────────────────────────

  @Get('group/:groupId')
  @ApiOperation({
    summary: 'Get group dashboard',
    description:
      'Returns total group expense, member count, top payer, recent expenses/settlements, and current member balances.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkResponse({ type: GroupDashboardDto })
  @ApiForbiddenResponse({ description: 'Not an active member of this group' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  async getGroupDashboard(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<GroupDashboardDto> {
    return this.dashboardService.getGroupDashboard(groupId, user.id);
  }

  // ─── 3. Monthly Summary ────────────────────────────────────────────────────

  @Get('monthly')
  @ApiOperation({
    summary: 'Get monthly expense and settlement summary with 6-month trend',
    description:
      'Defaults to current month if no ?month param. Accepts YYYY-MM format.',
  })
  @ApiOkResponse({ type: MonthlySummaryDto })
  async getMonthlySummary(
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: MonthQueryDto,
  ): Promise<MonthlySummaryDto> {
    return this.dashboardService.getMonthlySummary(user.id, query);
  }

  // ─── 4. Recent Activity ────────────────────────────────────────────────────

  @Get('activity')
  @ApiOperation({
    summary: 'Get recent activity feed across all groups',
    description:
      'Combines expense creation, settlements, member joins, and member leaves into a unified timeline.',
  })
  @ApiOkResponse({ type: RecentActivityResponseDto })
  async getRecentActivity(
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: ActivityQueryDto,
  ): Promise<RecentActivityResponseDto> {
    return this.dashboardService.getRecentActivity(user.id, query);
  }

  // ─── 5. Pending Amounts ────────────────────────────────────────────────────

  @Get('pending')
  @ApiOperation({
    summary: 'Get pending amount summary — who owes me and whom I owe',
    description:
      'Uses the simplified debt algorithm across all active groups. Sorted by amount descending.',
  })
  @ApiOkResponse({ type: PendingAmountSummaryDto })
  async getPendingAmountSummary(
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<PendingAmountSummaryDto> {
    return this.dashboardService.getPendingAmountSummary(user.id);
  }
}
