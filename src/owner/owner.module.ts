import { Module } from '@nestjs/common';

import { RentalRoomsService } from './rental-rooms/rental-rooms.service';
import { BuildingsController } from './buildings/buildings.controller';
import { BuildingsService } from './buildings/buildings.service';
import { RentalRoomsController } from './rental-rooms/rental-rooms.controller';
import { RentBillsOwnerController, RentBillsTenantController } from './rent-bills/rent-bills.controller';
import { RentBillsService } from './rent-bills/rent-bills.service';
import { ElectricityBillsOwnerController, ElectricityBillsTenantController } from './electricity-bills/electricity-bills.controller';
import { ElectricityBillsService } from './electricity-bills/electricity-bills.service';

@Module({
  controllers: [
    BuildingsController,
    RentalRoomsController,
    RentBillsOwnerController,
    RentBillsTenantController,
    ElectricityBillsOwnerController,
    ElectricityBillsTenantController,
  ],
  providers: [BuildingsService, RentalRoomsService, RentBillsService, ElectricityBillsService],
  exports: [BuildingsService, RentalRoomsService, RentBillsService, ElectricityBillsService],
})
export class OwnerModule {}
