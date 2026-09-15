import { describe, it, expect } from 'vitest';
import { simplifyFromBalances } from '../debts.ts';

describe('simplifyFromBalances (F18 — tests del algoritmo greedy)', () => {
  it('retorna [] cuando todos los balances son 0', () => {
    const balances = [
      { user_id: 'a', full_name: 'Alice', net_balance: 0 },
      { user_id: 'b', full_name: 'Bob', net_balance: 0 },
    ];
    expect(simplifyFromBalances(balances, 'PEN')).toEqual([]);
  });

  it('produce 1 transferencia simple: A debe a B', () => {
    const balances = [
      { user_id: 'a', full_name: 'Alice', net_balance: -100 },  // debe 100
      { user_id: 'b', full_name: 'Bob', net_balance: 100 },     // le deben 100
    ];
    const result = simplifyFromBalances(balances, 'PEN');
    expect(result).toHaveLength(1);
    expect(result[0].debtor_id).toBe('a');
    expect(result[0].creditor_id).toBe('b');
    expect(result[0].amount).toBe(100);
  });

  it('procesa correctamente 3 miembros con 1 deudor y 2 acreedores', () => {
    const balances = [
      { user_id: 'a', full_name: 'Alice', net_balance: -200 },  // debe 200
      { user_id: 'b', full_name: 'Bob', net_balance: 100 },     // le deben 100
      { user_id: 'c', full_name: 'Carol', net_balance: 100 },   // le deben 100
    ];
    const result = simplifyFromBalances(balances, 'PEN');
    expect(result).toHaveLength(2);
    // Alice debería pagar 100 a Bob y 100 a Carol (o viceversa)
    const totalPaid = result.reduce((s: number, r: any) => s + r.amount, 0);
    expect(totalPaid).toBe(200);
  });

  it('procesa correctamente 2 deudores y 1 acreedor', () => {
    const balances = [
      { user_id: 'a', full_name: 'Alice', net_balance: 200 },     // le deben 200
      { user_id: 'b', full_name: 'Bob', net_balance: -100 },      // debe 100
      { user_id: 'c', full_name: 'Carol', net_balance: -100 },   // debe 100
    ];
    const result = simplifyFromBalances(balances, 'PEN');
    expect(result).toHaveLength(2);
    expect(result.every((r: any) => r.creditor_id === 'a')).toBe(true);
  });

  it('maneja correctamente decimales', () => {
    const balances = [
      { user_id: 'a', full_name: 'Alice', net_balance: -33.33 },
      { user_id: 'b', full_name: 'Bob', net_balance: 33.33 },
    ];
    const result = simplifyFromBalances(balances, 'PEN');
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBeCloseTo(33.33, 2);
  });

  it('ignora balances cercanos a 0 (umbral 0.01)', () => {
    const balances = [
      { user_id: 'a', full_name: 'Alice', net_balance: 0.005 },   // ignorado
      { user_id: 'b', full_name: 'Bob', net_balance: -0.005 },    // ignorado
      { user_id: 'c', full_name: 'Carol', net_balance: 0 },      // ignorado
    ];
    expect(simplifyFromBalances(balances, 'PEN')).toEqual([]);
  });

  it('ordena por monto DESC y desempata por nombre ASC (determinista)', () => {
    const balances = [
      { user_id: 'z', full_name: 'Zara', net_balance: -50 },
      { user_id: 'a', full_name: 'Alice', net_balance: -50 },
      { user_id: 'b', full_name: 'Bob', net_balance: 100 },
    ];
    const result = simplifyFromBalances(balances, 'PEN');
    // Ambos deudores tienen 50; Alice debería ir primero por nombre
    expect(result[0].debtor_id).toBe('a');
    expect(result[1].debtor_id).toBe('z');
  });
});
