import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBuildingDto } from './dto/building.dto';
import { UpdateBuildingDto } from './dto/building.dto';
import {
  BuildingResponseDto,
  BuildingSummaryDto,
} from './dto/building.dto';

// ─── Prisma select ────────────────────────────────────────────────────────────

const BUILDING_BASE_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  state: true,
  pincode: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { rooms: true },
  },
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BuildingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create Building ───────────────────────────────────────────────────────

  async createBuilding(
    ownerId: string,
    dto: CreateBuildingDto,
  ): Promise<BuildingResponseDto> {
    const building = await this.prisma.building.create({
      data: {
        ownerId,
        name: dto.name,
        address: dto.address,
        city: dto.city,
        state: dto.state ?? null,
        pincode: dto.pincode ?? null,
      },
      select: BUILDING_BASE_SELECT,
    });

    return this.formatBuilding(building);
  }

  // ─── Get My Buildings ──────────────────────────────────────────────────────

  async getMyBuildings(ownerId: string): Promise<BuildingSummaryDto[]> {
    const buildings = await this.prisma.building.findMany({
      where: { ownerId },
      select: {
        ...BUILDING_BASE_SELECT,
        rooms: {
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return buildings.map((b) => this.formatBuildingSummary(b));
  }

  // ─── Get Building Details ──────────────────────────────────────────────────

  async getBuildingById(
    buildingId: string,
    ownerId: string,
  ): Promise<BuildingResponseDto> {
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: {
        ...BUILDING_BASE_SELECT,
        ownerId: true,
        rooms: { select: { status: true } },
      },
    });

    if (!building) throw new NotFoundException('Building not found');
    this.assertOwner(building, ownerId);

    return this.formatBuilding(building);
  }

  // ─── Update Building ───────────────────────────────────────────────────────

  async updateBuilding(
    buildingId: string,
    ownerId: string,
    dto: UpdateBuildingDto,
  ): Promise<BuildingResponseDto> {
    await this.assertBuildingOwnership(buildingId, ownerId);

    const updated = await this.prisma.building.update({
      where: { id: buildingId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.address && { address: dto.address }),
        ...(dto.city && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.pincode !== undefined && { pincode: dto.pincode }),
      },
      select: {
        ...BUILDING_BASE_SELECT,
        rooms: { select: { status: true } },
      },
    });

    return this.formatBuilding(updated);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async assertBuildingOwnership(
    buildingId: string,
    ownerId: string,
  ): Promise<void> {
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: { id: true, ownerId: true },
    });

    if (!building) throw new NotFoundException('Building not found');
    this.assertOwner(building, ownerId);
  }

  private assertOwner(building: { ownerId: string }, ownerId: string): void {
    if (building.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this building');
    }
  }

  private countRooms(rooms: { status: string }[]) {
    const occupied = rooms.filter((r) => r.status === 'OCCUPIED').length;
    return { total: rooms.length, occupied, vacant: rooms.length - occupied };
  }

  private formatBuilding(b: any): BuildingResponseDto {
    const rooms = b.rooms ?? [];
    const counts = this.countRooms(rooms);
    return {
      id: b.id,
      name: b.name,
      address: b.address,
      city: b.city,
      state: b.state,
      pincode: b.pincode,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      roomCount: counts.total,
      occupiedCount: counts.occupied,
      vacantCount: counts.vacant,
    };
  }

  private formatBuildingSummary(b: any): BuildingSummaryDto {
    const rooms = b.rooms ?? [];
    const counts = this.countRooms(rooms);
    return {
      id: b.id,
      name: b.name,
      address: b.address,
      city: b.city,
      state: b.state,
      pincode: b.pincode,
      roomCount: counts.total,
      occupiedCount: counts.occupied,
      vacantCount: counts.vacant,
      createdAt: b.createdAt,
    };
  }
}
