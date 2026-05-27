import { Prisma, SplitType } from '@prisma/client';
import { DebtDto, NetBalanceMap } from './dto/balance-response.dto';

// ─── Types for raw Prisma data passed in ─────────────────────────────────────

export interface RawExpense {
  id: string;
  amount: Prisma.Decimal | string | number; // Prisma Decimal comes as string
  splitType: SplitType;
  paidById: string;
  participants: { userId: string }[];
  customSplits: { userId: string; amount: Prisma.Decimal | string | number }[];
}

export interface RawSettlement {
  payerId: string;
  payeeId: string;
  amount: Prisma.Decimal | string | number;
}

export interface RawMember {
  id: string;
  name: string;
  mobile: string;
}

// ─── Helper: safe Decimal → number ───────────────────────────────────────────

export function toNumber(value: Prisma.Decimal | string | number): number {
  const num =
    value instanceof Prisma.Decimal
      ? value.toNumber()
      : Number(value);

  return Math.round(num * 100) / 100; // round to 2dp
}

// ─── Step 1: Build net balance map from expenses ──────────────────────────────

/**
 * Processes each expense and adjusts a net-balance map.
 *
 * Convention:
 *   map[userId] += amount  → user is owed this amount (creditor)
 *   map[userId] -= amount  → user owes this amount (debtor)
 *
 * For each expense the payer "lends" to every participant:
 *   - payer.balance  += participantShare  (they are owed back)
 *   - participant.balance -= participantShare (they owe the payer)
 *   - But the payer is also a participant in many cases, so their own
 *     share cancels out automatically.
 */
export function applyExpenses(
  expenses: RawExpense[],
  balanceMap: NetBalanceMap,
): void {
  for (const expense of expenses) {
    const totalAmount = toNumber(expense.amount);

    if (expense.splitType === SplitType.EQUAL) {
      const participantCount = expense.participants.length;
      if (participantCount === 0) continue;

      const share = toNumber(totalAmount / participantCount);

      for (const { userId } of expense.participants) {
        if (userId === expense.paidById) {
          // Payer's own share: they paid it, nothing net owed
          continue;
        }
        // Payer is owed `share` from this participant
        adjust(balanceMap, expense.paidById, +share);
        adjust(balanceMap, userId, -share);
      }
    } else {
      // CUSTOM split
      for (const split of expense.customSplits) {
        const splitAmount = toNumber(split.amount);

        if (split.userId === expense.paidById) {
          continue; // Payer's own portion — cancels out
        }

        adjust(balanceMap, expense.paidById, +splitAmount);
        adjust(balanceMap, split.userId, -splitAmount);
      }
    }
  }
}

// ─── Step 2: Apply settlements ────────────────────────────────────────────────

/**
 * Settlements reduce outstanding balances.
 * payer paid payee → payer's debt decreases, payee's credit decreases.
 */
export function applySettlements(
  settlements: RawSettlement[],
  balanceMap: NetBalanceMap,
): void {
  for (const settlement of settlements) {
    const amount = toNumber(settlement.amount);
    adjust(balanceMap, settlement.payerId, +amount);  // payer's debt shrinks
    adjust(balanceMap, settlement.payeeId, -amount);  // payee's credit shrinks
  }
}

// ─── Step 3: Simplify debts (minimise number of transactions) ────────────────

/**
 * Greedy debt simplification algorithm.
 *
 * Converts the net-balance map into the minimal set of directed payments
 * needed to settle all debts. Runs in O(n log n).
 *
 * Algorithm:
 * 1. Separate creditors (net > 0) and debtors (net < 0).
 * 2. Sort both lists by absolute amount (largest first).
 * 3. Greedily match the biggest debtor to the biggest creditor.
 * 4. The smaller of the two is fully settled; the larger carries the remainder.
 */
export function simplifyDebts(
  balanceMap: NetBalanceMap,
  memberMap: Map<string, RawMember>,
): DebtDto[] {
  const EPSILON = 0.01; // ignore dust amounts
  const debts: DebtDto[] = [];

  // Creditors: net > 0 (are owed money)
  const creditors: { id: string; amount: number }[] = [];
  // Debtors:   net < 0 (owe money)
  const debtors: { id: string; amount: number }[] = [];

  for (const [userId, net] of balanceMap.entries()) {
    if (net > EPSILON) creditors.push({ id: userId, amount: net });
    else if (net < -EPSILON) debtors.push({ id: userId, amount: -net }); // store positive
  }

  // Sort descending
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];

    const settled = Math.min(creditor.amount, debtor.amount);

    if (settled > EPSILON) {
      const fromUser = memberMap.get(debtor.id);
      const toUser = memberMap.get(creditor.id);

      if (fromUser && toUser) {
        debts.push({
          from: fromUser,
          to: toUser,
          amount: toNumber(settled),
          summary: `${fromUser.name} owes ${toUser.name} ₹${toNumber(settled).toFixed(2)}`,
        });
      }
    }

    creditor.amount -= settled;
    debtor.amount -= settled;

    if (creditor.amount < EPSILON) ci++;
    if (debtor.amount < EPSILON) di++;
  }

  return debts;
}

// ─── Internal helper ──────────────────────────────────────────────────────────

function adjust(map: NetBalanceMap, userId: string, delta: number): void {
  const next = toNumber((map.get(userId) ?? 0) + delta);

  if (Math.abs(next) < 0.01) {
    map.delete(userId);
  } else {
    map.set(userId, next);
  }
}
