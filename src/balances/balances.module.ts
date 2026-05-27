import { Module } from '@nestjs/common';
import { BalancesController } from './balances.controller';
import { BalancesService } from './balances.service';

@Module({
  controllers: [BalancesController],
  providers: [BalancesService],
  // Export so Settlements module can use it for post-settlement balance checks
  exports: [BalancesService],
})
export class BalancesModule {}
