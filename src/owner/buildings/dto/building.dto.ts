import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomStatus } from '@prisma/client';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// ─── Create ───────────────────────────────────────────────────────────────────

export class CreateBuildingDto {
  @ApiProperty({ example: 'Sunrise Apartments' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: '42, MG Road' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address!: string;

  @ApiProperty({ example: 'Indore' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional({ example: 'Madhya Pradesh' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: '452001' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit number' })
  pincode?: string;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export class UpdateBuildingDto {
  @ApiPropertyOptional({ example: 'Sunrise Residency' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: '43, MG Road' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Bhopal' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Madhya Pradesh' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: '462001' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit number' })
  pincode?: string;
}

// ─── Response ─────────────────────────────────────────────────────────────────

export class BuildingRoomSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() roomNumber!: string;
  @ApiProperty({ enum: RoomStatus }) status!: RoomStatus;
  @ApiProperty() monthlyRent!: string;
}

export class BuildingResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiProperty() city!: string;
  @ApiPropertyOptional() state!: string | null;
  @ApiPropertyOptional() pincode!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ description: 'Total rooms in this building' }) roomCount!: number;
  @ApiProperty({ description: 'Rooms that are currently occupied' }) occupiedCount!: number;
  @ApiProperty({ description: 'Rooms that are currently vacant' }) vacantCount!: number;
}

export class BuildingSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiProperty() city!: string;
  @ApiPropertyOptional() state!: string | null;
  @ApiPropertyOptional() pincode!: string | null;
  @ApiProperty() roomCount!: number;
  @ApiProperty() occupiedCount!: number;
  @ApiProperty() vacantCount!: number;
  @ApiProperty() createdAt!: Date;
}
