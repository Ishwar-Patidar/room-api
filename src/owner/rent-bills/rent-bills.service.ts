import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BuildingsService } from '../buildings/buildings.service';
import {
  CreateRentBillDto,
  MarkRentPaidDto,
  PaginatedRentBillsDto,
  RentBillQueryDto,
  RentBillResponseDto,
} from './dto/rent-bill.dto';

// ─── Prisma select ────────────────────────────────────────────────────────────

const RENT_BILL_SELECT = {
  id: true,
  amount: true,
  billingMonth: true,
  dueDate: true,
  status: true,
  paidAt: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  room: {
    select: {
      id: true,
      roomNumber: true,
      floorNumber: true,
      tenant: { select: { id: true, name: true, mobile: true } },
      building: { select: { id: true, name: true, ownerId: true } },
    },
  },
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class RentBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buildingsService: BuildingsService,
  ) {}

  // ─── Create Bill (Owner) ───────────────────────────────────────────────────

  async createBill(
    ownerId: string,
    dto: CreateRentBillDto,
  ): Promise<RentBillResponseDto> {
    const room = await this.getRoomWithOwnerCheck(dto.roomId, ownerId);

    if (room.status === 'VACANT') {
      throw new BadRequestException(
        'Cannot create a rent bill for a vacant room',
      );
    }

    const billingMonthDate = this.toMonthStart(dto.billingMonth);

    const existing = await this.prisma.rentBill.findUnique({
      where: {
        roomId_billingMonth: {
          roomId: dto.roomId,
          billingMonth: billingMonthDate,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `A rent bill already exists for this room for ${this.formatMonth(billingMonthDate)}`,
      );
    }

    const bill = await this.prisma.rentBill.create({
      data: {
        roomId: dto.roomId,
        billingMonth: billingMonthDate,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        status: BillStatus.PENDING,
        note: dto.note ?? null,
      },
      select: RENT_BILL_SELECT,
    });

    return this.format(bill);
  }

  // ─── Get Room Bills — Owner (room-wise history) ────────────────────────────

  async getRoomBills(
    roomId: string,
    ownerId: string,
    query: RentBillQueryDto,
  ): Promise<PaginatedRentBillsDto> {
    await this.getRoomWithOwnerCheck(roomId, ownerId);
    return this.paginateBills({ roomId }, query);
  }

  // ─── Get All Bills Across Owner's Buildings ────────────────────────────────

  async getOwnerBills(
    ownerId: string,
    query: RentBillQueryDto,
  ): Promise<PaginatedRentBillsDto> {
    const roomIds = await this.getOwnerRoomIds(ownerId);
    if (roomIds.length === 0) {
      return { data: [], total: 0, page: query.page ?? 1, limit: query.limit ?? 20, totalPages: 0 };
    }
    return this.paginateBills({ roomId: { in: roomIds } }, query);
  }

  // ─── Get Single Bill (Owner) ───────────────────────────────────────────────

  async getBillById(
    billId: string,
    ownerId: string,
  ): Promise<RentBillResponseDto> {
    const bill = await this.findBillOrThrow(billId);
    this.assertOwnerOfBill(bill, ownerId);
    return this.format(bill);
  }

  // ─── Mark Paid (Owner) ────────────────────────────────────────────────────

  async markPaid(
    billId: string,
    ownerId: string,
    dto: MarkRentPaidDto,
  ): Promise<RentBillResponseDto> {
    const bill = await this.findBillOrThrow(billId);
    this.assertOwnerOfBill(bill, ownerId);

    if (bill.status === BillStatus.PAID) {
      throw new BadRequestException('This bill is already marked as paid');
    }

    const updated = await this.prisma.rentBill.update({
      where: { id: billId },
      data: {
        status: BillStatus.PAID,
        paidAt: new Date(dto.paidAt),
        ...(dto.note !== undefined && { note: dto.note }),
      },
      select: RENT_BILL_SELECT,
    });

    return this.format(updated);
  }

  // ─── Mark Unpaid (Owner) ──────────────────────────────────────────────────

  async markUnpaid(
    billId: string,
    ownerId: string,
  ): Promise<RentBillResponseDto> {
    const bill = await this.findBillOrThrow(billId);
    this.assertOwnerOfBill(bill, ownerId);

    if (bill.status === BillStatus.PENDING) {
      throw new BadRequestException('This bill is already in PENDING status');
    }

    const updated = await this.prisma.rentBill.update({
      where: { id: billId },
      data: { status: BillStatus.PENDING, paidAt: null },
      select: RENT_BILL_SELECT,
    });

    return this.format(updated);
  }

  // ─── Tenant: View My Rent Bills ────────────────────────────────────────────

  async getMyRentBills(
    tenantId: string,
    query: RentBillQueryDto,
  ): Promise<PaginatedRentBillsDto> {
    const rentalRoom = await this.prisma.rentalRoom.findFirst({
      where: { tenantId },
      select: { id: true },
    });

    if (!rentalRoom) {
      return { data: [], total: 0, page: query.page ?? 1, limit: query.limit ?? 20, totalPages: 0 };
    }

    return this.paginateBills({ roomId: rentalRoom.id }, query);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async paginateBills(
    baseWhere: object,
    query: RentBillQueryDto,
  ): Promise<PaginatedRentBillsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { ...baseWhere };
    if (query.status) where.status = query.status;
    if (query.month) {
      where.billingMonth = this.toMonthStart(query.month + '-01');
    }

    const [bills, total] = await this.prisma.$transaction([
      this.prisma.rentBill.findMany({
        where,
        select: RENT_BILL_SELECT,
        orderBy: { billingMonth: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.rentBill.count({ where }),
    ]);

    return {
      data: bills.map((b) => this.format(b)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async getRoomWithOwnerCheck(roomId: string, ownerId: string) {
    const room = await this.prisma.rentalRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        status: true,
        buildingId: true,
        building: { select: { ownerId: true } },
      },
    });

    if (!room) throw new NotFoundException('Rental room not found');
    if (room.building.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this room');
    }
    return room;
  }

  private async findBillOrThrow(billId: string) {
    const bill = await this.prisma.rentBill.findUnique({
      where: { id: billId },
      select: RENT_BILL_SELECT,
    });
    if (!bill) throw new NotFoundException('Rent bill not found');
    return bill;
  }

  private assertOwnerOfBill(bill: any, ownerId: string): void {
    if (bill.room.building.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this bill');
    }
  }

  private async getOwnerRoomIds(ownerId: string): Promise<string[]> {
    const buildings = await this.prisma.building.findMany({
      where: { ownerId },
      select: { rooms: { select: { id: true } } },
    });
    return buildings.flatMap((b) => b.rooms.map((r) => r.id));
  }

  private format(bill: any): RentBillResponseDto {
    const now = new Date();
    const isOverdue =
      bill.status === BillStatus.PENDING && new Date(bill.dueDate) < now;

    return {
      id: bill.id,
      room: {
        id: bill.room.id,
        roomNumber: bill.room.roomNumber,
        floorNumber: bill.room.floorNumber,
        buildingName: bill.room.building.name,
      },
      tenant: bill.room.tenant ?? null,
      amount: bill.amount,
      billingMonth: bill.billingMonth,
      dueDate: bill.dueDate,
      status: bill.status,
      paidAt: bill.paidAt,
      note: bill.note,
      createdAt: bill.createdAt,
      updatedAt: bill.updatedAt,
      isOverdue,
    };
  }

  private toMonthStart(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  private formatMonth(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
