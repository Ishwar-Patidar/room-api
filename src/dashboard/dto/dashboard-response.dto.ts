import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Decimal } from '@prisma/client/runtime/client';

// ─── Shared ───────────────────────────────────────────────────────────────────

export class MiniUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() mobile!: string;
}

export class MiniGroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

// ─── 1. My Dashboard Summary ─────────────────────────────────────────────────

export class MyDashboardSummaryDto {
  @ApiProperty({ description: 'Number of active groups the user belongs to' })
  activeGroupsCount!: number;

  @ApiProperty({ description: 'Total number of expenses the user has created' })
  totalExpensesCreated!: number;

  @ApiProperty({ description: 'Total INR amount the user has paid across all groups' })
  totalAmountPaid!: number;

  @ApiProperty({ description: 'Total INR amount the user owes to others' })
  totalOwed!: number;

  @ApiProperty({ description: 'Total INR amount others owe to the user' })
  totalReceivable!: number;

  @ApiProperty({ description: 'Net balance: positive = user is owed, negative = user owes' })
  overallNet!: number;
}

// ─── 2. Group Dashboard ───────────────────────────────────────────────────────

export class RecentExpenseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() splitType!: string;
  @ApiProperty({ type: MiniUserDto }) paidBy!: MiniUserDto;
  @ApiProperty() expenseDate!: Date;
}

export class RecentSettlementDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: MiniUserDto }) payer!: MiniUserDto;
  @ApiProperty({ type: MiniUserDto }) payee!: MiniUserDto;
  @ApiProperty() amount!: string;
  @ApiProperty() settledAt!: Date;
}

export class MemberBalanceSummaryDto {
  @ApiProperty({ type: MiniUserDto }) user!: MiniUserDto;
  @ApiProperty() netBalance!: number;
}

export class TopPayerDto {
  @ApiProperty({ type: MiniUserDto }) user!: MiniUserDto;
  @ApiProperty({ description: 'Total amount this member has paid for the group' })
  totalPaid!: number;
}

export class GroupDashboardDto {
  @ApiProperty() groupId!: string;
  @ApiProperty() groupName!: string;
  @ApiProperty() memberCount!: number;
  @ApiProperty({ description: 'Sum of all expense amounts in the group' })
  totalGroupExpense!: number;
  @ApiProperty({ description: 'Sum of all settlement amounts in the group' })
  totalSettled!: number;
  @ApiProperty({ type: [RecentExpenseDto] }) recentExpenses!: RecentExpenseDto[];
  @ApiProperty({ type: [RecentSettlementDto] }) recentSettlements!: RecentSettlementDto[];
  @ApiProperty({ type: [MemberBalanceSummaryDto] }) memberBalances!: MemberBalanceSummaryDto[];
  @ApiPropertyOptional({ type: TopPayerDto }) topPayer!: TopPayerDto | null;
}

// ─── 3. Monthly Summary ───────────────────────────────────────────────────────

export class MonthlyTrendPointDto {
  @ApiProperty({ example: '2025-06' }) month!: string;
  @ApiProperty() totalExpense!: number;
  @ApiProperty() totalSettled!: number;
  @ApiProperty() expenseCount!: number;
  @ApiProperty() settlementCount!: number;
}

export class MonthlySummaryDto {
  @ApiProperty({ example: '2025-06', description: 'The queried month (YYYY-MM)' })
  month!: string;

  @ApiProperty() totalExpense!: number;
  @ApiProperty() totalSettled!: number;
  @ApiProperty() expenseCount!: number;
  @ApiProperty() settlementCount!: number;

  @ApiProperty({ type: [MonthlyTrendPointDto], description: 'Last 6 months trend' })
  trend!: MonthlyTrendPointDto[];
}

// ─── 4. Recent Activity ───────────────────────────────────────────────────────

export type ActivityType =
  | 'EXPENSE_CREATED'
  | 'SETTLEMENT_CREATED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT';

export class ActivityItemDto {
  @ApiProperty({
    enum: ['EXPENSE_CREATED', 'SETTLEMENT_CREATED', 'MEMBER_JOINED', 'MEMBER_LEFT'],
  })
  type!: ActivityType;

  @ApiProperty() timestamp!: Date;
  @ApiProperty() description!: string;
  @ApiProperty({ type: MiniGroupDto }) group!: MiniGroupDto;

  @ApiPropertyOptional({ description: 'Related entity ID (expense/settlement/member)' })
  entityId?: string;

  @ApiPropertyOptional({ type: MiniUserDto })
  actor?: MiniUserDto;
}

export class RecentActivityResponseDto {
  @ApiProperty({ type: [ActivityItemDto] })
  activities!: ActivityItemDto[];

  @ApiProperty() total!: number;
}

// ─── 5. Pending Amount Summary ────────────────────────────────────────────────

export class PendingDebtItemDto {
  @ApiProperty({ type: MiniUserDto }) user!: MiniUserDto;
  @ApiProperty({ type: MiniGroupDto }) group!: MiniGroupDto;
  @ApiProperty() amount!: number | Decimal | string;
  @ApiProperty({ example: 'Rahul owes you ₹500.00' }) summary!: string;
}

export class PendingAmountSummaryDto {
  @ApiProperty({ description: 'People who owe the current user', type: [PendingDebtItemDto] })
  oweToMe!: PendingDebtItemDto[];

  @ApiProperty({ description: 'People the current user owes', type: [PendingDebtItemDto] })
  iOwe!: PendingDebtItemDto[];

  @ApiProperty() totalReceivable!: number;
  @ApiProperty() totalOwed!: number;
}
