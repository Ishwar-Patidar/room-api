import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoomStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BuildingsService } from '../buildings/buildings.service';
import {
  CreateRentalRoomDto,
  OccupyRoomDto,
  RentalRoomResponseDto,
  RentalRoomSummaryDto,
  UpdateRentalRoomDto,
} from './dto/rental-room.dto';

// ─── Prisma select ────────────────────────────────────────────────────────────

const ROOM_SELECT = {
  id: true,
  buildingId: true,
  roomNumber: true,
  floorNumber: true,
  monthlyRent: true,
  status: true,
  tenantSince: true,
  createdAt: true,
  updatedAt: true,
  tenant: {
    select: { id: true, name: true, mobile: true },
  },
} as const;

const ROOM_SUMMARY_SELECT = {
  id: true,
  roomNumber: true,
  floorNumber: true,
  monthlyRent: true,
  status: true,
  tenant: {
    select: { id: true, name: true, mobile: true },
  },
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class RentalRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buildingsService: BuildingsService,
  ) {}

  // ─── Create Room ───────────────────────────────────────────────────────────

  async createRoom(
    ownerId: string,
    dto: CreateRentalRoomDto,
  ): Promise<RentalRoomResponseDto> {
    // Assert owner owns the target building
    await this.buildingsService.assertBuildingOwnership(dto.buildingId, ownerId);

    // Enforce unique room number within building
    const duplicate = await this.prisma.rentalRoom.findUnique({
      where: {
        buildingId_roomNumber: {
          buildingId: dto.buildingId,
          roomNumber: dto.roomNumber,
        },
      },
    });

    if (duplicate) {
      throw new ConflictException(
        `Room number "${dto.roomNumber}" already exists in this building`,
      );
    }

    const room = await this.prisma.rentalRoom.create({
      data: {
        buildingId: dto.buildingId,
        roomNumber: dto.roomNumber,
        floorNumber: dto.floorNumber ?? null,
        monthlyRent: dto.monthlyRent,
        status: RoomStatus.VACANT,
      },
      select: ROOM_SELECT,
    });

    return room as unknown as RentalRoomResponseDto;
  }

  // ─── Get Rooms in a Building ───────────────────────────────────────────────

  async getBuildingRooms(
    buildingId: string,
    ownerId: string,
  ): Promise<RentalRoomSummaryDto[]> {
    await this.buildingsService.assertBuildingOwnership(buildingId, ownerId);

    const rooms = await this.prisma.rentalRoom.findMany({
      where: { buildingId },
      select: ROOM_SUMMARY_SELECT,
      orderBy: [{ floorNumber: 'asc' }, { roomNumber: 'asc' }],
    });

    return rooms as unknown as RentalRoomSummaryDto[];
  }

  // ─── Get Single Room ───────────────────────────────────────────────────────

  async getRoomById(
    roomId: string,
    ownerId: string,
  ): Promise<RentalRoomResponseDto> {
    const room = await this.prisma.rentalRoom.findUnique({
      where: { id: roomId },
      select: {
        ...ROOM_SELECT,
        building: { select: { ownerId: true } },
      },
    });

    if (!room) throw new NotFoundException('Rental room not found');

    await this.buildingsService.assertBuildingOwnership(
      room.buildingId,
      ownerId,
    );

    return room as unknown as RentalRoomResponseDto;
  }

  // ─── Update Room ───────────────────────────────────────────────────────────

  async updateRoom(
    roomId: string,
    ownerId: string,
    dto: UpdateRentalRoomDto,
  ): Promise<RentalRoomResponseDto> {
    const room = await this.assertRoomOwnership(roomId, ownerId);

    // If room number changes, check for conflicts within the same building
    if (dto.roomNumber && dto.roomNumber !== room.roomNumber) {
      const conflict = await this.prisma.rentalRoom.findUnique({
        where: {
          buildingId_roomNumber: {
            buildingId: room.buildingId,
            roomNumber: dto.roomNumber,
          },
        },
      });

      if (conflict) {
        throw new ConflictException(
          `Room number "${dto.roomNumber}" already exists in this building`,
        );
      }
    }

    const updated = await this.prisma.rentalRoom.update({
      where: { id: roomId },
      data: {
        ...(dto.roomNumber && { roomNumber: dto.roomNumber }),
        ...(dto.floorNumber !== undefined && { floorNumber: dto.floorNumber }),
        ...(dto.monthlyRent !== undefined && { monthlyRent: dto.monthlyRent }),
      },
      select: ROOM_SELECT,
    });

    return updated as unknown as RentalRoomResponseDto;
  }

  // ─── Occupy Room ───────────────────────────────────────────────────────────

  async occupyRoom(
    roomId: string,
    ownerId: string,
    dto: OccupyRoomDto,
  ): Promise<RentalRoomResponseDto> {
    const room = await this.assertRoomOwnership(roomId, ownerId);

    if (room.status === RoomStatus.OCCUPIED) {
      throw new BadRequestException(
        'This room is already occupied. Vacate it first before assigning a new tenant.',
      );
    }

    // Look up tenant by mobile — soft link (null is valid if tenant hasn't registered yet)
    const tenant = await this.prisma.user.findUnique({
      where: { mobile: dto.tenantMobile },
      select: { id: true, tenantRentalRoom: { select: { id: true, roomNumber: true } } },
    });

    // If tenant account exists, ensure they aren't already in another room
    if (tenant?.tenantRentalRoom) {
      throw new BadRequestException(
        `This tenant is already assigned to room ${tenant.tenantRentalRoom.roomNumber}. A tenant can occupy only one room at a time.`,
      );
    }

    const updated = await this.prisma.rentalRoom.update({
      where: { id: roomId },
      data: {
        status: RoomStatus.OCCUPIED,
        tenantId: tenant?.id ?? null,      // null if no account yet — still records occupancy
        tenantSince: new Date(dto.tenantSince),
      },
      select: ROOM_SELECT,
    });

    return updated as unknown as RentalRoomResponseDto;
  }

  // ─── Vacate Room ───────────────────────────────────────────────────────────

  async vacateRoom(
    roomId: string,
    ownerId: string,
  ): Promise<RentalRoomResponseDto> {
    const room = await this.assertRoomOwnership(roomId, ownerId);

    if (room.status === RoomStatus.VACANT) {
      throw new BadRequestException('This room is already vacant');
    }

    // Clear occupancy — rent bills are kept as historical records
    const updated = await this.prisma.rentalRoom.update({
      where: { id: roomId },
      data: {
        status: RoomStatus.VACANT,
        tenantId: null,
        tenantSince: null,
      },
      select: ROOM_SELECT,
    });

    return updated as unknown as RentalRoomResponseDto;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Fetches room and verifies it belongs to a building owned by `ownerId`.
   * Returns the raw room record for downstream use.
   */
  private async assertRoomOwnership(roomId: string, ownerId: string) {
    const room = await this.prisma.rentalRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        buildingId: true,
        roomNumber: true,
        status: true,
        building: { select: { ownerId: true } },
      },
    });

    if (!room) throw new NotFoundException('Rental room not found');

    await this.buildingsService.assertBuildingOwnership(
      room.buildingId,
      ownerId,
    );

    return room;
  }
}
