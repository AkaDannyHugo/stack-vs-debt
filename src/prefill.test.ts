import { describe, it, expect } from 'vitest';
import { parsePrefill, slugFrom, shouldPersist, mayClearSaved } from './prefill';

describe('URL pre-fill', () => {
  it('parses debts, USD holdings and settings', () => {
    const p = parsePrefill('?debt=cc:10000:24:300&hold=crypto:BTC:10000usd&gap=300&extra=800&utm_source=scenario&utm_content=10k-credit-card-24-apr-vs-selling-bitcoin')!;
    expect(p.debts[0]).toMatchObject({ balance: 10000, apr: 24, minPayment: 300 });
    expect(p.holdings[0]).toMatchObject({ kind: 'crypto', symbol: 'BTC', units: 10000, price: 1 });
    expect(p.usd[p.holdings[0].id]).toBe(10000);
    expect(p.settings).toEqual({ gap: 300, extraMonthly: 800 });
    expect(p.slug).toBe('10k-credit-card-24-apr-vs-selling-bitcoin');
  });
  it('rejects bad or partial input', () => {
    expect(parsePrefill('')).toBeNull();
    expect(parsePrefill('?debt=cc:10000:24')).toBeNull();
    expect(parsePrefill('?debt=xx:1:1&hold=stock:A:1usd')).toBeNull();
    expect(parsePrefill('?debt=cc:1:150&hold=stock:A:1usd')).toBeNull();
    expect(parsePrefill('?debt=cc:1:5&hold=crypto:BTC:1')).toBeNull(); // value must be in usd, never a coin count/price
  });
  it('sanitizes labels and slugs', () => {
    const p = parsePrefill('?debt=car:5000:6&hold=stock:%3Cscript%3EIndex:5000usd&utm_content=Bad%20Slug')!;
    expect(p.holdings[0].label).toBe('scriptIndex'); expect(p.slug).toBeNull();
    expect(slugFrom('', 'https://akadannyhugo.github.io/stack-vs-debt/scenarios/mortgage-vs-selling-stocks/')).toBe('mortgage-vs-selling-stocks');
  });
  it('never overwrites or clears saved data while a URL example is shown', () => {
    expect(shouldPersist({ isExample: false, fromUrl: true, hasSaved: true })).toBe(false);
    expect(shouldPersist({ isExample: true, fromUrl: true, hasSaved: false })).toBe(false);
    expect(shouldPersist({ isExample: false, fromUrl: true, hasSaved: false })).toBe(true);
    expect(shouldPersist({ isExample: false, fromUrl: false, hasSaved: true })).toBe(true);
    expect(mayClearSaved({ fromUrl: true, hasSaved: true })).toBe(false);
  });
});
