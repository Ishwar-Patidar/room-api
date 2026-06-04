import { Module } from '@nestjs/common';
import {
  ElectricityBillsOwnerController,
  ElectricityBillsTenantController,
} from './electricity-bills.controller';
import { ElectricityBillsService } from './electricity-bills.service';

@Module({
  controllers: [ElectricityBillsOwnerController, ElectricityBillsTenantController],
  providers: [ElectricityBillsService],
  exports: [ElectricityBillsService],
})
export class ElectricityBillsModule {}
