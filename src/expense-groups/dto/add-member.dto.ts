import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Mobile number of the user to add',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'mobile must be a valid 10-digit Indian mobile number',
  })
  mobile: string;
}
