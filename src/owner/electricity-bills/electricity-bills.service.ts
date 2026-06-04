import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateElectricityBillDto,
  ElectricityBillQueryDto,
  ElectricityBillResponseDto,
  MarkElectricityPaidDto,
  PaginatedElectricityBillsDto,
} from './dto/electricity-bill.dto';

// ─── Prisma select ────────────────────────────────────────────────────────────

const BILL_SELECT = {
  id: true,
  billingMonth: true,
  previousUnit: true,
  currentUnit: true,
  unitsConsumed: true,
  ratePerUnit: true,
  amount: true,
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
export class ElectricityBillsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create Bill (Owner) ───────────────────────────────────────────────────

  async createBill(
    ownerId: string,
    dto: CreateElectricityBillDto,
  ): Promise<ElectricityBillResponseDto> {
    const room = await this.getRoomWithOwnerCheck(dto.roomId, ownerId);

    if (room.status === 'VACANT') {
      throw new BadRequestException(
        'Cannot create an electricity bill for a vacant room',
      );
    }

    // currentUnit must be greater than previousUnit
    if (dto.currentUnit <= dto.previousUnit) {
      throw new BadRequestException(
        `currentUnit (${dto.currentUnit}) must be greater than previousUnit (${dto.previousUnit})`,
      );
    }

    const billingMonthDate = this.toMonthStart(dto.billingMonth);

    // One bill per room per month
    const existing = await this.prisma.electricityBill.findUnique({
      where: {
        roomId_billingMonth: {
          roomId: dto.roomId,
          billingMonth: billingMonthDate,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `An electricity bill already exists for this room for ${this.formatMonth(billingMonthDate)}`,
      );
    }

    // Compute derived fields in the service — stored for historical accuracy
    const unitsConsumed = this.round2(dto.currentUnit - dto.previousUnit);
    const amount = this.round2(unitsConsumed * dto.ratePerUnit);

    const bill = await this.prisma.electricityBill.create({
      data: {
        roomId: dto.roomId,
        billingMonth: billingMonthDate,
        previousUnit: dto.previousUnit,
        currentUnit: dto.currentUnit,
        unitsConsumed,
        ratePerUnit: dto.ratePerUnit,
        amount,
        dueDate: new Date(dto.dueDate),
        status: BillStatus.PENDING,
        note: dto.note ?? null,
      },
      select: BILL_SELECT,
    });

    return this.format(bill);
  }

  // ─── Get Room Bills (Owner) ────────────────────────────────────────────────

  async getRoomBills(
    roomId: string,
    ownerId: string,
    query: ElectricityBillQueryDto,
  ): Promise<PaginatedElectricityBillsDto> {
    await this.getRoomWithOwnerCheck(roomId, ownerId);
    return this.paginate({ roomId }, query);
  }

  // ─── Get All Bills Across Owner's Buildings ────────────────────────────────

  async getOwnerBills(
    ownerId: string,
    query: ElectricityBillQueryDto,
  ): Promise<PaginatedElectricityBillsDto> {
    const roomIds = await this.getOwnerRoomIds(ownerId);
    if (roomIds.length === 0) {
      return { data: [], total: 0, page: query.page ?? 1, limit: query.limit ?? 20, totalPages: 0 };
    }
    return this.paginate({ roomId: { in: roomIds } }, query);
  }

  // ─── Get Single Bill (Owner) ───────────────────────────────────────────────

  async getBillById(
    billId: string,
    ownerId: string,
  ): Promise<ElectricityBillResponseDto> {
    const bill = await this.findOrThrow(billId);
    this.assertOwner(bill, ownerId);
    return this.format(bill);
  }

  // ─── Mark Paid (Owner) ────────────────────────────────────────────────────

  async markPaid(
    billId: string,
    ownerId: string,
    dto: MarkElectricityPaidDto,
  ): Promise<ElectricityBillResponseDto> {
    const bill = await this.findOrThrow(billId);
    this.assertOwner(bill, ownerId);

    if (bill.status === BillStatus.PAID) {
      throw new BadRequestException('This bill is already marked as paid');
    }

    const updated = await this.prisma.electricityBill.update({
      where: { id: billId },
      data: {
        status: BillStatus.PAID,
        paidAt: new Date(dto.paidAt),
        ...(dto.note !== undefined && { note: dto.note }),
      },
      select: BILL_SELECT,
    });

    return this.format(updated);
  }

  // ─── Mark Unpaid (Owner) ──────────────────────────────────────────────────

  async markUnpaid(
    billId: string,
    ownerId: string,
  ): Promise<ElectricityBillResponseDto> {
    const bill = await this.findOrThrow(billId);
    this.assertOwner(bill, ownerId);

    if (bill.status === BillStatus.PENDING) {
      throw new BadRequestException('This bill is already PENDING');
    }

    const updated = await this.prisma.electricityBill.update({
      where: { id: billId },
      data: { status: BillStatus.PENDING, paidAt: null },
      select: BILL_SELECT,
    });

    return this.format(updated);
  }

  // ─── Tenant: View My Electricity Bills ────────────────────────────────────

  async getMyBills(
    tenantId: string,
    query: ElectricityBillQueryDto,
  ): Promise<PaginatedElectricityBillsDto> {
    const rentalRoom = await this.prisma.rentalRoom.findFirst({
      where: { tenantId },
      select: { id: true },
    });

    if (!rentalRoom) {
      return { data: [], total: 0, page: query.page ?? 1, limit: query.limit ?? 20, totalPages: 0 };
    }

    return this.paginate({ roomId: rentalRoom.id }, query);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async paginate(
    baseWhere: object,
    query: ElectricityBillQueryDto,
  ): Promise<PaginatedElectricityBillsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { ...baseWhere };
    if (query.status) where.status = query.status;
    if (query.month) {
      where.billingMonth = this.toMonthStart(query.month + '-01');
    }

    const [bills, total] = await this.prisma.$transaction([
      this.prisma.electricityBill.findMany({
        where,
        select: BILL_SELECT,
        orderBy: { billingMonth: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.electricityBill.count({ where }),
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

  private async findOrThrow(billId: string) {
    const bill = await this.prisma.electricityBill.findUnique({
      where: { id: billId },
      select: BILL_SELECT,
    });
    if (!bill) throw new NotFoundException('Electricity bill not found');
    return bill;
  }

  private assertOwner(bill: any, ownerId: string): void {
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

  private format(bill: any): ElectricityBillResponseDto {
    const isOverdue =
      bill.status === BillStatus.PENDING && new Date(bill.dueDate) < new Date();

    return {
      id: bill.id,
      room: {
        id: bill.room.id,
        roomNumber: bill.room.roomNumber,
        floorNumber: bill.room.floorNumber,
        buildingName: bill.room.building.name,
      },
      tenant: bill.room.tenant ?? null,
      billingMonth: bill.billingMonth,
      previousUnit: bill.previousUnit,
      currentUnit: bill.currentUnit,
      unitsConsumed: bill.unitsConsumed,
      ratePerUnit: bill.ratePerUnit,
      amount: bill.amount,
      dueDate: bill.dueDate,
      status: bill.status,
      paidAt: bill.paidAt,
      note: bill.note,
      createdAt: bill.createdAt,
      updatedAt: bill.updatedAt,
      isOverdue,
    };
  }

  /** Rounds a number to 2 decimal places. */
  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private toMonthStart(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  private formatMonth(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
