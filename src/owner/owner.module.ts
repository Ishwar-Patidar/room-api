import { Module } from '@nestjs/common';

import { RentalRoomsService } from './rental-rooms/rental-rooms.service';
import { BuildingsController } from './buildings/buildings.controller';
import { BuildingsService } from './buildings/buildings.service';
import { RentalRoomsController } from './rental-rooms/rental-rooms.controller';

@Module({
  controllers: [BuildingsController, RentalRoomsController],
  providers: [BuildingsService, RentalRoomsService],
  exports: [BuildingsService, RentalRoomsService],
})
export class OwnerModule {}
