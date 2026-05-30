import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  CreateRentalRoomDto,
  OccupyRoomDto,
  RentalRoomResponseDto,
  RentalRoomSummaryDto,
  UpdateRentalRoomDto,
} from './dto/rental-room.dto';
import { RentalRoomsService } from './rental-rooms.service';

@ApiTags('Owner — Rental Rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
@Controller('owner/rooms')
export class RentalRoomsController {
  constructor(private readonly rentalRoomsService: RentalRoomsService) {}

  // ─── Create Room ───────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Add a rental room to a building (OWNER only)' })
  @ApiCreatedResponse({ type: RentalRoomResponseDto })
  @ApiConflictResponse({ description: 'Room number already exists in building' })
  @ApiForbiddenResponse({ description: 'You do not own this building' })
  async createRoom(
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: CreateRentalRoomDto,
  ): Promise<RentalRoomResponseDto> {
    return this.rentalRoomsService.createRoom(user.id, dto);
  }

  // ─── Get Rooms in Building ─────────────────────────────────────────────────

  @Get('building/:buildingId')
  @ApiOperation({ summary: 'Get all rooms for a specific building' })
  @ApiParam({ name: 'buildingId', type: String })
  @ApiOkResponse({ type: [RentalRoomSummaryDto] })
  @ApiNotFoundResponse({ description: 'Building not found' })
  @ApiForbiddenResponse({ description: 'You do not own this building' })
  async getBuildingRooms(
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<RentalRoomSummaryDto[]> {
    return this.rentalRoomsService.getBuildingRooms(buildingId, user.id);
  }

  // ─── Get Single Room ───────────────────────────────────────────────────────

  @Get(':roomId')
  @ApiOperation({ summary: 'Get full details of a rental room' })
  @ApiParam({ name: 'roomId', type: String })
  @ApiOkResponse({ type: RentalRoomResponseDto })
  @ApiNotFoundResponse({ description: 'Room not found' })
  @ApiForbiddenResponse({ description: 'You do not own this building' })
  async getRoomById(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<RentalRoomResponseDto> {
    return this.rentalRoomsService.getRoomById(roomId, user.id);
  }

  // ─── Update Room ───────────────────────────────────────────────────────────

  @Patch(':roomId')
  @ApiOperation({ summary: 'Update rental room details (number, floor, rent)' })
  @ApiParam({ name: 'roomId', type: String })
  @ApiOkResponse({ type: RentalRoomResponseDto })
  @ApiConflictResponse({ description: 'Room number already in use in this building' })
  @ApiNotFoundResponse({ description: 'Room not found' })
  @ApiForbiddenResponse({ description: 'You do not own this building' })
  async updateRoom(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: UpdateRentalRoomDto,
  ): Promise<RentalRoomResponseDto> {
    return this.rentalRoomsService.updateRoom(roomId, user.id, dto);
  }

  // ─── Occupy Room ───────────────────────────────────────────────────────────

  @Post(':roomId/occupy')
  @ApiOperation({
    summary: 'Mark a room as occupied by a tenant',
    description: [
      'Looks up tenant by mobile number.',
      'If an account exists, it is linked automatically.',
      'If no account exists, the room is still marked OCCUPIED with null tenantId — the link resolves when the tenant registers.',
    ].join(' '),
  })
  @ApiParam({ name: 'roomId', type: String })
  @ApiOkResponse({ type: RentalRoomResponseDto })
  @ApiBadRequestResponse({
    description: 'Room already occupied / tenant already in another room',
  })
  @ApiNotFoundResponse({ description: 'Room not found' })
  @ApiForbiddenResponse({ description: 'You do not own this building' })
  async occupyRoom(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: OccupyRoomDto,
  ): Promise<RentalRoomResponseDto> {
    return this.rentalRoomsService.occupyRoom(roomId, user.id, dto);
  }

  // ─── Vacate Room ───────────────────────────────────────────────────────────

  @Post(':roomId/vacate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Vacate a room — remove tenant link, keep billing history',
    description:
      'Sets status to VACANT and clears tenantId and tenantSince. Rent and electricity bills are preserved as permanent records.',
  })
  @ApiParam({ name: 'roomId', type: String })
  @ApiOkResponse({ type: RentalRoomResponseDto })
  @ApiBadRequestResponse({ description: 'Room is already vacant' })
  @ApiNotFoundResponse({ description: 'Room not found' })
  @ApiForbiddenResponse({ description: 'You do not own this building' })
  async vacateRoom(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<RentalRoomResponseDto> {
    return this.rentalRoomsService.vacateRoom(roomId, user.id);
  }
}
