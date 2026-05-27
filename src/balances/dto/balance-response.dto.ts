import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

// ─── Internal calculation types (not exposed to HTTP) ─────────────────────────

/**
 * A net balance map: key = userId, value = net amount.
 * Positive  → this user is owed money (creditor).
 * Negative  → this user owes money (debtor).
 */
export type NetBalanceMap = Map<string, number>;

/** Minimal user shape used throughout balance responses. */
export interface BalanceUser {
  id: string;
  name: string;
  mobile: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class BalanceUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() mobile!: string;
}

/** A single directed debt: `from` owes `to` the given amount. */
export class DebtDto {
  @ApiProperty({ type: BalanceUserDto })
  from!: BalanceUserDto;

  @ApiProperty({ type: BalanceUserDto })
  to!: BalanceUserDto;

  @ApiProperty({ example: 500.0 })
  amount!: Prisma.Decimal | string | number;

  @ApiProperty({ example: 'Rahul owes Amit ₹500.00' })
  summary!: string;
}

/** Full balance breakdown for every member in a group. */
export class MemberBalanceDto {
  @ApiProperty({ type: BalanceUserDto })
  user!: BalanceUserDto;

  @ApiProperty({
    example: 1200.0,
    description: 'Total amount this user is owed by others (positive = creditor)',
  })
  totalReceivable!: number;

  @ApiProperty({
    example: 300.0,
    description: 'Total amount this user owes others (positive = debtor)',
  })
  totalOwed!: number;

  @ApiProperty({
    example: 900.0,
    description: 'Net: positive = overall creditor, negative = overall debtor',
  })
  netBalance!: number;
}

/** Group-level balance response. */
export class GroupBalanceResponseDto {
  @ApiProperty() groupId!: string;
  @ApiProperty() groupName!: string;

  @ApiProperty({
    type: [MemberBalanceDto],
    description: 'Per-member balance breakdown',
  })
  memberBalances!: MemberBalanceDto[];

  @ApiProperty({
    type: [DebtDto],
    description: 'Simplified list of who owes whom (minimised transactions)',
  })
  simplifiedDebts!: DebtDto[];
}

/** Flat debt list — lightweight response for "who owes whom" queries. */
export class SimplifiedDebtResponseDto {
  @ApiProperty() groupId!: string;

  @ApiProperty({ type: [DebtDto] })
  debts!: DebtDto[];
}

/** Balance summary for a single user across one group. */
export class UserGroupBalanceSummaryDto {
  @ApiProperty() groupId!: string;
  @ApiProperty() groupName!: string;

  @ApiProperty({ example: 500.0, description: 'Total the user is owed in this group' })
  totalReceivable!: number;

  @ApiProperty({ example: 200.0, description: 'Total the user owes in this group' })
  totalOwed!: number;

  @ApiProperty({ example: 300.0, description: 'Net balance (positive = owed to user)' })
  netBalance!: number;
}

/** Aggregated balance summary across all groups for the current user. */
export class UserBalanceSummaryDto {
  @ApiProperty({ example: 1500.0 })
  totalReceivable!: number;

  @ApiProperty({ example: 800.0 })
  totalOwed!: number;

  @ApiProperty({ example: 700.0 })
  overallNet!: number;

  @ApiProperty({ type: [UserGroupBalanceSummaryDto] })
  byGroup!: UserGroupBalanceSummaryDto[];
}
