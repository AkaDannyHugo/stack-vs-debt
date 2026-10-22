import { useEffect, useMemo, useRef, useState } from 'react';
import { countInterest } from './analytics';
import ResultCards from './ResultCards';
import { AFFILIATE_CARDS_ENABLED } from './affiliates';
import { DISCLAIMER_FOOTER, DISCLAIMER_FOOTER_AFFILIATE, DISCLAIMER_NEAR_RESULTS } from './disclaimer';
import { parsePrefill, slugFrom, shouldPersist, mayClearSaved, SCENARIO_KEY } from './prefill';
import { type Holding, type Debt, type Settings, type Scenario, type AssetKind, SCENARIOS, STRATEGIES, STRATEGY_LABEL, simulate, runwayMonths, breakEvenMultiple, verdict, value, totalDebt, monthlyInterest } from './engine';

// EXAMPLE DATA ONLY: made-up numbers so the screen isn't empty.
const EXAMPLE = {
  holdings: [
    { id: 'h1', label: 'Bitcoin', kind: 'crypto', symbol: 'BTC', units: 0.25, price: 0 },
    { id: 'h2', label: 'Ethereum', kind: 'crypto', symbol: 'ETH', units: 3, price: 0 },
    { id: 'h3', label: 'Brokerage (index fund)', kind: 'stock', units: 4000, price: 1 },
  ] as Holding[],
  debts: [
    { id: 'd1', name: 'Card A', balance: 9000, apr: 27.9, minPayment: 270 },
    { id: 'd2', name: 'Card B', balance: 4500, apr: 22.5, minPayment: 135 },
    { id: 'd3', name: 'Personal loan', balance: 12000, apr: 14, minPayment: 410 },
  ] as Debt[],
  settings: { gap: 1200, feePct: 1, taxPct: 0, extraMonthly: 300, lumpCapPct: 100 } as Settings,
};
const KEY = 'stack-vs-debt:v1';
const uid = () => Math.random().toString(36).slice(2, 9);
const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const priceFmt = (n: number) => '$' + (n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 4 }));

