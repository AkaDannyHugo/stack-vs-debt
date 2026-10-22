import { describe, it, expect } from 'vitest';
import { stressTest, priceAtLtv, ltvAt, statusFor, totalInterest, balanceAfter, scenario, EXAMPLE } from '../public/crypto-loan-liquidation-calculator/liq.js';

// Made-up example numbers, hand-checked.
describe('liquidation / APR stress test', () => {
  it('liquidation and margin-call prices: balance / (coins x threshold)', () => {
    expect(priceAtLtv(12000, 0.5, 80)).toBeCloseTo(30000, 9);
    expect(priceAtLtv(12000, 0.5, 70)).toBeCloseTo(34285.7142857, 6);
  });
  it('example: 40% start LTV, -42.86% to margin call, -50% to liquidation', () => {
    const r = stressTest(EXAMPLE);
    expect(r.errors).toEqual([]);
    expect(r.startLtv).toBeCloseTo(40, 9);
    expect(r.dropToMarginCallPct).toBeCloseTo(42.857142857, 6);
    expect(r.dropToLiquidationPct).toBeCloseTo(50, 9);
  });
  it('interest: paid monthly = simple; added = monthly compounding', () => {
    expect(totalInterest(12000, 12, 12, 'paid')).toBeCloseTo(1440, 9);
    expect(totalInterest(12000, 12, 12, 'added')).toBeCloseTo(12000 * (1.01 ** 12 - 1), 9); // 1521.90
    expect(balanceAfter(12000, 12, 12, 'added')).toBeCloseTo(13521.9004, 3);
    expect(totalInterest(10000, 0, 24, 'added')).toBeCloseTo(0, 9);
  });
  it('added interest raises the liquidation price over the term', () => {
    const r = stressTest({ ...EXAMPLE, interestMode: 'added' });
    expect(r.liquidationPriceEnd).toBeCloseTo(13521.9004 / 0.4, 2); // ~33,804.75
    expect(r.liquidationPriceEnd).toBeGreaterThan(r.liquidationPrice);
    expect(r.dropToLiquidationEndPct).toBeLessThan(r.dropToLiquidationPct);
  });
  it('table rows at -20/-40/-60 plus the custom drop, in order', () => {
    const r = stressTest(EXAMPLE);
    expect(r.rows.map(x => x.dropPct)).toEqual([20, 40, 50, 60]);
    const [a, b, c, d] = r.rows;
    expect(a.ltv).toBeCloseTo(50, 9); expect(a.status).toBe('ok');
    expect(b.ltv).toBeCloseTo(66.6667, 3); expect(b.status).toBe('ok');
    expect(c.ltv).toBeCloseTo(80, 9); expect(c.status).toBe('liquidation'); expect(c.custom).toBe(true);
    expect(d.ltv).toBeCloseTo(100, 9); expect(d.status).toBe('liquidation');
  });
  it('cash or coins needed to bring LTV back to the margin-call level', () => {
    const s = scenario(EXAMPLE, 60, 12000); // price 24,000, collateral 12,000
    expect(s.cashToMarginCall).toBeCloseTo(12000 - 0.7 * 12000, 9); // 3,600
    expect(s.coinsToMarginCall).toBeCloseTo(12000 / (0.7 * 24000) - 0.5, 9); // ~0.2143
    expect(scenario(EXAMPLE, 20, 12000).cashToMarginCall).toBe(0);
  });
  it('status thresholds, incl. floating-point ties', () => {
    expect(statusFor(69.9, 70, 80)).toBe('ok');
    expect(statusFor(70, 70, 80)).toBe('margin-call');
    expect(statusFor(79.9999999999, 70, 80)).toBe('liquidation');
    expect(ltvAt(1, 0, 1)).toBe(Infinity);
  });
  it('custom drop equal to a preset is not duplicated; bad inputs return errors', () => {
    expect(stressTest({ ...EXAMPLE, dropPct: 40 }).rows.length).toBe(3);
    expect(stressTest({ ...EXAMPLE, coins: 0 }).errors.length).toBeGreaterThan(0);
    expect(stressTest({ ...EXAMPLE, marginCallPct: 85 }).errors.length).toBeGreaterThan(0);
  });
  it('added interest: end-of-term LTV and status per row', () => {
    const r = stressTest({ ...EXAMPLE, interestMode: 'added', aprPct: 14, dropPct: 30 });
    const row40 = r.rows.find(x => x.dropPct === 40); // price 36,000; end balance 12,000 x (1+0.14/12)^12
    expect(row40.status).toBe('ok');
    expect(row40.endLtv).toBeCloseTo(12000 * (1 + 0.14 / 12) ** 12 / 18000 * 100, 9); // ~76.6%
    expect(row40.endStatus).toBe('margin-call');
    expect(stressTest(EXAMPLE).rows[0].endStatus).toBe('ok');
  });
  it('warns when the loan is above the starting LTV entered', () => {
    expect(stressTest({ ...EXAMPLE, loan: 18000 }).warnings.length).toBe(1); // 60% > 50%
  });
});
