import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsPositive, IsUUID } from 'class-validator';

export class CustomSplitItemDto {
  @ApiProperty({ example: 'uuid-of-user' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: 250.5, description: 'Amount owed by this user' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Each split amount must be greater than 0' })
  @Type(() => Number)
  amount: number;
}
