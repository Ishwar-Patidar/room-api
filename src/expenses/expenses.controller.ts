import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import {
  ExpenseResponseDto,
  PaginatedExpensesDto,
} from './dto/expense-response.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('Expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // ─── Create Expense ──────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Create a new expense in a group',
    description:
      'For EQUAL split, only participantIds are stored. For CUSTOM split, customSplits with explicit amounts are required and must sum to the total.',
  })
  @ApiCreatedResponse({ type: ExpenseResponseDto })
  @ApiForbiddenResponse({ description: 'Not an active group member' })
  async createExpense(
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: CreateExpenseDto,
  ): Promise<ExpenseResponseDto> {
    return this.expensesService.createExpense(user.id, dto);
  }

  // ─── Get Group Expenses ──────────────────────────────────────────────────────

  @Get('group/:groupId')
  @ApiOperation({
    summary: 'Get all expenses in a group (paginated, newest first)',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkResponse({ type: PaginatedExpensesDto })
  @ApiForbiddenResponse({ description: 'Not an active group member' })
  @ApiNotFoundResponse({ description: 'Group not found' })
  async getGroupExpenses(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Query() query: ExpenseQueryDto,
  ): Promise<PaginatedExpensesDto> {
    return this.expensesService.getGroupExpenses(groupId, user.id, query);
  }

  // ─── Get Single Expense ──────────────────────────────────────────────────────

  @Get(':expenseId')
  @ApiOperation({ summary: 'Get full details of a single expense' })
  @ApiParam({ name: 'expenseId', type: String })
  @ApiOkResponse({ type: ExpenseResponseDto })
  @ApiNotFoundResponse({ description: 'Expense not found' })
  @ApiForbiddenResponse({ description: 'Not an active group member' })
  async getExpenseById(
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<ExpenseResponseDto> {
    return this.expensesService.getExpenseById(expenseId, user.id);
  }

  // ─── Update Expense ──────────────────────────────────────────────────────────

  @Patch(':expenseId')
  @ApiOperation({
    summary: 'Update an expense (creator only)',
    description:
      'Replaces participants and customSplits entirely. Partial field updates are supported; unchanged fields retain existing values.',
  })
  @ApiParam({ name: 'expenseId', type: String })
  @ApiOkResponse({ type: ExpenseResponseDto })
  @ApiNotFoundResponse({ description: 'Expense not found' })
  @ApiForbiddenResponse({ description: 'Only the creator can edit this expense' })
  async updateExpense(
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: UpdateExpenseDto,
  ): Promise<ExpenseResponseDto> {
    return this.expensesService.updateExpense(expenseId, user.id, dto);
  }

  // ─── Delete Expense ──────────────────────────────────────────────────────────

  @Delete(':expenseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an expense (creator only)',
    description:
      'Permanently deletes the expense along with all participants and custom splits.',
  })
  @ApiParam({ name: 'expenseId', type: String })
  @ApiOkResponse({ schema: { example: { message: 'Expense deleted successfully' } } })
  @ApiNotFoundResponse({ description: 'Expense not found' })
  @ApiForbiddenResponse({ description: 'Only the creator can delete this expense' })
  async deleteExpense(
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<{ message: string }> {
    return this.expensesService.deleteExpense(expenseId, user.id);
  }
}
