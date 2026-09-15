/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SimplifiedDebt } from '../src/types/flowmoney.ts';

/**
 * Algoritmo Greedy determinista para simplificar deudas a partir de los balances
 * devueltos por calculate_group_balances o el almacén de Cloud SQL.
 */
export function simplifyFromBalances(
  balances: Array<{
    user_id: string;
    full_name?: string;
    email?: string;
    avatar_url?: string | null;
    net_balance: number | string;
  }>,
  currency: string
): SimplifiedDebt[] {
  const debtors: Array<{ id: string; name: string; avatar?: string | null; debt: number }> = [];
  const creditors: Array<{ id: string; name: string; avatar?: string | null; credit: number }> = [];

  for (const b of balances) {
    const net = Math.round(Number(b.net_balance) * 100) / 100;
    const name = b.full_name || b.email || 'Miembro';
    if (net < -0.01) {
      debtors.push({ id: b.user_id, name, avatar: b.avatar_url, debt: Math.abs(net) });
    } else if (net > 0.01) {
      creditors.push({ id: b.user_id, name, avatar: b.avatar_url, credit: net });
    }
  }

  // Ordenamiento determinista: mayor monto primero, desempate por nombre / id
  debtors.sort((a, b) => b.debt - a.debt || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  creditors.sort((a, b) => b.credit - a.credit || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const results: SimplifiedDebt[] = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = Math.round(Math.min(debtor.debt, creditor.credit) * 100) / 100;

    if (amount > 0) {
      results.push({
        debtor_id: debtor.id,
        debtor_name: debtor.name,
        debtor_avatar: debtor.avatar,
        creditor_id: creditor.id,
        creditor_name: creditor.name,
        creditor_avatar: creditor.avatar,
        amount,
        currency,
      });
    }

    debtor.debt = Math.round((debtor.debt - amount) * 100) / 100;
    creditor.credit = Math.round((creditor.credit - amount) * 100) / 100;

    if (debtor.debt <= 0.01) i++;
    if (creditor.credit <= 0.01) j++;
  }

  return results;
}

