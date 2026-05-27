import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SplitType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CustomSplitItemDto } from './custom-split-item.dto';

export class CreateExpenseDto {
  @ApiProperty({ example: 'uuid-of-group' })
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({ example: 'Groceries' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({ example: 1200.0, description: 'Total expense amount in INR' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Amount must be greater than 0' })
  @Type(() => Number)
  amount: number;

  @ApiProperty({ enum: SplitType, example: SplitType.EQUAL })
  @IsEnum(SplitType, { message: 'splitType must be EQUAL or CUSTOM' })
  splitType: SplitType;

  @ApiProperty({
    example: 'uuid-of-payer',
    description: 'User ID of who paid. Must be an active group member.',
  })
  @IsUUID()
  @IsNotEmpty()
  paidById: string;

  @ApiProperty({
    type: [String],
    example: ['uuid-user-1', 'uuid-user-2'],
    description:
      'For EQUAL split: list of participant user IDs. For CUSTOM split: must match customSplits user IDs exactly.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one participant is required' })
  @ArrayUnique({ message: 'Duplicate participant IDs are not allowed' })
  @IsUUID('all', { each: true })
  participantIds: string[];

  @ApiPropertyOptional({
    type: [CustomSplitItemDto],
    description: 'Required when splitType is CUSTOM. Must sum to total amount.',
  })
  @ValidateIf((o) => o.splitType === SplitType.CUSTOM)
  @IsArray()
  @ArrayMinSize(1, { message: 'customSplits must not be empty for CUSTOM split' })
  @ValidateNested({ each: true })
  @Type(() => CustomSplitItemDto)
  @IsOptional()
  customSplits?: CustomSplitItemDto[];

  @ApiPropertyOptional({ example: 'Weekly grocery run' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
