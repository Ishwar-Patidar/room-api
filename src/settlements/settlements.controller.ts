import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { SettlementQueryDto } from './dto/settlement-query.dto';
import {
  PaginatedSettlementsDto,
  SettlementResponseDto,
} from './dto/settlement-response.dto';
import { SettlementsService } from './settlements.service';

@ApiTags('Settlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  // ─── Create Settlement ──────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Record a manual settlement payment',
    description: [
      'Permanently records that payer paid payee a given amount.',
      'Settlements cannot be edited or deleted.',
      'The amount is validated against the current live balance — it cannot exceed what payer actually owes payee.',
    ].join(' '),
  })
  @ApiCreatedResponse({ type: SettlementResponseDto })
  @ApiBadRequestResponse({
    description:
      'Payer equals payee / not a group member / amount exceeds current debt',
  })
  @ApiForbiddenResponse({ description: 'Requester not an active group member' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  async createSettlement(
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: CreateSettlementDto,
  ): Promise<SettlementResponseDto> {
    return this.settlementsService.createSettlement(user.id, dto);
  }

  // ─── Get Group Settlements ───────────────────────────────────────────────────

  @Get('group/:groupId')
  @ApiOperation({
    summary: 'Get all settlements for a group (paginated, newest first)',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkResponse({ type: PaginatedSettlementsDto })
  @ApiForbiddenResponse({ description: 'Not an active member of this group' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  async getGroupSettlements(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: SettlementQueryDto,
  ): Promise<PaginatedSettlementsDto> {
    return this.settlementsService.getGroupSettlements(groupId, user.id, query);
  }

  // ─── Get Single Settlement ───────────────────────────────────────────────────

  @Get(':settlementId')
  @ApiOperation({ summary: 'Get details of a single settlement' })
  @ApiParam({ name: 'settlementId', type: String })
  @ApiOkResponse({ type: SettlementResponseDto })
  @ApiNotFoundResponse({ description: 'Settlement not found' })
  @ApiForbiddenResponse({ description: 'Not an active member of this group' })
  async getSettlementById(
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<SettlementResponseDto> {
    return this.settlementsService.getSettlementById(settlementId, user.id);
  }
}
