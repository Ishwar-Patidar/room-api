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
  CreateElectricityBillDto,
  ElectricityBillQueryDto,
  ElectricityBillResponseDto,
  MarkElectricityPaidDto,
  PaginatedElectricityBillsDto,
} from './dto/electricity-bill.dto';
import { ElectricityBillsService } from './electricity-bills.service';

// ══════════════════════════════════════════════════════════════════════════════
//  OWNER CONTROLLER
// ══════════════════════════════════════════════════════════════════════════════

@ApiTags('Owner — Electricity Bills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
@Controller('owner/electricity-bills')
export class ElectricityBillsOwnerController {
  constructor(private readonly electricityBillsService: ElectricityBillsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a monthly electricity bill (OWNER only)',
    description:
      'Automatically computes unitsConsumed = currentUnit - previousUnit and amount = unitsConsumed × ratePerUnit. currentUnit must be > previousUnit.',
  })
  @ApiCreatedResponse({ type: ElectricityBillResponseDto })
  @ApiConflictResponse({ description: 'Bill already exists for this room and month' })
  @ApiBadRequestResponse({ description: 'Room is vacant / currentUnit <= previousUnit' })
  @ApiForbiddenResponse({ description: 'You do not own this room' })
  async createBill(
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: CreateElectricityBillDto,
  ): Promise<ElectricityBillResponseDto> {
    return this.electricityBillsService.createBill(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all electricity bills across owned buildings (paginated)',
    description: 'Supports ?status=PENDING|PAID and ?month=YYYY-MM filters.',
  })
  @ApiOkResponse({ type: PaginatedElectricityBillsDto })
  async getOwnerBills(
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: ElectricityBillQueryDto,
  ): Promise<PaginatedElectricityBillsDto> {
    return this.electricityBillsService.getOwnerBills(user.id, query);
  }

  @Get('room/:roomId')
  @ApiOperation({ summary: 'Get electricity bill history for a specific room' })
  @ApiParam({ name: 'roomId', type: String })
  @ApiOkResponse({ type: PaginatedElectricityBillsDto })
  @ApiNotFoundResponse({ description: 'Room not found' })
  @ApiForbiddenResponse({ description: 'You do not own this room' })
  async getRoomBills(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: ElectricityBillQueryDto,
  ): Promise<PaginatedElectricityBillsDto> {
    return this.electricityBillsService.getRoomBills(roomId, user.id, query);
  }

  @Get(':billId')
  @ApiOperation({ summary: 'Get a single electricity bill' })
  @ApiParam({ name: 'billId', type: String })
  @ApiOkResponse({ type: ElectricityBillResponseDto })
  @ApiNotFoundResponse({ description: 'Bill not found' })
  @ApiForbiddenResponse({ description: 'You do not own this bill' })
  async getBillById(
    @Param('billId', ParseUUIDPipe) billId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<ElectricityBillResponseDto> {
    return this.electricityBillsService.getBillById(billId, user.id);
  }

  @Post(':billId/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark electricity bill as paid' })
  @ApiParam({ name: 'billId', type: String })
  @ApiOkResponse({ type: ElectricityBillResponseDto })
  @ApiBadRequestResponse({ description: 'Already paid' })
  @ApiNotFoundResponse({ description: 'Bill not found' })
  @ApiForbiddenResponse({ description: 'You do not own this bill' })
  async markPaid(
    @Param('billId', ParseUUIDPipe) billId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: MarkElectricityPaidDto,
  ): Promise<ElectricityBillResponseDto> {
    return this.electricityBillsService.markPaid(billId, user.id, dto);
  }

  @Post(':billId/mark-unpaid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revert electricity bill to PENDING' })
  @ApiParam({ name: 'billId', type: String })
  @ApiOkResponse({ type: ElectricityBillResponseDto })
  @ApiBadRequestResponse({ description: 'Already pending' })
  @ApiNotFoundResponse({ description: 'Bill not found' })
  @ApiForbiddenResponse({ description: 'You do not own this bill' })
  async markUnpaid(
    @Param('billId', ParseUUIDPipe) billId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<ElectricityBillResponseDto> {
    return this.electricityBillsService.markUnpaid(billId, user.id);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TENANT CONTROLLER  (read-only)
// ══════════════════════════════════════════════════════════════════════════════

@ApiTags('Tenant — Electricity Bills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
@Controller('tenant/electricity-bills')
export class ElectricityBillsTenantController {
  constructor(private readonly electricityBillsService: ElectricityBillsService) {}

  @Get()
  @ApiOperation({
    summary: 'View my electricity bills (TENANT only)',
    description:
      'Returns bills for the room this tenant is assigned to. Empty list if no room assigned.',
  })
  @ApiOkResponse({ type: PaginatedElectricityBillsDto })
  async getMyBills(
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: ElectricityBillQueryDto,
  ): Promise<PaginatedElectricityBillsDto> {
    return this.electricityBillsService.getMyBills(user.id, query);
  }
}
