import { Module } from '@nestjs/common';
import { BuildingsService } from '../buildings/buildings.service';
import { RentBillsOwnerController, RentBillsTenantController } from './rent-bills.controller';
import { RentBillsService } from './rent-bills.service';

@Module({
  controllers: [RentBillsOwnerController, RentBillsTenantController],
  providers: [RentBillsService, BuildingsService],
  exports: [RentBillsService],
})
export class RentBillsModule {}
