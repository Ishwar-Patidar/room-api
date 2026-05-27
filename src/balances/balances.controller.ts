import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { BalancesService } from './balances.service';
import {
  GroupBalanceResponseDto,
  SimplifiedDebtResponseDto,
  UserBalanceSummaryDto,
  UserGroupBalanceSummaryDto,
} from './dto/balance-response.dto';

@ApiTags('Balances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('balances')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  // ─── My balance summary (all groups) ──────────────────────────────────────

  @Get('me')
  @ApiOperation({
    summary: 'Get balance summary for the current user across all groups',
    description:
      'Aggregates totalReceivable, totalOwed, and netBalance across every group the user is active in.',
  })
  @ApiOkResponse({ type: UserBalanceSummaryDto })
  async getMyBalanceSummary(
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<UserBalanceSummaryDto> {
    return this.balancesService.getMyBalanceSummary(user.id);
  }

  // ─── Full group balance breakdown ─────────────────────────────────────────

  @Get('group/:groupId')
  @ApiOperation({
    summary: 'Get full balance breakdown for a group',
    description:
      'Returns per-member balances and a simplified debt list showing exactly who owes whom, with no DB writes.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkResponse({ type: GroupBalanceResponseDto })
  @ApiForbiddenResponse({ description: 'Not an active member of this group' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  async getGroupBalances(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<GroupBalanceResponseDto> {
    return this.balancesService.getGroupBalances(groupId, user.id);
  }

  // ─── Simplified debts only ────────────────────────────────────────────────

  @Get('group/:groupId/simplified')
  @ApiOperation({
    summary: 'Get simplified debt list for a group',
    description:
      'Returns the minimum number of transactions needed to fully settle the group. Ideal for the "Settle Up" screen.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkResponse({ type: SimplifiedDebtResponseDto })
  @ApiForbiddenResponse({ description: 'Not an active member of this group' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  async getSimplifiedDebts(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<SimplifiedDebtResponseDto> {
    return this.balancesService.getSimplifiedDebts(groupId, user.id);
  }

  // ─── Single user's balance in a group ────────────────────────────────────

  @Get('group/:groupId/user/:userId')
  @ApiOperation({
    summary: "Get a specific user's balance within a group",
    description:
      "Any active group member can query any other member's balance. Useful for viewing another person's position before settling.",
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkResponse({ type: UserGroupBalanceSummaryDto })
  @ApiForbiddenResponse({ description: 'Not an active member of this group' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  async getUserBalanceInGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() requester: Omit<User, 'password'>,
  ): Promise<UserGroupBalanceSummaryDto> {
    return this.balancesService.getUserBalanceInGroup(
      groupId,
      userId,
      requester.id,
    );
  }
}
