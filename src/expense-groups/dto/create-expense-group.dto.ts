import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateExpenseGroupDto {
  @ApiProperty({ example: 'Flat 4B' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Monthly shared expenses for our flat' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;
}
