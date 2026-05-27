import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SplitType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CustomSplitItemDto } from './dto/custom-split-item.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import {
  ExpenseResponseDto,
  PaginatedExpensesDto,
} from './dto/expense-response.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

// ─── Prisma select shape (reused across queries) ──────────────────────────────

const EXPENSE_SELECT = {
  id: true,
  groupId: true,
  title: true,
  amount: true,
  splitType: true,
  note: true,
  expenseDate: true,
  createdAt: true,
  updatedAt: true,
  paidBy: { select: { id: true, name: true, mobile: true } },
  createdBy: { select: { id: true, name: true, mobile: true } },
  participants: {
    select: {
      id: true,
      user: { select: { id: true, name: true, mobile: true } },
    },
  },
  customSplits: {
    select: {
      id: true,
      amount: true,
      user: { select: { id: true, name: true, mobile: true } },
    },
  },
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create Expense ──────────────────────────────────────────────────────────

  async createExpense(
    creatorId: string,
    dto: CreateExpenseDto,
  ): Promise<ExpenseResponseDto> {
    const activeMembers = await this.getActiveGroupMemberIds(dto.groupId);

    // Creator must be active member
    this.assertIsMember(creatorId, activeMembers, 'You are not a member of this group');

    // Payer must be active member
    this.assertIsMember(dto.paidById, activeMembers, 'Payer must be an active group member');

    // All participants must be active members
    this.assertAllMembers(dto.participantIds, activeMembers, 'All participants must be active group members');

    if (dto.splitType === SplitType.CUSTOM) {
      this.validateCustomSplits(dto.amount, dto.participantIds, dto.customSplits ?? []);
    }

    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          groupId: dto.groupId,
          title: dto.title,
          amount: dto.amount,
          splitType: dto.splitType,
          paidById: dto.paidById,
          createdById: creatorId,
          note: dto.note ?? null,
          // Equal split: store only participants
          participants: {
            create: dto.participantIds.map((userId) => ({ userId })),
          },
          // Custom split: store explicit amounts
          ...(dto.splitType === SplitType.CUSTOM && {
            customSplits: {
              create: dto.customSplits!.map((s) => ({
                userId: s.userId,
                amount: s.amount,
              })),
            },
          }),
        },
        select: EXPENSE_SELECT,
      });
      return created;
    });

    return expense as unknown as ExpenseResponseDto;
  }

  // ─── Get Group Expenses (paginated) ─────────────────────────────────────────

  async getGroupExpenses(
    groupId: string,
    requesterId: string,
    query: ExpenseQueryDto,
  ): Promise<PaginatedExpensesDto> {
    const activeMembers = await this.getActiveGroupMemberIds(groupId);
    this.assertIsMember(requesterId, activeMembers, 'You are not a member of this group');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [expenses, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where: { groupId },
        select: EXPENSE_SELECT,
        orderBy: { expenseDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where: { groupId } }),
    ]);

    return {
      data: expenses as unknown as ExpenseResponseDto[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Get Single Expense ──────────────────────────────────────────────────────

  async getExpenseById(
    expenseId: string,
    requesterId: string,
  ): Promise<ExpenseResponseDto> {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      select: EXPENSE_SELECT,
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    // Requester must be an active member of the group
    const activeMembers = await this.getActiveGroupMemberIds(expense.groupId);
    this.assertIsMember(
      requesterId,
      activeMembers,
      'You are not a member of this group',
    );

    return expense as unknown as ExpenseResponseDto;
  }

  // ─── Update Expense ──────────────────────────────────────────────────────────

  async updateExpense(
    expenseId: string,
    requesterId: string,
    dto: UpdateExpenseDto,
  ): Promise<ExpenseResponseDto> {
    const existing = await this.findExpenseOrThrow(expenseId);

    // Only creator can edit
    if (existing.createdById !== requesterId) {
      throw new ForbiddenException('Only the expense creator can edit this expense');
    }

    const activeMembers = await this.getActiveGroupMemberIds(existing.groupId);

    // Resolve the effective values (merge patch: dto overrides existing)
    const effectiveSplitType = dto.splitType ?? existing.splitType;
    const effectiveAmount =
      dto.amount !== undefined ? dto.amount : Number(existing.amount);
    const effectivePaidById = dto.paidById ?? existing.paidById;
    const effectiveParticipantIds =
      dto.participantIds ??
      existing.participants.map((p: any) => p.userId);
    const effectiveCustomSplits =
      dto.customSplits ??
      (existing.customSplits as any[]).map((s: any) => ({
        userId: s.userId,
        amount: Number(s.amount),
      }));

    // Re-validate members
    this.assertIsMember(effectivePaidById, activeMembers, 'Payer must be an active group member');
    this.assertAllMembers(effectiveParticipantIds, activeMembers, 'All participants must be active group members');

    if (effectiveSplitType === SplitType.CUSTOM) {
      this.validateCustomSplits(
        effectiveAmount,
        effectiveParticipantIds,
        effectiveCustomSplits,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Delete existing participants and splits — replace entirely
      await tx.expenseParticipant.deleteMany({ where: { expenseId } });
      await tx.customExpenseSplit.deleteMany({ where: { expenseId } });

      return tx.expense.update({
        where: { id: expenseId },
        data: {
          ...(dto.title && { title: dto.title }),
          ...(dto.amount !== undefined && { amount: dto.amount }),
          ...(dto.splitType && { splitType: dto.splitType }),
          ...(dto.paidById && { paidById: dto.paidById }),
          ...(dto.note !== undefined && { note: dto.note }),
          participants: {
            create: effectiveParticipantIds.map((userId: string) => ({ userId })),
          },
          ...(effectiveSplitType === SplitType.CUSTOM && {
            customSplits: {
              create: effectiveCustomSplits.map((s: CustomSplitItemDto) => ({
                userId: s.userId,
                amount: s.amount,
              })),
            },
          }),
        },
        select: EXPENSE_SELECT,
      });
    });

    return updated as unknown as ExpenseResponseDto;
  }

  // ─── Delete Expense ──────────────────────────────────────────────────────────

  async deleteExpense(
    expenseId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const existing = await this.findExpenseOrThrow(expenseId);

    if (existing.createdById !== requesterId) {
      throw new ForbiddenException('Only the expense creator can delete this expense');
    }

    // Cascade handled by Prisma schema (onDelete: Cascade on participants & splits)
    await this.prisma.expense.delete({ where: { id: expenseId } });

    return { message: 'Expense deleted successfully' };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Returns the set of active member user IDs for a group.
   * Throws NotFoundException if the group does not exist.
   */
  private async getActiveGroupMemberIds(groupId: string): Promise<Set<string>> {
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Expense group not found');
    }

    const members = await this.prisma.expenseGroupMember.findMany({
      where: { groupId, leftAt: null },
      select: { userId: true },
    });

    return new Set(members.map((m) => m.userId));
  }

  /** Throws ForbiddenException if userId is not in the member set. */
  private assertIsMember(
    userId: string,
    memberSet: Set<string>,
    message: string,
  ): void {
    if (!memberSet.has(userId)) {
      throw new ForbiddenException(message);
    }
  }

  /** Throws BadRequestException if any userId in the list is not in the member set. */
  private assertAllMembers(
    userIds: string[],
    memberSet: Set<string>,
    message: string,
  ): void {
    const nonMembers = userIds.filter((id) => !memberSet.has(id));
    if (nonMembers.length > 0) {
      throw new BadRequestException(
        `${message}: ${nonMembers.join(', ')}`,
      );
    }
  }

  /**
   * Validates custom split rules:
   * 1. Each split userId must be in participantIds
   * 2. Sum of split amounts must equal expense amount (within ±0.01 rounding tolerance)
   * 3. customSplits must cover exactly the same users as participantIds
   */
  private validateCustomSplits(
    totalAmount: number,
    participantIds: string[],
    customSplits: CustomSplitItemDto[],
  ): void {
    if (!customSplits || customSplits.length === 0) {
      throw new BadRequestException(
        'customSplits are required for CUSTOM split type',
      );
    }

    const splitUserIds = customSplits.map((s) => s.userId);
    const participantSet = new Set(participantIds);
    const splitSet = new Set(splitUserIds);

    // Every split user must be a participant
    for (const uid of splitSet) {
      if (!participantSet.has(uid)) {
        throw new BadRequestException(
          `customSplits user ${uid} is not in participantIds`,
        );
      }
    }

    // Every participant must have a split entry
    for (const uid of participantSet) {
      if (!splitSet.has(uid)) {
        throw new BadRequestException(
          `Participant ${uid} is missing a customSplit entry`,
        );
      }
    }

    // Sum must equal total amount (allow ±0.01 for decimal rounding)
    const splitSum = customSplits.reduce((sum, s) => sum + s.amount, 0);
    const diff = Math.abs(splitSum - totalAmount);
    if (diff > 0.01) {
      throw new BadRequestException(
        `Custom split amounts (${splitSum.toFixed(2)}) must equal the total expense amount (${totalAmount.toFixed(2)})`,
      );
    }
  }

  /** Fetches an expense or throws NotFoundException. Returns raw Prisma result. */
  private async findExpenseOrThrow(expenseId: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        ...EXPENSE_SELECT,
        createdById: true,
        paidById: true,
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }
}
