import { ApiPropertyOptional } from '@nestjs/swagger';
import { SplitType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
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

export class UpdateExpenseDto {
  @ApiPropertyOptional({ example: 'Electricity Bill' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ example: 1500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Amount must be greater than 0' })
  @IsOptional()
  @Type(() => Number)
  amount?: number;

  @ApiPropertyOptional({ enum: SplitType })
  @IsEnum(SplitType)
  @IsOptional()
  splitType?: SplitType;

  @ApiPropertyOptional({ example: 'uuid-of-payer' })
  @IsUUID()
  @IsOptional()
  paidById?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  @IsOptional()
  participantIds?: string[];

  @ApiPropertyOptional({ type: [CustomSplitItemDto] })
  @ValidateIf((o) => o.splitType === SplitType.CUSTOM || o.customSplits !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustomSplitItemDto)
  @IsOptional()
  customSplits?: CustomSplitItemDto[];

  @ApiPropertyOptional({ example: 'Updated note' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
