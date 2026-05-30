import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SettlementUserDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() mobile: string;
}

export class SettlementResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() groupId: string;

  @ApiProperty({ type: SettlementUserDto })
  payer: SettlementUserDto;

  @ApiProperty({ type: SettlementUserDto })
  payee: SettlementUserDto;

  @ApiProperty({ example: '500.00' })
  amount: string;

  @ApiPropertyOptional()
  note: string | null;

  @ApiProperty()
  settledAt: Date;

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedSettlementsDto {
  @ApiProperty({ type: [SettlementResponseDto] })
  data: SettlementResponseDto[];

  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}
