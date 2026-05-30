import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  applyExpenses,
  applySettlements,
  simplifyDebts,
  toNumber,
} from '../balances/balance.calculator';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityQueryDto, MonthQueryDto } from './dto/dashboard-query.dto';
import {
  ActivityItemDto,
  GroupDashboardDto,
  MemberBalanceSummaryDto,
  MiniUserDto,
  MonthlySummaryDto,
  MonthlyTrendPointDto,
  MyDashboardSummaryDto,
  PendingAmountSummaryDto,
  PendingDebtItemDto,
  RecentActivityResponseDto,
  TopPayerDto,
} from './dto/dashboard-response.dto';

// ─── Reusable Prisma selects ──────────────────────────────────────────────────

const MINI_USER_SELECT = { id: true, name: true, mobile: true } as const;

const EXPENSE_FOR_BALANCE = {
  id: true,
  amount: true,
  splitType: true,
  paidById: true,
  participants: { select: { userId: true } },
  customSplits: { select: { userId: true, amount: true } },
} as const;

const SETTLEMENT_FOR_BALANCE = {
  payerId: true,
  payeeId: true,
  amount: true,
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── 1. My Dashboard Summary ───────────────────────────────────────────────

  async getMyDashboardSummary(userId: string): Promise<MyDashboardSummaryDto> {
    const [activeGroupCount, totalExpensesCreated, totalPaidAggregate, activeGroupIds] =
      await Promise.all([
        this.prisma.expenseGroupMember.count({
          where: { userId, leftAt: null },
        }),
        this.prisma.expense.count({ where: { createdById: userId } }),
        this.prisma.expense.aggregate({
          where: { paidById: userId },
          _sum: { amount: true },
        }),
        this.prisma.expenseGroupMember
          .findMany({
            where: { userId, leftAt: null },
            select: { groupId: true },
          })
          .then((rows) => rows.map((r) => r.groupId)),
      ]);

    const { totalOwed, totalReceivable } = await this.aggregateUserBalances(
      userId,
      activeGroupIds,
    );

    return {
      activeGroupsCount: activeGroupCount,
      totalExpensesCreated,
      totalAmountPaid: toNumber(Number(totalPaidAggregate._sum.amount ?? 0)),
      totalOwed,
      totalReceivable,
      overallNet: toNumber(totalReceivable - totalOwed),
    };
  }

  // ─── 2. Group Dashboard ────────────────────────────────────────────────────

  async getGroupDashboard(
    groupId: string,
    requesterId: string,
  ): Promise<GroupDashboardDto> {
    await this.assertActiveMember(groupId, requesterId);

    const [
      group,
      activeMembers,
      expenseAgg,
      settlementAgg,
      recentExpenses,
      recentSettlements,
      allExpenses,
      allSettlements,
    ] = await Promise.all([
      this.prisma.expenseGroup.findUnique({
        where: { id: groupId },
        select: { id: true, name: true },
      }),
      this.prisma.expenseGroupMember.findMany({
        where: { groupId, leftAt: null },
        select: { user: { select: MINI_USER_SELECT } },
      }),
      this.prisma.expense.aggregate({
        where: { groupId },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.settlement.aggregate({
        where: { groupId },
        _sum: { amount: true },
      }),
      this.prisma.expense.findMany({
        where: { groupId },
        select: {
          id: true,
          title: true,
          amount: true,
          splitType: true,
          expenseDate: true,
          paidBy: { select: MINI_USER_SELECT },
        },
        orderBy: { expenseDate: 'desc' },
        take: 5,
      }),
      this.prisma.settlement.findMany({
        where: { groupId },
        select: {
          id: true,
          amount: true,
          settledAt: true,
          payer: { select: MINI_USER_SELECT },
          payee: { select: MINI_USER_SELECT },
        },
        orderBy: { settledAt: 'desc' },
        take: 5,
      }),
      this.prisma.expense.findMany({
        where: { groupId },
        select: EXPENSE_FOR_BALANCE,
      }),
      this.prisma.settlement.findMany({
        where: { groupId },
        select: SETTLEMENT_FOR_BALANCE,
      }),
    ]);

    if (!group) throw new NotFoundException('Group not found');

    const members = activeMembers.map((m) => m.user);
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const balanceMap = new Map<string, number>(members.map((m) => [m.id, 0]));
    applyExpenses(allExpenses, balanceMap);
    applySettlements(allSettlements, balanceMap);

    const memberBalances: MemberBalanceSummaryDto[] = members.map((user) => ({
      user,
      netBalance: toNumber(balanceMap.get(user.id) ?? 0),
    }));

    const topPayer = await this.getTopPayer(groupId, members);

    return {
      groupId,
      groupName: group.name,
      memberCount: members.length,
      totalGroupExpense: toNumber(Number(expenseAgg._sum.amount ?? 0)),
      totalSettled: toNumber(Number(settlementAgg._sum.amount ?? 0)),
      recentExpenses: recentExpenses as any,
      recentSettlements: recentSettlements as any,
      memberBalances,
      topPayer,
    };
  }

  // ─── 3. Monthly Summary ────────────────────────────────────────────────────

  async getMonthlySummary(
    userId: string,
    query: MonthQueryDto,
  ): Promise<MonthlySummaryDto> {
    const targetMonth = query.month ?? this.currentYearMonth();
    const { start, end } = this.monthBounds(targetMonth);

    const groupIds = await this.getUserActiveGroupIds(userId);
    const trendMonths = this.lastNMonths(targetMonth, 6);

    const [currentExpenses, currentSettlements, trendData] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { groupId: { in: groupIds }, expenseDate: { gte: start, lt: end } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.settlement.aggregate({
        where: { groupId: { in: groupIds }, settledAt: { gte: start, lt: end } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      Promise.all(
        trendMonths.map(async (month): Promise<MonthlyTrendPointDto> => {
          const bounds = this.monthBounds(month);
          const [exp, sett] = await Promise.all([
            this.prisma.expense.aggregate({
              where: {
                groupId: { in: groupIds },
                expenseDate: { gte: bounds.start, lt: bounds.end },
              },
              _sum: { amount: true },
              _count: { id: true },
            }),
            this.prisma.settlement.aggregate({
              where: {
                groupId: { in: groupIds },
                settledAt: { gte: bounds.start, lt: bounds.end },
              },
              _sum: { amount: true },
              _count: { id: true },
            }),
          ]);
          return {
            month,
            totalExpense: toNumber(Number(exp._sum.amount ?? 0)),
            totalSettled: toNumber(Number(sett._sum.amount ?? 0)),
            expenseCount: exp._count.id,
            settlementCount: sett._count.id,
          };
        }),
      ),
    ]);

    return {
      month: targetMonth,
      totalExpense: toNumber(Number(currentExpenses._sum.amount ?? 0)),
      totalSettled: toNumber(Number(currentSettlements._sum.amount ?? 0)),
      expenseCount: currentExpenses._count.id,
      settlementCount: currentSettlements._count.id,
      trend: trendData,
    };
  }

  // ─── 4. Recent Activity ────────────────────────────────────────────────────

  async getRecentActivity(
    userId: string,
    query: ActivityQueryDto,
  ): Promise<RecentActivityResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const groupRows = await this.prisma.expenseGroupMember.findMany({
      where: { userId, leftAt: null },
      select: { groupId: true, group: { select: { id: true, name: true } } },
    });

    const groupIds = groupRows.map((r) => r.groupId);
    const groupLookup = new Map(groupRows.map((r) => [r.groupId, r.group]));

    const fetchLimit = limit * 3; // over-fetch before merge-sort

    const [expenses, settlements, memberEvents] = await Promise.all([
      this.prisma.expense.findMany({
        where: { groupId: { in: groupIds } },
        select: {
          id: true,
          title: true,
          amount: true,
          groupId: true,
          createdAt: true,
          createdBy: { select: MINI_USER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit,
      }),
      this.prisma.settlement.findMany({
        where: { groupId: { in: groupIds } },
        select: {
          id: true,
          amount: true,
          groupId: true,
          settledAt: true,
          payer: { select: MINI_USER_SELECT },
          payee: { select: MINI_USER_SELECT },
        },
        orderBy: { settledAt: 'desc' },
        take: fetchLimit,
      }),
      this.prisma.expenseGroupMember.findMany({
        where: { groupId: { in: groupIds } },
        select: {
          id: true,
          groupId: true,
          joinedAt: true,
          leftAt: true,
          user: { select: MINI_USER_SELECT },
        },
        orderBy: { joinedAt: 'desc' },
        take: fetchLimit,
      }),
    ]);

    const activities: ActivityItemDto[] = [];

    for (const e of expenses) {
      const group = groupLookup.get(e.groupId);
      if (!group) continue;
      activities.push({
        type: 'EXPENSE_CREATED',
        timestamp: e.createdAt,
        description: `${e.createdBy.name} added "${e.title}" (₹${Number(e.amount).toFixed(2)})`,
        group,
        entityId: e.id,
        actor: e.createdBy,
      });
    }

    for (const s of settlements) {
      const group = groupLookup.get(s.groupId);
      if (!group) continue;
      activities.push({
        type: 'SETTLEMENT_CREATED',
        timestamp: s.settledAt,
        description: `${s.payer.name} paid ${s.payee.name} ₹${Number(s.amount).toFixed(2)}`,
        group,
        entityId: s.id,
        actor: s.payer,
      });
    }

    for (const m of memberEvents) {
      const group = groupLookup.get(m.groupId);
      if (!group) continue;
      if (m.leftAt) {
        activities.push({
          type: 'MEMBER_LEFT',
          timestamp: m.leftAt,
          description: `${m.user.name} left ${group.name}`,
          group,
          entityId: m.id,
          actor: m.user,
        });
      }
      activities.push({
        type: 'MEMBER_JOINED',
        timestamp: m.joinedAt,
        description: `${m.user.name} joined ${group.name}`,
        group,
        entityId: m.id,
        actor: m.user,
      });
    }

    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      activities: activities.slice(skip, skip + limit),
      total: activities.length,
    };
  }

  // ─── 5. Pending Amount Summary ─────────────────────────────────────────────

  async getPendingAmountSummary(userId: string): Promise<PendingAmountSummaryDto> {
    const groupIds = await this.getUserActiveGroupIds(userId);

    const oweToMe: PendingDebtItemDto[] = [];
    const iOwe: PendingDebtItemDto[] = [];

    await Promise.all(
      groupIds.map(async (groupId) => {
        const [group, members, expenses, settlements] = await Promise.all([
          this.prisma.expenseGroup.findUnique({
            where: { id: groupId },
            select: { id: true, name: true },
          }),
          this.prisma.expenseGroupMember.findMany({
            where: { groupId, leftAt: null },
            select: { user: { select: MINI_USER_SELECT } },
          }),
          this.prisma.expense.findMany({
            where: { groupId },
            select: EXPENSE_FOR_BALANCE,
          }),
          this.prisma.settlement.findMany({
            where: { groupId },
            select: SETTLEMENT_FOR_BALANCE,
          }),
        ]);

        if (!group) return;

        const activeMembers = members.map((m) => m.user);
        const memberMap = new Map(activeMembers.map((m) => [m.id, m]));
        const balanceMap = new Map<string, number>(
          activeMembers.map((m) => [m.id, 0]),
        );

        applyExpenses(expenses, balanceMap);
        applySettlements(settlements, balanceMap);

        const debts = simplifyDebts(balanceMap, memberMap);

        for (const debt of debts) {
          if (debt.to.id === userId) {
            oweToMe.push({
              user: debt.from,
              group,
              amount: debt.amount,
              summary: `${debt.from.name} owes you ₹${toNumber(debt.amount).toFixed(2)} in ${group.name}`,
            });
          } else if (debt.from.id === userId) {
            iOwe.push({
              user: debt.to,
              group,
              amount: debt.amount,
              summary: `You owe ${debt.to.name} ₹${toNumber(debt.amount).toFixed(2)} in ${group.name}`,
            });
          }
        }
      }),
    );

    oweToMe.sort((a, b) => toNumber(b.amount) - toNumber(a.amount));
    iOwe.sort((a, b) => toNumber(b.amount) - toNumber(a.amount));

    return {
      oweToMe,
      iOwe,
      totalReceivable: toNumber(
        oweToMe.reduce((s, d) => s + toNumber(d.amount), 0),
      ),
      totalOwed: toNumber(
        iOwe.reduce((s, d) => s + toNumber(d.amount), 0),
      ),
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async aggregateUserBalances(
    userId: string,
    groupIds: string[],
  ): Promise<{ totalOwed: number; totalReceivable: number }> {
    if (groupIds.length === 0) return { totalOwed: 0, totalReceivable: 0 };

    let totalOwed = 0;
    let totalReceivable = 0;

    await Promise.all(
      groupIds.map(async (groupId) => {
        const [members, expenses, settlements] = await Promise.all([
          this.prisma.expenseGroupMember.findMany({
            where: { groupId, leftAt: null },
            select: { userId: true },
          }),
          this.prisma.expense.findMany({ where: { groupId }, select: EXPENSE_FOR_BALANCE }),
          this.prisma.settlement.findMany({ where: { groupId }, select: SETTLEMENT_FOR_BALANCE }),
        ]);

        const balanceMap = new Map<string, number>(
          members.map((m) => [m.userId, 0]),
        );
        applyExpenses(expenses, balanceMap);
        applySettlements(settlements, balanceMap);

        const net = toNumber(balanceMap.get(userId) ?? 0);
        if (net > 0) totalReceivable += net;
        else if (net < 0) totalOwed += Math.abs(net);
      }),
    );

    return { totalOwed: toNumber(totalOwed), totalReceivable: toNumber(totalReceivable) };
  }

  private async getUserActiveGroupIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.expenseGroupMember.findMany({
      where: { userId, leftAt: null },
      select: { groupId: true },
    });
    return rows.map((r) => r.groupId);
  }

  private async getTopPayer(
    groupId: string,
    members: MiniUserDto[],
  ): Promise<TopPayerDto | null> {
    const results = await Promise.all(
      members.map(async (member) => {
        const agg = await this.prisma.expense.aggregate({
          where: { groupId, paidById: member.id },
          _sum: { amount: true },
        });
        return { user: member, totalPaid: toNumber(Number(agg._sum.amount ?? 0)) };
      }),
    );
    const sorted = results.sort((a, b) => b.totalPaid - a.totalPaid);
    return sorted[0]?.totalPaid > 0 ? sorted[0] : null;
  }

  private async assertActiveMember(groupId: string, userId: string): Promise<void> {
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Expense group not found');
    const membership = await this.prisma.expenseGroupMember.findFirst({
      where: { groupId, userId, leftAt: null },
    });
    if (!membership) throw new ForbiddenException('You are not an active member of this group');
  }

  private currentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private monthBounds(yearMonth: string): { start: Date; end: Date } {
    const [year, month] = yearMonth.split('-').map(Number);
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 1),
    };
  }

  private lastNMonths(targetMonth: string, n: number): string[] {
    const [year, month] = targetMonth.split('-').map(Number);
    const months: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  }
}
