import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'mobile must be a valid 10-digit Indian mobile number',
  })
  mobile: string;

  @ApiProperty({ example: 'StrongPass@123' })
  @IsString()
  @MinLength(8)
  password: string;
}
