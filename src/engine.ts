// Stack vs Debt: pure calculation engine (no I/O). All money in USD.
export type AssetKind = 'crypto' | 'stock' | 'cash';
export interface Holding { id: string; label: string; kind: AssetKind; symbol?: string; units: number; price: number }
export interface Debt { id: string; name: string; balance: number; apr: number; minPayment: number }
export interface Settings {
  gap: number;          // $/month you currently sell assets to cover (bills + minimum payments not covered by income)
  feePct: number;       // trading fee % per sale
  taxPct: number;       // % of each sale set aside for tax (simple reserve)
  extraMonthly: number; // extra $/month sold and sent to highest-APR debt in the "monthly extra" strategy
  lumpCapPct: number;   // max % of stack you'd sell today in the "kill debt now" strategy
}
export type Scenario = 'bear' | 'flat' | 'bull';
export type Strategy = 'wait' | 'lump' | 'drip';
export const SCENARIOS: Scenario[] = ['bear', 'flat', 'bull'];
export const STRATEGIES: Strategy[] = ['wait', 'lump', 'drip'];

/** Price multiplier vs today for an asset class, scenario and month. */
export function priceMultiplier(kind: AssetKind, s: Scenario, month: number): number {
  if (kind === 'cash' || s === 'flat') return 1;
  if (kind === 'crypto') {
    if (s === 'bear') return Math.pow(0.5, Math.min(month, 12) / 12);   // -50% over 12 months, then flat
    return Math.pow(2, Math.min(month, 24) / 24);                       // bull: 2x over 24 months, then flat
  }
  if (s === 'bear') return Math.pow(0.75, Math.min(month, 12) / 12);    // stocks: -25% over 12 months
  return Math.pow(1.1, month / 12);                                     // stocks bull: +10%/yr
}

export const value = (hs: Holding[]) => hs.reduce((a, h) => a + h.units * h.price, 0);
export const totalDebt = (ds: Debt[]) => ds.reduce((a, d) => a + d.balance, 0);
export const monthlyInterest = (ds: Debt[]) => ds.reduce((a, d) => a + d.balance * d.apr / 100 / 12, 0);
const netFactor = (st: Settings) => (1 - st.feePct / 100) * (1 - st.taxPct / 100);

export interface Snapshot { month: number; stackValue: number; debt: number; net: number; units: Record<string, number> }
export interface MonthRow { month: number; sold: number; interest: number; paid: number; stackValue: number; debt: number }
export interface SimResult { strategy: Strategy; scenario: Scenario; snapshots: Snapshot[]; rows: MonthRow[]; runOutMonth: number | null; debtFreeMonth: number | null; soldToday: number; interestPaid: number }

/** Sell `grossUsd` of assets proportionally by current value. Returns gross actually sold. */
function sellProportional(units: number[], prices: number[], grossUsd: number): number {
  const total = units.reduce((a, u, i) => a + u * prices[i], 0);
  if (total <= 0 || grossUsd <= 0) return 0;
  const frac = Math.min(1, grossUsd / total);
  for (let i = 0; i < units.length; i++) units[i] *= (1 - frac);
  if (frac >= 1) for (let i = 0; i < units.length; i++) units[i] = 0;
  return total * frac;
}

/** Pay `cash` toward debts, highest APR first. Returns leftover cash. */
function payAvalanche(bal: number[], debts: Debt[], cash: number): number {
  const order = debts.map((_, i) => i).sort((a, b) => debts[b].apr - debts[a].apr);
  for (const i of order) { if (cash <= 0) break; const p = Math.min(cash, bal[i]); bal[i] -= p; cash -= p; }
  return cash;
}

