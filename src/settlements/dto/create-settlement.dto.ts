import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  NotEquals,
} from 'class-validator';

export class CreateSettlementDto {
  @ApiProperty({ example: 'uuid-of-group' })
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({
    example: 'uuid-of-payer',
    description: 'User who is paying (clearing their debt)',
  })
  @IsUUID()
  @IsNotEmpty()
  payerId: string;

  @ApiProperty({
    example: 'uuid-of-payee',
    description: 'User who is receiving the payment',
  })
  @IsUUID()
  @IsNotEmpty()
  @NotEquals(undefined) // will be cross-validated in service
  payeeId: string;

  @ApiProperty({ example: 500.0, description: 'Amount being settled in INR' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Settlement amount must be greater than 0' })
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ example: 'Paying back for last month groceries' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
