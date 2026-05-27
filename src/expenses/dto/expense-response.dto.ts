import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SplitType } from '@prisma/client';

// ─── Nested shapes ────────────────────────────────────────────────────────────

export class ExpenseUserDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() mobile: string;
}

export class ExpenseParticipantDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: ExpenseUserDto }) user: ExpenseUserDto;
}

export class CustomSplitResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: ExpenseUserDto }) user: ExpenseUserDto;
  @ApiProperty() amount: string; // Prisma Decimal returns as string
}

// ─── Single expense ───────────────────────────────────────────────────────────

export class ExpenseResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() groupId: string;
  @ApiProperty() title: string;
  @ApiProperty() amount: string;
  @ApiProperty({ enum: SplitType }) splitType: SplitType;
  @ApiPropertyOptional() note: string | null;
  @ApiProperty() expenseDate: Date;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  @ApiProperty({ type: ExpenseUserDto })
  paidBy: ExpenseUserDto;

  @ApiProperty({ type: ExpenseUserDto })
  createdBy: ExpenseUserDto;

  @ApiProperty({ type: [ExpenseParticipantDto] })
  participants: ExpenseParticipantDto[];

  @ApiProperty({ type: [CustomSplitResponseDto] })
  customSplits: CustomSplitResponseDto[];
}

// ─── Paginated list ───────────────────────────────────────────────────────────

export class PaginatedExpensesDto {
  @ApiProperty({ type: [ExpenseResponseDto] })
  data: ExpenseResponseDto[];

  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}
