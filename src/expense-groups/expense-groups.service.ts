import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateExpenseGroupDto } from './dto/create-expense-group.dto';
import {
  ExpenseGroupResponseDto,
  ExpenseGroupSummaryDto,
} from './dto/expense-group-response.dto';

// ─── Prisma select shapes ────────────────────────────────────────────────────

const GROUP_WITH_MEMBERS_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: { id: true, name: true, mobile: true },
  },
  members: {
    where: { leftAt: null }, // Only active members
    select: {
      id: true,
      joinedAt: true,
      leftAt: true,
      user: {
        select: { id: true, name: true, mobile: true, role: true },
      },
    },
    orderBy: { joinedAt: 'asc' as const },
  },
} as const;

const GROUP_SUMMARY_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  createdBy: {
    select: { id: true, name: true, mobile: true },
  },
  _count: {
    select: {
      members: { where: { leftAt: null } },
    },
  },
} as const;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ExpenseGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create Group ──────────────────────────────────────────────────────────

  async createGroup(
    userId: string,
    dto: CreateExpenseGroupDto,
  ): Promise<ExpenseGroupResponseDto> {
    const group = await this.prisma.expenseGroup.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        createdById: userId,
        // Auto-add creator as first member
        members: {
          create: { userId },
        },
      },
      select: GROUP_WITH_MEMBERS_SELECT,
    });

    return this.formatGroupResponse(group);
  }

  // ─── Get All Groups of Current User ───────────────────────────────────────

  async getMyGroups(userId: string): Promise<ExpenseGroupSummaryDto[]> {
    const memberships = await this.prisma.expenseGroupMember.findMany({
      where: {
        userId,
        leftAt: null, // Only active memberships
      },
      select: {
        group: {
          select: GROUP_SUMMARY_SELECT,
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map(({ group }) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      status: group.status,
      createdBy: group.createdBy,
      memberCount: group._count.members,
      createdAt: group.createdAt,
    }));
  }

  // ─── Get Group Details ─────────────────────────────────────────────────────

  async getGroupById(
    groupId: string,
    userId: string,
  ): Promise<ExpenseGroupResponseDto> {
    await this.assertActiveMember(groupId, userId);

    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: GROUP_WITH_MEMBERS_SELECT,
    });

    if (!group) {
      throw new NotFoundException('Expense group not found');
    }

    return this.formatGroupResponse(group);
  }

  // ─── Add Member ────────────────────────────────────────────────────────────

  async addMember(
    groupId: string,
    requesterId: string,
    dto: AddMemberDto,
  ): Promise<ExpenseGroupResponseDto> {
    // Only active members can add others
    await this.assertActiveMember(groupId, requesterId);

    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: { id: true, status: true },
    });

    if (!group) {
      throw new NotFoundException('Expense group not found');
    }

    if (group.status === GroupStatus.INACTIVE) {
      throw new BadRequestException('Cannot add members to an inactive group');
    }

    // Find the user by mobile
    const targetUser = await this.prisma.user.findUnique({
      where: { mobile: dto.mobile },
      select: { id: true, name: true, mobile: true },
    });

    if (!targetUser) {
      throw new NotFoundException(
        `No user found with mobile number ${dto.mobile}`,
      );
    }

    if (targetUser.id === requesterId) {
      throw new BadRequestException('You are already a member of this group');
    }

    // Check if already an active member
    const existingActiveMembership =
      await this.prisma.expenseGroupMember.findFirst({
        where: {
          groupId,
          userId: targetUser.id,
          leftAt: null,
        },
      });

    if (existingActiveMembership) {
      throw new ConflictException(
        `${targetUser.name} is already a member of this group`,
      );
    }

    // Check if previously left — re-activate instead of creating a duplicate
    const previousMembership = await this.prisma.expenseGroupMember.findFirst({
      where: {
        groupId,
        userId: targetUser.id,
        leftAt: { not: null },
      },
      orderBy: { joinedAt: 'desc' },
    });

    if (previousMembership) {
      // Re-join: reset leftAt and update joinedAt
      await this.prisma.expenseGroupMember.update({
        where: { id: previousMembership.id },
        data: { leftAt: null, joinedAt: new Date() },
      });
    } else {
      // New member
      await this.prisma.expenseGroupMember.create({
        data: { groupId, userId: targetUser.id },
      });
    }

    const updated = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: GROUP_WITH_MEMBERS_SELECT,
    });

    return this.formatGroupResponse(updated!);
  }

  // ─── Remove Member ─────────────────────────────────────────────────────────

  async removeMember(
    groupId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    await this.assertActiveMember(groupId, requesterId);

    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: { id: true, status: true, createdById: true },
    });

    if (!group) {
      throw new NotFoundException('Expense group not found');
    }

    // Only the creator can remove others; anyone can remove themselves
    const isSelf = requesterId === targetUserId;
    const isCreator = requesterId === group.createdById;

    if (!isSelf && !isCreator) {
      throw new ForbiddenException(
        'Only the group creator can remove other members',
      );
    }

    // Creator cannot be removed by anyone (including themselves while others remain)
    if (targetUserId === group.createdById && !isSelf) {
      throw new ForbiddenException('The group creator cannot be removed');
    }

    const membership = await this.prisma.expenseGroupMember.findFirst({
      where: { groupId, userId: targetUserId, leftAt: null },
    });

    if (!membership) {
      throw new NotFoundException('Member not found in this group');
    }

    // Soft-delete: mark leftAt
    await this.prisma.expenseGroupMember.update({
      where: { id: membership.id },
      data: { leftAt: new Date() },
    });

    // Check if any active members remain — if not, mark group INACTIVE
    const remainingActiveMembers = await this.prisma.expenseGroupMember.count({
      where: { groupId, leftAt: null },
    });

    if (remainingActiveMembers === 0) {
      await this.prisma.expenseGroup.update({
        where: { id: groupId },
        data: { status: GroupStatus.INACTIVE },
      });
    }

    const message = isSelf
      ? 'You have left the group'
      : 'Member removed from group';

    return { message };
  }

  // ─── Leave Group (self-removal sugar) ─────────────────────────────────────

  async leaveGroup(
    groupId: string,
    userId: string,
  ): Promise<{ message: string }> {
    return this.removeMember(groupId, userId, userId);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Asserts the user is an active member of the group.
   * Throws appropriate HTTP exceptions otherwise.
   */
  private async assertActiveMember(
    groupId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.prisma.expenseGroupMember.findFirst({
      where: { groupId, userId, leftAt: null },
    });

    if (!membership) {
      // Distinguish between "group doesn't exist" and "not a member"
      const groupExists = await this.prisma.expenseGroup.findUnique({
        where: { id: groupId },
        select: { id: true },
      });

      if (!groupExists) {
        throw new NotFoundException('Expense group not found');
      }

      throw new ForbiddenException(
        'You are not an active member of this group',
      );
    }
  }

  /**
   * Maps raw Prisma group result to response DTO shape.
   */
  private formatGroupResponse(group: any): ExpenseGroupResponseDto {
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      status: group.status,
      createdBy: group.createdBy,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members: group.members,
      memberCount: group.members.length,
    };
  }
}
