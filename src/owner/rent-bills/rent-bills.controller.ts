import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateRentBillDto,
  MarkRentPaidDto,
  PaginatedRentBillsDto,
  RentBillQueryDto,
  RentBillResponseDto,
} from './dto/rent-bill.dto';
import { RentBillsService } from './rent-bills.service';

// ══════════════════════════════════════════════════════════════════════════════
//  OWNER CONTROLLER
// ══════════════════════════════════════════════════════════════════════════════

@ApiTags('Owner — Rent Bills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
@Controller('owner/rent-bills')
export class RentBillsOwnerController {
  constructor(private readonly rentBillsService: RentBillsService) {}

  // ─── Create Bill ─────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Create a monthly rent bill for an occupied room (OWNER only)',
    description:
      'One bill per room per month is enforced. Room must be OCCUPIED.',
  })
  @ApiCreatedResponse({ type: RentBillResponseDto })
  @ApiConflictResponse({ description: 'Bill already exists for this room and month' })
  @ApiBadRequestResponse({ description: 'Room is vacant' })
  @ApiForbiddenResponse({ description: 'You do not own this room' })
  async createBill(
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: CreateRentBillDto,
  ): Promise<RentBillResponseDto> {
    return this.rentBillsService.createBill(user.id, dto);
  }

  // ─── All Bills Across My Buildings ───────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get all rent bills across all owned buildings (paginated)',
    description: 'Supports ?status=PENDING|PAID and ?month=YYYY-MM filters.',
  })
  @ApiOkResponse({ type: PaginatedRentBillsDto })
  async getOwnerBills(
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: RentBillQueryDto,
  ): Promise<PaginatedRentBillsDto> {
    return this.rentBillsService.getOwnerBills(user.id, query);
  }

  // ─── Room-Wise History ────────────────────────────────────────────────────

  @Get('room/:roomId')
  @ApiOperation({ summary: 'Get rent bill history for a specific room' })
  @ApiParam({ name: 'roomId', type: String })
  @ApiOkResponse({ type: PaginatedRentBillsDto })
  @ApiNotFoundResponse({ description: 'Room not found' })
  @ApiForbiddenResponse({ description: 'You do not own this room' })
  async getRoomBills(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: RentBillQueryDto,
  ): Promise<PaginatedRentBillsDto> {
    return this.rentBillsService.getRoomBills(roomId, user.id, query);
  }

  // ─── Get Single Bill ──────────────────────────────────────────────────────

  @Get(':billId')
  @ApiOperation({ summary: 'Get details of a single rent bill' })
  @ApiParam({ name: 'billId', type: String })
  @ApiOkResponse({ type: RentBillResponseDto })
  @ApiNotFoundResponse({ description: 'Bill not found' })
  @ApiForbiddenResponse({ description: 'You do not own this bill' })
  async getBillById(
    @Param('billId', ParseUUIDPipe) billId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<RentBillResponseDto> {
    return this.rentBillsService.getBillById(billId, user.id);
  }

  // ─── Mark Paid ────────────────────────────────────────────────────────────

  @Post(':billId/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a rent bill as paid',
    description: 'Records paidAt date. No payment gateway — manual tracking only.',
  })
  @ApiParam({ name: 'billId', type: String })
  @ApiOkResponse({ type: RentBillResponseDto })
  @ApiBadRequestResponse({ description: 'Bill is already paid' })
  @ApiNotFoundResponse({ description: 'Bill not found' })
  @ApiForbiddenResponse({ description: 'You do not own this bill' })
  async markPaid(
    @Param('billId', ParseUUIDPipe) billId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: MarkRentPaidDto,
  ): Promise<RentBillResponseDto> {
    return this.rentBillsService.markPaid(billId, user.id, dto);
  }

  // ─── Mark Unpaid ──────────────────────────────────────────────────────────

  @Post(':billId/mark-unpaid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revert a rent bill back to PENDING (undo mistaken payment)',
    description: 'Clears paidAt and sets status back to PENDING.',
  })
  @ApiParam({ name: 'billId', type: String })
  @ApiOkResponse({ type: RentBillResponseDto })
  @ApiBadRequestResponse({ description: 'Bill is already pending' })
  @ApiNotFoundResponse({ description: 'Bill not found' })
  @ApiForbiddenResponse({ description: 'You do not own this bill' })
  async markUnpaid(
    @Param('billId', ParseUUIDPipe) billId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<RentBillResponseDto> {
    return this.rentBillsService.markUnpaid(billId, user.id);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TENANT CONTROLLER  (read-only)
// ══════════════════════════════════════════════════════════════════════════════

@ApiTags('Tenant — Rent Bills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
@Controller('tenant/rent-bills')
export class RentBillsTenantController {
  constructor(private readonly rentBillsService: RentBillsService) {}

  @Get()
  @ApiOperation({
    summary: 'View my rent bills (TENANT only)',
    description:
      'Returns bills for the room this tenant is currently assigned to. Returns empty list if not yet assigned.',
  })
  @ApiOkResponse({ type: PaginatedRentBillsDto })
  async getMyRentBills(
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: RentBillQueryDto,
  ): Promise<PaginatedRentBillsDto> {
    return this.rentBillsService.getMyRentBills(user.id, query);
  }
}