export function simulate(holdings: Holding[], debts: Debt[], st: Settings, strategy: Strategy, scenario: Scenario, months = 36, snapAt = [12, 24, 36]): SimResult {
  const k = netFactor(st);
  const units = holdings.map(h => h.units);
  const bal = debts.map(d => d.balance);
  // If the stack runs out, unmet needs land on the highest-APR debt (or a new 25% card balance).
  const ds: Debt[] = debts.length ? debts.slice() : [];
  let overflowIdx = ds.length ? ds.map((d, i) => [d.apr, i]).sort((a, b) => b[0] - a[0])[0][1] : -1;
  if (overflowIdx === -1) { ds.push({ id: 'new', name: 'New card balance', balance: 0, apr: 25, minPayment: 0 }); bal.push(0); overflowIdx = ds.length - 1; }

  const pricesAt = (m: number) => holdings.map(h => h.price * priceMultiplier(h.kind, scenario, m));
  let soldToday = 0;
  if (strategy === 'lump') {
    const p0 = pricesAt(0);
    const stack = units.reduce((a, u, i) => a + u * p0[i], 0);
    const need = bal.reduce((a, b) => a + b, 0);
    const gross = Math.min(need / k, stack * Math.max(0, Math.min(100, st.lumpCapPct)) / 100);
    soldToday = sellProportional(units, p0, gross);
    payAvalanche(bal, ds, soldToday * k);
  }
  const snapshots: Snapshot[] = []; const rows: MonthRow[] = [];
  let runOutMonth: number | null = null; let debtFreeMonth: number | null = bal.every(b => b <= 0.005) ? 0 : null;
  let interestPaid = 0;
  for (let m = 1; m <= months; m++) {
    const p = pricesAt(m);
    let interest = 0, paid = 0, unpaidMins = 0;
    for (let i = 0; i < ds.length; i++) {
      const int = bal[i] * ds[i].apr / 100 / 12; bal[i] += int; interest += int;
      const pay = Math.min(ds[i].minPayment, bal[i]); bal[i] -= pay; paid += pay;
      unpaidMins += ds[i].minPayment - pay; // min payments no longer needed free up the gap
    }
    interestPaid += interest;
    let need = Math.max(0, st.gap - unpaidMins);
    let extra = 0;
    if (strategy === 'drip' && bal.some(b => b > 0.005)) extra = st.extraMonthly;
    const wantNet = need + extra;
    const stackNow = units.reduce((a, u, i) => a + u * p[i], 0);
    const gross = sellProportional(units, p, wantNet / k);
    let gotNet = gross * k;
    // cover living gap first, then extra toward debt
    const coverGap = Math.min(gotNet, need); gotNet -= coverGap;
    if (extra > 0 && gotNet > 0) { const left = payAvalanche(bal, ds, Math.min(gotNet, extra)); paid += Math.min(gotNet, extra) - left; }
    const shortfall = need - coverGap;
    if (shortfall > 0.005) bal[overflowIdx] += shortfall;
    if (runOutMonth === null && stackNow > 0 && units.every((u, i) => u * p[i] < 0.01)) runOutMonth = m;
    const debtNow = bal.reduce((a, b) => a + b, 0);
    if (debtFreeMonth === null && debtNow <= 0.005) debtFreeMonth = m;
    const stackValue = units.reduce((a, u, i) => a + u * p[i], 0);
    rows.push({ month: m, sold: gross, interest, paid, stackValue, debt: debtNow });
    if (snapAt.includes(m)) snapshots.push({ month: m, stackValue, debt: debtNow, net: stackValue - debtNow, units: Object.fromEntries(holdings.map((h, i) => [h.id, units[i]])) });
  }
  return { strategy, scenario, snapshots, rows, runOutMonth, debtFreeMonth, soldToday, interestPaid };
}

/** Months until the stack is gone under "wait" at today's prices (null = lasts > maxMonths). */
export function runwayMonths(holdings: Holding[], debts: Debt[], st: Settings, maxMonths = 600): number | null {
  const r = simulate(holdings, debts, st, 'wait', 'flat', maxMonths, []);
  return r.runOutMonth;
}

/** How much crypto prices must multiply so the stack (after fees/tax) clears all debt today. */
export function breakEvenMultiple(holdings: Holding[], debts: Debt[], st: Settings): number | null {
  const k = netFactor(st);
  const crypto = holdings.filter(h => h.kind === 'crypto').reduce((a, h) => a + h.units * h.price, 0);
  const other = holdings.filter(h => h.kind !== 'crypto').reduce((a, h) => a + h.units * h.price, 0);
  const need = totalDebt(debts) / k - other;
  if (need <= 0) return 0;
  if (crypto <= 0) return null;
  return need / crypto;
}

export const STRATEGY_LABEL: Record<Strategy, string> = { wait: 'Wait (sell only to cover bills)', lump: 'Kill debt now (highest APR first)', drip: 'Sell a bit extra monthly' };

export interface Verdict { headline: string; lines: string[]; best: Strategy }
export function verdict(holdings: Holding[], debts: Debt[], st: Settings): Verdict {
  const res = (s: Strategy, sc: Scenario) => simulate(holdings, debts, st, s, sc).snapshots.at(-1)!.net;
  const score = (s: Strategy) => res(s, 'bear') + res(s, 'flat'); // weight the bad and boring cases
  const best = STRATEGIES.slice().sort((a, b) => score(b) - score(a))[0];
  const runway = runwayMonths(holdings, debts, st);
  const be = breakEvenMultiple(holdings, debts, st);
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  const lines: string[] = [];
  const int = monthlyInterest(debts);
  lines.push(`Your debt costs about ${fmt(int)} a month in interest (${fmt(int * 12)} a year). That cost is guaranteed; price gains are not.`);
  if (runway !== null) lines.push(`At today's prices, selling ${fmt(st.gap)} a month empties your stack in about ${runway} months.`);
  else lines.push(`At today's prices your stack outlasts your monthly selling.`);
  if (be === 0) lines.push(`Your assets already cover all your debt today, after fees and tax.`);
  else if (be !== null && be <= 1) lines.push(`What you hold covers all your debt today. Crypto could drop about ${Math.round((1 - be) * 100)}% and still cover it, so the question is how long you keep paying interest while you wait.`);
  else if (be !== null) lines.push(`To clear all debt with what you hold, crypto would need to go up about ${be.toFixed(1)}x from here.`);
  const bullWait = res('wait', 'bull'), bullBest = res(best, 'bull');
  if (best !== 'wait' && bullWait > bullBest) lines.push(`Waiting only wins if prices roughly double, and then by about ${fmt(bullWait - bullBest)} after 3 years.`);
  if (best === 'wait') lines.push(`Your debt is cheap enough, or your stack big enough, that waiting comes out ahead even when prices fall.`);
  const headline = best === 'wait' ? 'Waiting looks OK for you' : best === 'lump' ? 'Killing your highest-rate debt now leaves you better off in most cases' : 'Selling a bit extra each month toward your highest-rate debt leaves you better off in most cases';
  return { headline, lines, best };
}
