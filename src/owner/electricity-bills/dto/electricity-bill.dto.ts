import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
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

export class CreateElectricityBillDto {
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

  @ApiProperty({ example: 1240.5, description: 'Meter reading at start of month' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  previousUnit!: number;

  @ApiProperty({ example: 1380.0, description: 'Meter reading at end of month' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  currentUnit!: number;

  @ApiProperty({ example: 6.5, description: 'Rate per unit in INR (e.g. ₹6.50/unit)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Type(() => Number)
  ratePerUnit!: number;

  @ApiProperty({ example: '2025-06-15', description: 'Due date for payment' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ example: 'June electricity' })
  @IsString()
  @IsOptional()
  note?: string;
}

// ─── Mark Paid ────────────────────────────────────────────────────────────────

export class MarkElectricityPaidDto {
  @ApiProperty({ example: '2025-06-10', description: 'Date payment was received' })
  @IsDateString()
  paidAt!: string;

  @ApiPropertyOptional({ example: 'Paid via cash' })
  @IsString()
  @IsOptional()
  note?: string;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export class ElectricityBillQueryDto {
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

  @ApiPropertyOptional({ enum: BillStatus })
  @IsOptional()
  @IsEnum(BillStatus, { message: 'status must be PENDING or PAID' })
  status?: BillStatus;

  @ApiPropertyOptional({ example: '2025-06', description: 'Filter by billing month YYYY-MM' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;
}

// ─── Response ─────────────────────────────────────────────────────────────────

export class ElectricityBillRoomDto {
  @ApiProperty() id!: string;
  @ApiProperty() roomNumber!: string;
  @ApiPropertyOptional() floorNumber!: number | null;
  @ApiProperty() buildingName!: string;
}

export class ElectricityBillTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() mobile!: string;
}

export class ElectricityBillResponseDto {
  @ApiProperty() id!: string;

  @ApiProperty({ type: ElectricityBillRoomDto })
  room!: ElectricityBillRoomDto;

  @ApiPropertyOptional({ type: ElectricityBillTenantDto })
  tenant!: ElectricityBillTenantDto | null;

  @ApiProperty({ description: 'First day of billing month' }) billingMonth!: Date;
  @ApiProperty({ example: '1240.50', description: 'Meter reading at start of month' }) previousUnit!: string;
  @ApiProperty({ example: '1380.00', description: 'Meter reading at end of month' }) currentUnit!: string;
  @ApiProperty({ example: '139.50', description: 'currentUnit - previousUnit' }) unitsConsumed!: string;
  @ApiProperty({ example: '6.50', description: 'Rate per unit in INR' }) ratePerUnit!: string;
  @ApiProperty({ example: '906.75', description: 'unitsConsumed × ratePerUnit' }) amount!: string;
  @ApiProperty() dueDate!: Date;
  @ApiProperty({ enum: BillStatus }) status!: BillStatus;
  @ApiPropertyOptional() paidAt!: Date | null;
  @ApiPropertyOptional() note!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ description: 'true if PENDING and past dueDate' }) isOverdue!: boolean;
}

export class PaginatedElectricityBillsDto {
  @ApiProperty({ type: [ElectricityBillResponseDto] }) data!: ElectricityBillResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}
