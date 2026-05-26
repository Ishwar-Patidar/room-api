import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateExpenseGroupDto } from './dto/create-expense-group.dto';
import {
  ExpenseGroupResponseDto,
  ExpenseGroupSummaryDto,
} from './dto/expense-group-response.dto';
import { ExpenseGroupsService } from './expense-groups.service';

@ApiTags('Expense Groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('expense-groups')
export class ExpenseGroupsController {
  constructor(private readonly expenseGroupsService: ExpenseGroupsService) {}

  // ─── Create Group ──────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Create a new expense group',
    description: 'Creator is automatically added as the first active member.',
  })
  @ApiCreatedResponse({ type: ExpenseGroupResponseDto })
  async createGroup(
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: CreateExpenseGroupDto,
  ): Promise<ExpenseGroupResponseDto> {
    return this.expenseGroupsService.createGroup(user.id, dto);
  }

  // ─── Get My Groups ─────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get all expense groups the current user is active in',
  })
  @ApiOkResponse({ type: [ExpenseGroupSummaryDto] })
  async getMyGroups(
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<ExpenseGroupSummaryDto[]> {
    return this.expenseGroupsService.getMyGroups(user.id);
  }

  // ─── Get Group Details ─────────────────────────────────────────────────────

  @Get(':groupId')
  @ApiOperation({
    summary: 'Get full details of a group (members only)',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkResponse({ type: ExpenseGroupResponseDto })
  @ApiNotFoundResponse({ description: 'Group not found' })
  @ApiForbiddenResponse({ description: 'Not an active member' })
  async getGroupById(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<ExpenseGroupResponseDto> {
    return this.expenseGroupsService.getGroupById(groupId, user.id);
  }

  // ─── Add Member ────────────────────────────────────────────────────────────

  @Post(':groupId/members')
  @ApiOperation({
    summary: 'Add a member to a group by mobile number',
    description: 'Any active member can add another user by their mobile number.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiCreatedResponse({ type: ExpenseGroupResponseDto })
  @ApiNotFoundResponse({ description: 'Group or user not found' })
  @ApiForbiddenResponse({ description: 'Not an active member of this group' })
  async addMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: AddMemberDto,
  ): Promise<ExpenseGroupResponseDto> {
    return this.expenseGroupsService.addMember(groupId, user.id, dto);
  }

  // ─── Remove Member ─────────────────────────────────────────────────────────

  @Delete(':groupId/members/:memberId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a member from a group',
    description:
      'Only the group creator can remove others. Any member can remove themselves. If the last member leaves, the group becomes INACTIVE.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'memberId', description: 'User ID of the member to remove', type: String })
  @ApiOkResponse({ schema: { example: { message: 'Member removed from group' } } })
  @ApiNotFoundResponse({ description: 'Group or member not found' })
  @ApiForbiddenResponse({ description: 'Not authorized to remove this member' })
  async removeMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<{ message: string }> {
    return this.expenseGroupsService.removeMember(groupId, memberId, user.id);
  }

  // ─── Leave Group ───────────────────────────────────────────────────────────

  @Delete(':groupId/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Leave an expense group',
    description:
      'Current user leaves the group. If they are the last member, the group becomes INACTIVE.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkResponse({ schema: { example: { message: 'You have left the group' } } })
  @ApiNotFoundResponse({ description: 'Group not found' })
  async leaveGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<{ message: string }> {
    return this.expenseGroupsService.leaveGroup(groupId, user.id);
  }
}
