import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyExpenses,
  applySettlements,
  RawMember,
  simplifyDebts,
  toNumber,
} from './balance.calculator';
import {
  GroupBalanceResponseDto,
  MemberBalanceDto,
  NetBalanceMap,
  SimplifiedDebtResponseDto,
  UserBalanceSummaryDto,
  UserGroupBalanceSummaryDto,
} from './dto/balance-response.dto';

// ─── Prisma select shapes ─────────────────────────────────────────────────────

const EXPENSE_SELECT = {
  id: true,
  amount: true,
  splitType: true,
  paidById: true,
  participants: { select: { userId: true } },
  customSplits: { select: { userId: true, amount: true } },
} as const;

const SETTLEMENT_SELECT = {
  payerId: true,
  payeeId: true,
  amount: true,
} as const;

const MEMBER_USER_SELECT = {
  id: true,
  name: true,
  mobile: true,
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── 1. Full group balance ─────────────────────────────────────────────────

  async getGroupBalances(
    groupId: string,
    requesterId: string,
  ): Promise<GroupBalanceResponseDto> {
    const { group, activeMembers, memberMap } =
      await this.loadGroupContext(groupId, requesterId);

    const [expenses, settlements] = await Promise.all([
      this.prisma.expense.findMany({
        where: { groupId },
        select: EXPENSE_SELECT,
      }),
      this.prisma.settlement.findMany({
        where: { groupId },
        select: SETTLEMENT_SELECT,
      }),
    ]);

    // Build net balance map seeded with every active member at 0
    const balanceMap: NetBalanceMap = new Map(
      activeMembers.map((m) => [m.id, 0]),
    );

    applyExpenses(expenses, balanceMap);
    applySettlements(settlements, balanceMap);

    const memberBalances = this.buildMemberBalances(activeMembers, balanceMap);
    const simplifiedDebts = simplifyDebts(balanceMap, memberMap);

    return {
      groupId,
      groupName: group.name,
      memberBalances,
      simplifiedDebts,
    };
  }

  // ─── 2. Simplified debts only (lightweight) ────────────────────────────────

  async getSimplifiedDebts(
    groupId: string,
    requesterId: string,
  ): Promise<SimplifiedDebtResponseDto> {
    const { activeMembers, memberMap } = await this.loadGroupContext(
      groupId,
      requesterId,
    );

    const [expenses, settlements] = await Promise.all([
      this.prisma.expense.findMany({
        where: { groupId },
        select: EXPENSE_SELECT,
      }),
      this.prisma.settlement.findMany({
        where: { groupId },
        select: SETTLEMENT_SELECT,
      }),
    ]);

    const balanceMap: NetBalanceMap = new Map(
      activeMembers.map((m) => [m.id, 0]),
    );

    applyExpenses(expenses, balanceMap);
    applySettlements(settlements, balanceMap);

    return {
      groupId,
      debts: simplifyDebts(balanceMap, memberMap),
    };
  }

  // ─── 3. Current user's balance summary across all groups ──────────────────

  async getMyBalanceSummary(userId: string): Promise<UserBalanceSummaryDto> {
    // Fetch all active memberships for this user
    const memberships = await this.prisma.expenseGroupMember.findMany({
      where: { userId, leftAt: null },
      select: {
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const byGroup: UserGroupBalanceSummaryDto[] = [];
    let grandTotalReceivable = 0;
    let grandTotalOwed = 0;

    // Process each group concurrently
    await Promise.all(
      memberships.map(async ({ group }) => {
        const summary = await this.computeUserGroupBalance(userId, group.id);
        byGroup.push({
          groupId: group.id,
          groupName: group.name,
          totalReceivable: summary.totalReceivable,
          totalOwed: summary.totalOwed,
          netBalance: summary.netBalance,
        });
        grandTotalReceivable += summary.totalReceivable;
        grandTotalOwed += summary.totalOwed;
      }),
    );

    // Sort by absolute net balance (most significant groups first)
    byGroup.sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));

    return {
      totalReceivable: toNumber(grandTotalReceivable),
      totalOwed: toNumber(grandTotalOwed),
      overallNet: toNumber(grandTotalReceivable - grandTotalOwed),
      byGroup,
    };
  }

  // ─── 4. Single user's balance in a specific group ─────────────────────────

  async getUserBalanceInGroup(
    groupId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<UserGroupBalanceSummaryDto> {
    const { group } = await this.loadGroupContext(groupId, requesterId);
    const summary = await this.computeUserGroupBalance(targetUserId, groupId);

    return {
      groupId,
      groupName: group.name,
      ...summary,
    };
  }

  // ─── Private: compute balance for one user in one group ───────────────────

  private async computeUserGroupBalance(
    userId: string,
    groupId: string,
  ): Promise<{ totalReceivable: number; totalOwed: number; netBalance: number }> {
    const [expenses, settlements] = await Promise.all([
      this.prisma.expense.findMany({
        where: { groupId },
        select: EXPENSE_SELECT,
      }),
      this.prisma.settlement.findMany({
        where: { groupId },
        select: SETTLEMENT_SELECT,
      }),
    ]);

    // We only need the full active member list to build the seed map
    const members = await this.prisma.expenseGroupMember.findMany({
      where: { groupId, leftAt: null },
      select: { userId: true },
    });

    const balanceMap: NetBalanceMap = new Map(
      members.map((m) => [m.userId, 0]),
    );

    applyExpenses(expenses, balanceMap);
    applySettlements(settlements, balanceMap);

    const net = toNumber(balanceMap.get(userId) ?? 0);
    const totalReceivable = net > 0 ? net : 0;
    const totalOwed = net < 0 ? Math.abs(net) : 0;

    return { totalReceivable, totalOwed, netBalance: net };
  }

  // ─── Private: load + authorise group context ──────────────────────────────

  /**
   * Fetches the group, validates the requester is an active member,
   * and returns active members + a lookup map.
   */
  private async loadGroupContext(groupId: string, requesterId: string) {
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });

    if (!group) {
      throw new NotFoundException('Expense group not found');
    }

    const memberships = await this.prisma.expenseGroupMember.findMany({
      where: { groupId, leftAt: null },
      select: {
        user: { select: MEMBER_USER_SELECT },
      },
    });

    const activeMembers: RawMember[] = memberships.map((m) => m.user);

    const isRequesterMember = activeMembers.some((m) => m.id === requesterId);
    if (!isRequesterMember) {
      throw new ForbiddenException('You are not an active member of this group');
    }

    const memberMap = new Map<string, RawMember>(
      activeMembers.map((m) => [m.id, m]),
    );

    return { group, activeMembers, memberMap };
  }

  // ─── Private: shape member balance array ─────────────────────────────────

  private buildMemberBalances(
    members: RawMember[],
    balanceMap: NetBalanceMap,
  ): MemberBalanceDto[] {
    return members.map((member) => {
      const net = toNumber(balanceMap.get(member.id) ?? 0);
      return {
        user: member,
        totalReceivable: net > 0 ? net : 0,
        totalOwed: net < 0 ? Math.abs(net) : 0,
        netBalance: net,
      };
    });
  }
}
