import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyExpenses,
  applySettlements,
  toNumber,
} from '../balances/balance.calculator';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { SettlementQueryDto } from './dto/settlement-query.dto';
import {
  PaginatedSettlementsDto,
  SettlementResponseDto,
} from './dto/settlement-response.dto';

// ─── Prisma select shape ──────────────────────────────────────────────────────

const SETTLEMENT_SELECT = {
  id: true,
  groupId: true,
  amount: true,
  note: true,
  settledAt: true,
  createdAt: true,
  payer: { select: { id: true, name: true, mobile: true } },
  payee: { select: { id: true, name: true, mobile: true } },
} as const;

const EXPENSE_FOR_BALANCE_SELECT = {
  id: true,
  amount: true,
  splitType: true,
  paidById: true,
  participants: { select: { userId: true } },
  customSplits: { select: { userId: true, amount: true } },
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create Settlement ──────────────────────────────────────────────────────

  async createSettlement(
    requesterId: string,
    dto: CreateSettlementDto,
  ): Promise<SettlementResponseDto> {
    // ── 1. Basic business rule: payer ≠ payee ────────────────────────────────
    if (dto.payerId === dto.payeeId) {
      throw new BadRequestException('Payer and payee cannot be the same person');
    }

    // ── 2. Validate group exists ─────────────────────────────────────────────
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: dto.groupId },
      select: { id: true, name: true },
    });

    if (!group) {
      throw new NotFoundException('Expense group not found');
    }

    // ── 3. Load active members ───────────────────────────────────────────────
    const activeMemberIds = await this.getActiveMemberIds(dto.groupId);

    // Requester must be an active member
    if (!activeMemberIds.has(requesterId)) {
      throw new ForbiddenException('You are not an active member of this group');
    }

    // Payer must be an active member
    if (!activeMemberIds.has(dto.payerId)) {
      throw new BadRequestException(
        'Payer is not an active member of this group',
      );
    }

    // Payee must be an active member
    if (!activeMemberIds.has(dto.payeeId)) {
      throw new BadRequestException(
        'Payee is not an active member of this group',
      );
    }

    // ── 4. Validate settlement amount against current balance ────────────────
    await this.assertSettlementAmountValid(
      dto.groupId,
      dto.payerId,
      dto.payeeId,
      dto.amount,
      activeMemberIds,
    );

    // ── 5. Persist settlement (settlements are permanent — no tx needed) ─────
    const settlement = await this.prisma.settlement.create({
      data: {
        groupId: dto.groupId,
        payerId: dto.payerId,
        payeeId: dto.payeeId,
        amount: dto.amount,
        note: dto.note ?? null,
        settledAt: new Date(),
      },
      select: SETTLEMENT_SELECT,
    });

    return settlement as unknown as SettlementResponseDto;
  }

  // ─── Get Group Settlements (paginated) ──────────────────────────────────────

  async getGroupSettlements(
    groupId: string,
    requesterId: string,
    query: SettlementQueryDto,
  ): Promise<PaginatedSettlementsDto> {
    await this.assertActiveMember(groupId, requesterId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [settlements, total] = await this.prisma.$transaction([
      this.prisma.settlement.findMany({
        where: { groupId },
        select: SETTLEMENT_SELECT,
        orderBy: { settledAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.settlement.count({ where: { groupId } }),
    ]);

    return {
      data: settlements as unknown as SettlementResponseDto[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Get Single Settlement ───────────────────────────────────────────────────

  async getSettlementById(
    settlementId: string,
    requesterId: string,
  ): Promise<SettlementResponseDto> {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: SETTLEMENT_SELECT,
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    // Only active group members can view
    await this.assertActiveMember(settlement.groupId, requesterId);

    return settlement as unknown as SettlementResponseDto;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Validates that the settlement amount does not exceed the actual debt
   * the payer owes to the payee at this moment in time.
   *
   * Approach:
   *   1. Build a full balance map from all expenses + prior settlements.
   *   2. Extract the net balance between (payerId, payeeId) using the
   *      simplified debt approach — find if payer genuinely owes payee.
   *   3. If no debt exists in that direction, reject.
   *   4. If amount > current debt, reject with the exact amount.
   */
  private async assertSettlementAmountValid(
    groupId: string,
    payerId: string,
    payeeId: string,
    proposedAmount: number,
    activeMemberIds: Set<string>,
  ): Promise<void> {
    const [expenses, priorSettlements] = await Promise.all([
      this.prisma.expense.findMany({
        where: { groupId },
        select: EXPENSE_FOR_BALANCE_SELECT,
      }),
      this.prisma.settlement.findMany({
        where: { groupId },
        select: { payerId: true, payeeId: true, amount: true },
      }),
    ]);

    // Seed map with all active members at 0
    const balanceMap = new Map<string, number>(
      [...activeMemberIds].map((id) => [id, 0]),
    );

    applyExpenses(expenses, balanceMap);
    applySettlements(priorSettlements, balanceMap);

    // Net balance of payer: negative means they owe money
    const payerNet = toNumber(balanceMap.get(payerId) ?? 0);
    // Net balance of payee: positive means they are owed money
    const payeeNet = toNumber(balanceMap.get(payeeId) ?? 0);

    // Payer must have a negative net (owes money overall)
    if (payerNet >= 0) {
      throw new BadRequestException(
        `${payerId} does not currently owe any money in this group`,
      );
    }

    // Payee must have a positive net (is owed money overall)
    if (payeeNet <= 0) {
      throw new BadRequestException(
        `The specified payee is not owed any money in this group`,
      );
    }

    // The maximum settleable amount is the minimum of:
    //   - what payer owes in total (|payerNet|)
    //   - what payee is owed in total (payeeNet)
    const maxSettleable = toNumber(Math.min(Math.abs(payerNet), payeeNet));

    const EPSILON = 0.01;
    if (proposedAmount > maxSettleable + EPSILON) {
      throw new BadRequestException(
        `Settlement amount ₹${proposedAmount.toFixed(2)} exceeds the current payable amount of ₹${maxSettleable.toFixed(2)}`,
      );
    }
  }

  /** Returns the set of active member user IDs for a group. */
  private async getActiveMemberIds(groupId: string): Promise<Set<string>> {
    const members = await this.prisma.expenseGroupMember.findMany({
      where: { groupId, leftAt: null },
      select: { userId: true },
    });
    return new Set(members.map((m) => m.userId));
  }

  /** Asserts requester is an active member; throws if not. */
  private async assertActiveMember(
    groupId: string,
    userId: string,
  ): Promise<void> {
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Expense group not found');
    }

    const membership = await this.prisma.expenseGroupMember.findFirst({
      where: { groupId, userId, leftAt: null },
    });

    if (!membership) {
      throw new ForbiddenException('You are not an active member of this group');
    }
  }
}
