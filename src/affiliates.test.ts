import { describe, it, expect } from 'vitest';
import { pickCards, CARD_COPY, AFFILIATE_CARDS_ENABLED, attributionBase, goLink } from './affiliates';
import attributionConfig from './attribution.config.json';
import { AFFILIATE_DISCLOSURE, DISCLAIMER_FOOTER, DISCLAIMER_NEAR_RESULTS } from './disclaimer';

const sell = { hasCrypto: true, sellsCrypto: true, taxPct: 15, topStrategy: 'lump' as const };
describe('affiliate result cards', () => {
  it('ships switched off', () => {
    expect(AFFILIATE_CARDS_ENABLED).toBe(false);
    expect(pickCards(sell)).toEqual([]);
  });
  it('tax card only after a sell result with a taxable gain', () => {
    expect(pickCards(sell, true)).toEqual(['tax']);
    expect(pickCards({ ...sell, taxPct: 0 }, true)).toEqual([]);
    expect(pickCards({ ...sell, sellsCrypto: false }, true)).toEqual([]);
  });
  it('wallet card only for a hold result, never without crypto', () => {
    expect(pickCards({ ...sell, topStrategy: 'wait' }, true)).toEqual(['tax', 'wallet']);
    expect(pickCards({ ...sell, sellsCrypto: false, topStrategy: 'wait' }, true)).toEqual(['wallet']);
    expect(pickCards({ ...sell, hasCrypto: false, topStrategy: 'wait' }, true)).toEqual([]);
  });
  it('links go through the /go/ attribution redirect from the single config, and copy passes the claims grep', () => {
    expect(goLink('tax')).toBe(`${attributionBase()}/go/aff-tax?from=%2F`);
    expect(goLink('wallet')).toBe(`${attributionBase()}/go/aff-wallet?from=%2F`);
    expect(attributionBase()).toBe(attributionConfig.ATTRIBUTION_BASE.replace(/\/$/, ''));
    expect(goLink('tax', '/scenarios/x/')).toMatch(/\/go\/aff-tax\?from=%2Fscenarios%2Fx%2F$/);
    (['tax', 'wallet'] as const).forEach(id => expect(goLink(id)).not.toMatch(/[?&](ref|aff|via|affiliate|partner)=/));
    const all = [...Object.values(CARD_COPY).flatMap(c => [c.title, c.body, c.cta]), AFFILIATE_DISCLOSURE, DISCLAIMER_FOOTER, DISCLAIMER_NEAR_RESULTS].join(' ');
    expect(all).not.toMatch(/we recommend|you should|best for you|guarantee[sd]? (a|your)|risk-free|debt-free|loan offer|sign up for/i);
    expect(AFFILIATE_DISCLOSURE).toMatch(/commission/);
  });
});
