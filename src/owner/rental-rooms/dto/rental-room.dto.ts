import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomStatus } from '@prisma/client';
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
  MaxLength,
  Min,
} from 'class-validator';

// ─── Create Room ──────────────────────────────────────────────────────────────

export class CreateRentalRoomDto {
  @ApiProperty({ example: 'uuid-of-building' })
  @IsString()
  @IsNotEmpty()
  buildingId!: string;

  @ApiProperty({ example: '101' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  roomNumber!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  floorNumber?: number;

  @ApiProperty({ example: 8000.0, description: 'Monthly rent in INR' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Monthly rent must be greater than 0' })
  @Type(() => Number)
  monthlyRent!: number;
}

// ─── Update Room ──────────────────────────────────────────────────────────────

export class UpdateRentalRoomDto {
  @ApiPropertyOptional({ example: '102' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  roomNumber?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  floorNumber?: number;

  @ApiPropertyOptional({ example: 9000.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  monthlyRent?: number;
}

// ─── Occupancy ────────────────────────────────────────────────────────────────

export class OccupyRoomDto {
  @ApiProperty({
    example: '9876543210',
    description: "Tenant's registered mobile number. Room is linked if account exists; stays valid otherwise.",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'mobile must be a valid 10-digit Indian mobile number',
  })
  tenantMobile!: string;

  @ApiProperty({
    example: '2025-06-01',
    description: 'Date the tenant moved in (ISO 8601 date string)',
  })
  @IsDateString()
  tenantSince!: string;
}

// ─── Response ─────────────────────────────────────────────────────────────────

export class RoomTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() mobile!: string;
}

export class RentalRoomResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() buildingId!: string;
  @ApiProperty() roomNumber!: string;
  @ApiPropertyOptional() floorNumber!: number | null;
  @ApiProperty() monthlyRent!: string;
  @ApiProperty({ enum: RoomStatus }) status!: RoomStatus;
  @ApiPropertyOptional() tenantSince!: Date | null;
  @ApiPropertyOptional({ type: RoomTenantDto }) tenant!: RoomTenantDto | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class RentalRoomSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() roomNumber!: string;
  @ApiPropertyOptional() floorNumber!: number | null;
  @ApiProperty() monthlyRent!: string;
  @ApiProperty({ enum: RoomStatus }) status!: RoomStatus;
  @ApiPropertyOptional({ type: RoomTenantDto }) tenant!: RoomTenantDto | null;
}
