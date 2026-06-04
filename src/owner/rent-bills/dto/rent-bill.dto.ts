import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

// ─── Create ───────────────────────────────────────────────────────────────────

export class CreateRentBillDto {
  @ApiProperty({ example: 'uuid-of-room' })
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @ApiProperty({
    example: '2025-06-01',
    description: 'First day of the billing month (YYYY-MM-DD)',
  })
  @IsDateString()
  billingMonth!: string;

  @ApiProperty({ example: 8000.0, description: 'Rent amount in INR' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  amount!: number;

  @ApiProperty({ example: '2025-06-10', description: 'Due date for this bill' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ example: 'June rent' })
  @IsString()
  @IsOptional()
  note?: string;
}

// ─── Mark Paid ────────────────────────────────────────────────────────────────

export class MarkRentPaidDto {
  @ApiProperty({
    example: '2025-06-08',
    description: 'Date payment was received (ISO 8601)',
  })
  @IsDateString()
  paidAt!: string;

  @ApiPropertyOptional({ example: 'Received via UPI' })
  @IsString()
  @IsOptional()
  note?: string;
}

// ─── Query / Filter ───────────────────────────────────────────────────────────

export class RentBillQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: BillStatus, description: 'Filter by payment status' })
  @IsOptional()
  @IsString()
  status?: BillStatus;

  @ApiPropertyOptional({
    example: '2025-06',
    description: 'Filter by billing month (YYYY-MM)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;
}

// ─── Response ─────────────────────────────────────────────────────────────────

export class RentBillRoomDto {
  @ApiProperty() id!: string;
  @ApiProperty() roomNumber!: string;
  @ApiPropertyOptional() floorNumber!: number | null;
  @ApiProperty() buildingName!: string;
}

export class RentBillTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() mobile!: string;
}

export class RentBillResponseDto {
  @ApiProperty() id!: string;

  @ApiProperty({ type: RentBillRoomDto })
  room!: RentBillRoomDto;

  @ApiPropertyOptional({ type: RentBillTenantDto, description: 'Null if tenant not linked yet' })
  tenant!: RentBillTenantDto | null;

  @ApiProperty() amount!: string;
  @ApiProperty({ description: 'First day of the billing month' }) billingMonth!: Date;
  @ApiProperty() dueDate!: Date;
  @ApiProperty({ enum: BillStatus }) status!: BillStatus;
  @ApiPropertyOptional() paidAt!: Date | null;
  @ApiPropertyOptional() note!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  @ApiProperty({ description: 'true if bill is past due and still unpaid' })
  isOverdue!: boolean;
}

export class PaginatedRentBillsDto {
  @ApiProperty({ type: [RentBillResponseDto] }) data!: RentBillResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}
