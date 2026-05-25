import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'mobile must be a valid 10-digit Indian mobile number',
  })
  mobile: string;

  @ApiProperty({ example: 'StrongPass@123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  password: string;

  @ApiProperty({ enum: UserRole, example: UserRole.TENANT })
  @IsEnum(UserRole, { message: 'role must be TENANT or OWNER' })
  role: UserRole;
}
