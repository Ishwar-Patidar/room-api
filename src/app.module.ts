import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ExpenseGroupsModule } from './expense-groups/expense-groups.module';
import { ExpensesModule } from './expenses/expenses.module';
import { BalancesModule } from './balances/balances.module';
import { SettlementsModule } from './settlements/settlements.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OwnerModule } from './owner/owner.module';

@Module({
  imports: [
    // Load .env globally — must be first
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Global Prisma — available to all modules without re-importing
    PrismaModule,

    // Feature modules
    AuthModule,
    ExpenseGroupsModule,
    ExpensesModule,
    BalancesModule,
    SettlementsModule,
    DashboardModule,
    OwnerModule,
  ],
})
export class AppModule { }
