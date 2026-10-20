import { describe, it, expect } from 'vitest';
import { simulate, breakEvenMultiple, runwayMonths, priceMultiplier, type Holding, type Debt, type Settings } from './engine';

// EXAMPLE test data (made up)
const H: Holding[] = [{ id: 'btc', label: 'BTC', kind: 'crypto', symbol: 'BTC', units: 1, price: 50000 }];
const D: Debt[] = [{ id: 'c1', name: 'Card', balance: 10000, apr: 24, minPayment: 300 }];
const S: Settings = { gap: 500, feePct: 1, taxPct: 0, extraMonthly: 200, lumpCapPct: 100 };

describe('engine', () => {
  it('wait, month 1, flat: interest accrues, min paid, gap sold', () => {
    const r = simulate(H, D, S, 'wait', 'flat', 1, [1]);
    expect(r.rows[0].interest).toBeCloseTo(200, 6);
    expect(r.rows[0].debt).toBeCloseTo(9900, 6);
    expect(r.rows[0].sold).toBeCloseTo(500 / 0.99, 6);
    expect(r.snapshots[0].units.btc).toBeCloseTo(1 - 500 / 0.99 / 50000, 9);
  });
  it('lump: sells debt/fee-factor today, then gap shrinks by freed minimum', () => {
    const r = simulate(H, D, S, 'lump', 'flat', 1, [1]);
    expect(r.soldToday).toBeCloseTo(10000 / 0.99, 6);
    expect(r.rows[0].debt).toBeCloseTo(0, 6);
    expect(r.rows[0].sold).toBeCloseTo(200 / 0.99, 6);
    expect(r.debtFreeMonth).toBe(0);
  });
  it('break-even multiple', () => {
    expect(breakEvenMultiple(H, D, S)).toBeCloseTo(10000 / 0.99 / 50000, 9);
  });
  it('runway: tiny stack runs out', () => {
    const small: Holding[] = [{ ...H[0], units: 0.03 }]; // $1,500
    expect(runwayMonths(small, D, S)).toBe(3);
  });
  it('scenario multipliers', () => {
    expect(priceMultiplier('crypto', 'bear', 12)).toBeCloseTo(0.5);
    expect(priceMultiplier('crypto', 'bull', 24)).toBeCloseTo(2);
    expect(priceMultiplier('crypto', 'bull', 36)).toBeCloseTo(2);
    expect(priceMultiplier('cash', 'bear', 12)).toBe(1);
  });
  it('lump beats wait over 36 months in flat for 24% debt', () => {
    const w = simulate(H, D, S, 'wait', 'flat').snapshots.at(-1)!.net;
    const l = simulate(H, D, S, 'lump', 'flat').snapshots.at(-1)!.net;
    expect(l).toBeGreaterThan(w);
  });
  it('stack exhaustion pushes shortfall onto debt', () => {
    const small: Holding[] = [{ ...H[0], units: 0.01 }]; // $500
    const r = simulate(small, D, S, 'wait', 'flat', 3, [3]);
    expect(r.runOutMonth).toBe(1);
    expect(r.snapshots[0].debt).toBeGreaterThan(9900);
  });
});
