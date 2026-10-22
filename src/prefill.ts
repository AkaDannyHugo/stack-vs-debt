// URL pre-fill for the calculator, used by the worked-example (scenario) pages.
// Format (all money in USD; no coin prices are ever passed):
//   ?debt=<cc|car|student|mortgage|personal>:<balance>:<apr>[:<minPayment>]   (repeatable, max 10)
//   &hold=<crypto|stock|cash>:<SYMBOL or label>:<usd>usd                      (repeatable, max 10)
//   &gap=<$/mo>&extra=<$/mo>&fee=<%>&tax=<%>&utm_source=scenario&utm_content=<slug>
// Rule: a URL pre-fill NEVER overwrites saved numbers in localStorage (see shouldPersist / mayClearSaved).
import type { Holding, Debt, Settings } from './engine';

export const SCENARIO_KEY = 'stack-vs-debt:scenario'; // sessionStorage: slug of the worked example that sent this visit
const DEBT_NAMES: Record<string, string> = { cc: 'Credit card', car: 'Car loan', student: 'Student loan', mortgage: 'Mortgage', personal: 'Personal loan' };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface Prefill { holdings: Holding[]; debts: Debt[]; settings: Partial<Settings>; usd: Record<string, number>; slug: string | null }

const num = (s: string | undefined) => { if (s === undefined || s.trim() === '') return NaN; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const clean = (s: string) => s.replace(/[<>"'`]/g, '').trim().slice(0, 40);

export function slugFrom(search: string, referrer = ''): string | null {
  const q = new URLSearchParams(search).get('utm_content');
  if (q && q.length <= 80 && SLUG.test(q)) return q;
  const m = /\/scenarios\/([a-z0-9-]{1,80})\/?(?:[?#]|$)/.exec(referrer);
  return m && SLUG.test(m[1]) ? m[1] : null;
}

export function parsePrefill(search: string): Prefill | null {
  const q = new URLSearchParams(search);
  const ds = q.getAll('debt').slice(0, 10), hs = q.getAll('hold').slice(0, 10);
  if (!ds.length || !hs.length) return null;
  const debts: Debt[] = [];
  for (const [i, raw] of ds.entries()) {
    const [type, b, a, m] = raw.split(':');
    const balance = num(b), apr = num(a), minPayment = m === undefined ? 0 : num(m);
    if (!DEBT_NAMES[type] || !(balance >= 0) || !(apr >= 0 && apr <= 100) || !(minPayment >= 0)) return null;
    debts.push({ id: 'u' + i, name: DEBT_NAMES[type] + (ds.length > 1 ? ` ${i + 1}` : '') + ' (example)', balance, apr, minPayment });
  }
  const holdings: Holding[] = []; const usd: Record<string, number> = {};
  for (const [i, raw] of hs.entries()) {
    const [kind, name, v] = raw.split(':');
    const m = /^(\d+(?:\.\d+)?)usd$/i.exec(v ?? ''); const value = m ? Number(m[1]) : NaN;
    if (!['crypto', 'stock', 'cash'].includes(kind) || !name || !(value >= 0)) return null;
    const id = 'uh' + i;
    if (kind === 'crypto') {
      const symbol = clean(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      if (!symbol) return null;
      // Value in USD until the live price arrives; units = usd / price is set after the spot fetch.
      holdings.push({ id, label: symbol, kind: 'crypto', symbol, units: value, price: 1 }); usd[id] = value;
    } else holdings.push({ id, label: clean(name) || 'Holding', kind: kind as 'stock' | 'cash', units: value, price: 1 });
  }
  const settings: Partial<Settings> = {};
  for (const [k, key] of [['gap', 'gap'], ['extra', 'extraMonthly'], ['fee', 'feePct'], ['tax', 'taxPct']] as const) {
    const v = num(q.get(k) ?? undefined); if (v >= 0 && (k === 'gap' || k === 'extra' || v < 100)) settings[key] = v;
  }
  return { holdings, debts, settings, usd, slug: slugFrom(search) };
}

/** Save to localStorage only for the visitor's own edits, and never while a URL example is shown over saved data. */
export function shouldPersist(s: { isExample: boolean; fromUrl: boolean; hasSaved: boolean }): boolean {
  return !s.isExample && !(s.fromUrl && s.hasSaved);
}
/** "Start blank" may delete saved data only when no URL example is being shown over it. */
export function mayClearSaved(s: { fromUrl: boolean; hasSaved: boolean }): boolean {
  return !(s.fromUrl && s.hasSaved);
}