async function fetchSpot(sym: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.coinbase.com/v2/prices/${encodeURIComponent(sym.toUpperCase())}-USD/spot`);
    if (!r.ok) return null;
    const j = await r.json();
    const p = parseFloat(j?.data?.amount);
    return Number.isFinite(p) ? p : null;
  } catch { return null; }
}

function readSaved() {
  try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch { /* ignore */ }
  return null;
}
function load() {
  const saved = readSaved();
  // A worked-example link pre-fills the form, but is never written over saved numbers (see prefill.ts).
  const pre = typeof location !== 'undefined' ? parsePrefill(location.search) : null;
  if (pre) return { holdings: pre.holdings, debts: pre.debts, settings: { ...EXAMPLE.settings, ...pre.settings }, isExample: true, fromUrl: true, hasSaved: !!saved, pendingUsd: pre.usd };
  if (saved) return { ...saved, isExample: false, fromUrl: false, hasSaved: true, pendingUsd: {} };
  return { ...structuredClone(EXAMPLE), isExample: true, fromUrl: false, hasSaved: false, pendingUsd: {} };
}

export default function App() {
  const init = useMemo(load, []);
  const [holdings, setHoldings] = useState<Holding[]>(init.holdings);
  const [debts, setDebts] = useState<Debt[]>(init.debts);
  const [st, setSt] = useState<Settings>(init.settings);
  const [isExample, setIsExample] = useState<boolean>(init.isExample);
  const [fromUrl, setFromUrl] = useState<boolean>(init.fromUrl);
  const hasSaved: boolean = init.hasSaved;
  const pendingUsd = useRef<Record<string, number>>(init.pendingUsd);
  useEffect(() => { try { const s = slugFrom(location.search, document.referrer); if (s) sessionStorage.setItem(SCENARIO_KEY, s); } catch { /* ignore */ } }, []);
  const backToSaved = () => {
    const s = readSaved(); if (!s) return;
    setHoldings(s.holdings); setDebts(s.debts); setSt(s.settings); pendingUsd.current = {}; setFromUrl(false); setIsExample(false);
    try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ }
  };
  const [scenario, setScenario] = useState<Scenario>('flat');
  const [priceStatus, setPriceStatus] = useState('');
  const [showPlan, setShowPlan] = useState(false);
  const [interested, setInterested] = useState<boolean>(() => { try { return localStorage.getItem('stack-vs-debt:interest') === '1'; } catch { return false; } });
  const registerInterest = () => {
    if (interested) return;
    // Counts a click only. No email, no personal data, no form values are sent.
    countInterest();
    try { localStorage.setItem('stack-vs-debt:interest', '1'); } catch { /* ignore */ }
    setInterested(true);
  };

  useEffect(() => { if (shouldPersist({ isExample, fromUrl, hasSaved })) localStorage.setItem(KEY, JSON.stringify({ holdings, debts, settings: st })); }, [holdings, debts, st, isExample, fromUrl, hasSaved]);
  const touch = () => setIsExample(false);

  const refreshPrices = async () => {
    setPriceStatus('Getting live prices…');
    let fails = 0;
    const next = await Promise.all(holdings.map(async h => {
      if (h.kind !== 'crypto' || !h.symbol) return h;
      const p = await fetchSpot(h.symbol); if (p === null) { fails++; return h; }
      const u = pendingUsd.current[h.id];
      if (u !== undefined) { delete pendingUsd.current[h.id]; return { ...h, price: p, units: u / p }; } // URL values are USD
      return { ...h, price: p };
    }));
    setHoldings(next);
    setPriceStatus(fails ? `${fails} price(s) not found. Type them in by hand.` : `Live prices from Coinbase, ${new Date().toLocaleTimeString()}`);
  };
  useEffect(() => { refreshPrices(); /* eslint-disable-next-line */ }, []);

  const ready = holdings.some(h => h.units * h.price > 0) && debts.length > 0;
  const runway = ready ? runwayMonths(holdings, debts, st) : null;
  const be = ready ? breakEvenMultiple(holdings, debts, st) : null;
  const v = ready ? verdict(holdings, debts, st) : null;
  const sims = ready ? STRATEGIES.map(s => simulate(holdings, debts, st, s, scenario)) : [];
  const btc = holdings.find(h => h.kind === 'crypto' && h.price > 0);

  const upH = (id: string, patch: Partial<Holding>) => { touch(); setHoldings(hs => hs.map(h => h.id === id ? { ...h, ...patch } : h)); };
  const upD = (id: string, patch: Partial<Debt>) => { touch(); setDebts(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d)); };
  const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
  const clearAll = () => { if (mayClearSaved({ fromUrl, hasSaved })) localStorage.removeItem(KEY); pendingUsd.current = {}; setHoldings([{ id: uid(), label: 'Bitcoin', kind: 'crypto', symbol: 'BTC', units: 0, price: holdings.find(h => h.symbol === 'BTC')?.price ?? 0 }]); setDebts([{ id: uid(), name: 'Card 1', balance: 0, apr: 24, minPayment: 0 }]); setSt({ ...EXAMPLE.settings, gap: 0 }); setIsExample(false); };

  return (
    <main>
      <header>
        <h1>Stack vs Debt</h1>
        <p className="sub">Holding crypto or stocks while paying card interest? See how long your stack lasts, the price you need, and how selling now compares with waiting.</p>
        <p className="private">🔒 No login. Your numbers stay in this browser only.</p>
      </header>

      {fromUrl && <div className="banner">Pre-filled from a worked example (<b>made-up numbers</b>). Change any field to use your own.{hasSaved && <> Your saved numbers are untouched and edits here are not saved over them. <button className="link" onClick={backToSaved}>Back to my saved numbers</button></>}</div>}
      {isExample && !fromUrl && <div className="banner">You're looking at <b>example numbers</b> (made up). Change any field to use your own, or <button className="link" onClick={clearAll}>start blank</button>.</div>}

      <section>
        <h2>1. What you hold</h2>
        {holdings.map(h => (
          <div className="card row" key={h.id}>
            <div className="grid">
              <label>Type
                <select value={h.kind} onChange={e => { const kind = e.target.value as AssetKind; upH(h.id, kind === 'crypto' ? { kind } : { kind, symbol: undefined, units: Math.round(h.units * h.price) || 0, price: 1 }); }}>
                  <option value="crypto">Crypto</option><option value="stock">Stocks / funds</option><option value="cash">Cash / other</option>
                </select>
              </label>
              {h.kind === 'crypto' ? <>
                <label>Coin symbol<input value={h.symbol ?? ''} placeholder="BTC" onChange={e => upH(h.id, { symbol: e.target.value.toUpperCase(), label: e.target.value.toUpperCase() })} onBlur={async e => { const p = await fetchSpot(e.target.value); if (p) upH(h.id, { price: p }); }} /></label>
                <label>Amount (coins)<input inputMode="decimal" value={h.units} onChange={e => upH(h.id, { units: num(e.target.value) })} /></label>
                <label>Price (USD)<input inputMode="decimal" value={h.price} onChange={e => upH(h.id, { price: num(e.target.value) })} /></label>
              </> : <>
                <label>Name<input value={h.label} onChange={e => upH(h.id, { label: e.target.value })} /></label>
                <label>Value (USD)<input inputMode="decimal" value={h.units} onChange={e => upH(h.id, { units: num(e.target.value), price: 1 })} /></label>
              </>}
            </div>
            <div className="rowfoot"><span>{usd(h.units * h.price)}</span><button className="link danger" onClick={() => { touch(); setHoldings(hs => hs.filter(x => x.id !== h.id)); }}>Remove</button></div>
          </div>
        ))}
        <div className="actions">
          <button onClick={() => { touch(); setHoldings(hs => [...hs, { id: uid(), label: 'XRP', kind: 'crypto', symbol: 'XRP', units: 0, price: 0 }]); }}>+ Add asset</button>
          <button className="ghost" onClick={refreshPrices}>↻ Live prices</button>
        </div>
        <p className="note">{priceStatus}</p>
      </section>

      <section>
        <h2>2. What you owe</h2>
        {debts.map(d => (
          <div className="card row" key={d.id}>
            <div className="grid">
              <label>Name<input value={d.name} onChange={e => upD(d.id, { name: e.target.value })} /></label>
              <label>Balance (USD)<input inputMode="decimal" value={d.balance} onChange={e => upD(d.id, { balance: num(e.target.value) })} /></label>
              <label>APR %<input inputMode="decimal" value={d.apr} onChange={e => upD(d.id, { apr: num(e.target.value) })} /></label>
              <label>Min payment / mo<input inputMode="decimal" value={d.minPayment} onChange={e => upD(d.id, { minPayment: num(e.target.value) })} /></label>
            </div>
            <div className="rowfoot"><span>{usd(d.balance * d.apr / 1200)}/mo interest</span><button className="link danger" onClick={() => { touch(); setDebts(ds => ds.filter(x => x.id !== d.id)); }}>Remove</button></div>
          </div>
        ))}
        <div className="actions"><button onClick={() => { touch(); setDebts(ds => [...ds, { id: uid(), name: `Debt ${ds.length + 1}`, balance: 0, apr: 24, minPayment: 0 }]); }}>+ Add debt</button></div>
      </section>

      <section>
        <h2>3. Your monthly gap</h2>
        <div className="card grid">
          <label className="wide">How much you sell (or would need to sell) each month to cover bills and minimum payments
            <input inputMode="decimal" value={st.gap} onChange={e => { touch(); setSt({ ...st, gap: num(e.target.value) }); }} /></label>
          <label>Fee per sale %<input inputMode="decimal" value={st.feePct} onChange={e => { touch(); setSt({ ...st, feePct: num(e.target.value) }); }} /></label>
          <label>Tax set aside %<input inputMode="decimal" value={st.taxPct} onChange={e => { touch(); setSt({ ...st, taxPct: num(e.target.value) }); }} /></label>
          <label>"Sell extra" amount / mo<input inputMode="decimal" value={st.extraMonthly} onChange={e => { touch(); setSt({ ...st, extraMonthly: num(e.target.value) }); }} /></label>
          <label>Max % to sell today<input inputMode="decimal" value={st.lumpCapPct} onChange={e => { touch(); setSt({ ...st, lumpCapPct: num(e.target.value) }); }} /></label>
        </div>
      </section>

      {ready && v && <>
        <section>
          <h2>Your numbers</h2>
          <div className="stats">
            <div className="stat"><div className="k">Stack</div><div className="v">{usd(value(holdings))}</div></div>
            <div className="stat"><div className="k">Debt</div><div className="v">{usd(totalDebt(debts))}</div></div>
            <div className="stat"><div className="k">Interest / month</div><div className="v bad">{usd(monthlyInterest(debts))}</div></div>
            <div className="stat"><div className="k">Runway</div><div className="v">{runway === null ? 'Lasts' : `${runway} mo`}</div><div className="s">{runway === null ? 'your stack outlasts the selling at today\'s prices' : 'until the stack is gone at today\'s prices'}</div></div>
            <div className="stat wide"><div className="k">Break-even</div><div className="v">{be === null ? 'n/a' : be <= 1 ? 'Covered today' : `${be.toFixed(2)}x`}</div>
              <div className="s">{be === null ? 'no crypto entered' : be <= 1 ? (btc && be > 0 ? `you could pay off everything now; crypto can fall to ${(be).toFixed(2)}x (${btc.symbol} ≈ ${priceFmt(btc.price * be)}) and still cover it` : 'you could pay off everything now') : btc ? `crypto must rise this much to clear all debt (${btc.symbol} ≈ ${priceFmt(btc.price * be)})` : 'price rise needed to clear all debt'}</div></div>
          </div>
        </section>

        <section>
          <h2>Model result</h2>
          <div className="card verdict">
            <p className="headline">{v.headline}</p>
            <ul>{v.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <p className="note">{DISCLAIMER_NEAR_RESULTS}</p>
          </div>
        </section>

        <section>
          <h2>Compare: after 1, 2, 3 years</h2>
          <div className="tabs">{SCENARIOS.map(s => <button key={s} className={s === scenario ? 'on' : ''} onClick={() => setScenario(s)}>{s === 'bear' ? 'Prices fall' : s === 'flat' ? 'Prices flat' : 'Prices rise'}</button>)}</div>
          <p className="note">{scenario === 'bear' ? 'Crypto −50% over 12 months, stocks −25%, then flat.' : scenario === 'flat' ? 'Prices stay where they are today.' : 'Crypto doubles over 24 months, stocks +10% a year.'}</p>
          {sims.map(r => (
            <div className={'card strat' + (r.strategy === v.best ? ' best' : '')} key={r.strategy}>
              <div className="stitle">{STRATEGY_LABEL[r.strategy]}{r.strategy === v.best && <span className="pill">highest in this model when prices fall or stay flat</span>}</div>
              {r.strategy === 'lump' && <div className="s">Sells {usd(r.soldToday)} today.</div>}
              <table><thead><tr><th></th>{r.snapshots.map(s => <th key={s.month}>{s.month / 12} yr</th>)}</tr></thead>
                <tbody>
                  <tr><td>Stack left</td>{r.snapshots.map(s => <td key={s.month}>{usd(s.stackValue)}</td>)}</tr>
                  {btc && <tr><td>{btc.symbol} left</td>{r.snapshots.map(s => <td key={s.month}>{(s.units[btc.id] ?? 0).toFixed(btc.price > 1000 ? 4 : 1)}</td>)}</tr>}
                  <tr><td>Debt left</td>{r.snapshots.map(s => <td key={s.month}>{usd(s.debt)}</td>)}</tr>
                  <tr className="net"><td>You're worth</td>{r.snapshots.map(s => <td key={s.month} className={s.net < 0 ? 'bad' : 'good'}>{usd(s.net)}</td>)}</tr>
                </tbody></table>
              <div className="s">{r.runOutMonth ? `Stack runs out in month ${r.runOutMonth}. ` : ''}{r.debtFreeMonth !== null ? `Debt paid off in the model ${r.debtFreeMonth === 0 ? 'today' : 'in month ' + r.debtFreeMonth}. ` : ''}Interest paid over 3 yrs: {usd(r.interestPaid)}.</div>
            </div>
          ))}
        </section>

        {/* Cards are compiled out entirely while AFFILIATE_CARDS_ENABLED is false (no links, copy or config in the bundle). */}
        {AFFILIATE_CARDS_ENABLED && <ResultCards ctx={{ hasCrypto: !!btc, sellsCrypto: !!btc && sims.some(r => r.soldToday > 0 || r.rows.some(x => x.sold > 0)), taxPct: st.taxPct, topStrategy: v.best }} />}

        <section>
          <h2>Month by month (model)</h2>
          <div className="card">
            <p>See what gets sold each month and how your debt and stack change.</p>
            <button onClick={() => setShowPlan(s => !s)}>{showPlan ? 'Hide details' : 'Show month by month'}</button>
            {showPlan && (() => { const r = simulate(holdings, debts, st, v.best, scenario); return (
              <table className="plan"><thead><tr><th>Mo</th><th>Sell</th><th>Interest</th><th>Paid</th><th>Stack</th><th>Debt</th></tr></thead>
                <tbody>{r.rows.map(x => <tr key={x.month}><td>{x.month}</td><td>{usd(x.sold)}</td><td>{usd(x.interest)}</td><td>{usd(x.paid)}</td><td>{usd(x.stackValue)}</td><td>{usd(x.debt)}</td></tr>)}</tbody></table>); })()}
          </div>
          <div className="card locked">
            <p><b>Full report (PDF): coming soon.</b> A printable PDF of these model results: the month each debt is paid off and the modeled sales, for the numbers you entered. Math only, not advice.</p>
            <button className={interested ? 'ghost' : ''} onClick={registerInterest} disabled={interested}>{interested ? 'Thanks, noted 👍' : "I'd want this"}</button>
            <p className="note">We never ask for your email or see your numbers.</p>
          </div>
        </section>
      </>}

      <footer>
        <p><b>Not financial advice.</b> {DISCLAIMER_FOOTER}{AFFILIATE_CARDS_ENABLED ? DISCLAIMER_FOOTER_AFFILIATE : ''}</p>
        <p>If your stack runs out, the model adds any unpaid gap to your highest-rate debt. Tax is a simple % of each sale, not a real tax calculation.</p>
      </footer>
    </main>
  );
}
