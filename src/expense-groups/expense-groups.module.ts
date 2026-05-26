import { Module } from '@nestjs/common';
import { ExpenseGroupsController } from './expense-groups.controller';
import { ExpenseGroupsService } from './expense-groups.service';

@Module({
  controllers: [ExpenseGroupsController],
  providers: [ExpenseGroupsService],
  exports: [ExpenseGroupsService],
})
export class ExpenseGroupsModule {}
