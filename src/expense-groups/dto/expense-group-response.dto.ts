import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GroupStatus, UserRole } from '@prisma/client';

export class GroupMemberUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  mobile: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;
}

export class GroupMemberDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  joinedAt: Date;

  @ApiPropertyOptional()
  leftAt: Date | null;

  @ApiProperty({ type: GroupMemberUserDto })
  user: GroupMemberUserDto;
}

export class GroupCreatedByDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  mobile: string;
}

export class ExpenseGroupResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: GroupStatus })
  status: GroupStatus;

  @ApiProperty({ type: GroupCreatedByDto })
  createdBy: GroupCreatedByDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [GroupMemberDto] })
  members: GroupMemberDto[];

  @ApiProperty({ description: 'Total active members in the group' })
  memberCount: number;
}

export class ExpenseGroupSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: GroupStatus })
  status: GroupStatus;

  @ApiProperty({ type: GroupCreatedByDto })
  createdBy: GroupCreatedByDto;

  @ApiProperty()
  memberCount: number;

  @ApiProperty()
  createdAt: Date;
}
