// Stack vs Debt: crypto-backed loan liquidation price and APR stress test.
// Pure math, no DOM, no network. All inputs are numbers the visitor types in.
// LTV = loan balance / collateral value. Thresholds are entered as percentages (e.g. 70 = 70%).

/** Loan balance after `months` months.
 *  interestMode 'paid'  : interest paid monthly in cash, balance stays at `loan`.
 *  interestMode 'added' : interest added to the loan monthly (compounds at APR/12). */
export function balanceAfter(loan, aprPct, months, interestMode) {
  if (interestMode === 'added') return loan * Math.pow(1 + aprPct / 100 / 12, months);
  return loan;
}

/** Total interest over the term. */
export function totalInterest(loan, aprPct, months, interestMode) {
  if (interestMode === 'added') return balanceAfter(loan, aprPct, months, 'added') - loan;
  return loan * (aprPct / 100 / 12) * months;
}

/** Coin price at which balance / (coins * price) reaches thresholdPct. */
export function priceAtLtv(balance, coins, thresholdPct) {
  if (!(coins > 0) || !(thresholdPct > 0)) return NaN;
  return balance / (coins * (thresholdPct / 100));
}

/** LTV (%) at a given coin price. */
export function ltvAt(balance, coins, price) {
  if (!(coins > 0) || !(price > 0)) return Infinity;
  return (balance / (coins * price)) * 100;
}

/** 'ok' | 'margin-call' | 'liquidation' for an LTV. */
export function statusFor(ltvPct, marginCallPct, liquidationPct) {
  const eps = 1e-9; // treat floating-point ties (e.g. 79.99999999) as reaching the threshold
  if (ltvPct >= liquidationPct - eps) return 'liquidation';
  if (ltvPct >= marginCallPct - eps) return 'margin-call';
  return 'ok';
}

/** One price-drop row: price, LTV, status, and what it takes (in this model) to bring LTV
 *  back down to the margin-call level: cash paid toward the loan, or extra coins posted. */
export function scenario(i, dropPct, balance) {
  const price = i.price * (1 - dropPct / 100);
  const ltv = ltvAt(balance, i.coins, price);
  const status = statusFor(ltv, i.marginCallPct, i.liquidationPct);
  const target = i.marginCallPct / 100;
  const cashToMarginCall = Math.max(0, balance - target * i.coins * price);
  const coinsToMarginCall = price > 0 ? Math.max(0, balance / (target * price) - i.coins) : Infinity;
  return { dropPct, price, collateralValue: i.coins * price, ltv, status, cashToMarginCall, coinsToMarginCall };
}

/** LTV and status at the end of the term (differs from today only when interest is added to the loan). */
function endOf(i, d, endBalance) {
  const endLtv = ltvAt(endBalance, i.coins, i.price * (1 - d / 100));
  return { endLtv, endStatus: statusFor(endLtv, i.marginCallPct, i.liquidationPct) };
}

/** Full stress test. i = { coins, price, loan, startLtvPct, marginCallPct, liquidationPct, aprPct, months, interestMode, dropPct } */
export function stressTest(i) {
  const errors = [];
  if (!(i.coins > 0)) errors.push('Enter a collateral amount above 0.');
  if (!(i.price > 0)) errors.push('Enter a coin price above 0.');
  if (!(i.loan > 0)) errors.push('Enter a loan amount above 0.');
  if (!(i.marginCallPct > 0 && i.liquidationPct > 0)) errors.push('Enter margin-call and liquidation LTVs above 0.');
  else if (i.marginCallPct >= i.liquidationPct) errors.push('The margin-call LTV is usually below the liquidation LTV. Check the two numbers.');
  if (!(i.aprPct >= 0)) errors.push('Enter an APR of 0 or more.');
  if (!(i.months > 0)) errors.push('Enter a term of at least 1 month.');
  if (errors.length) return { errors };

  const collateral = i.coins * i.price;
  const ltv0 = (i.loan / collateral) * 100;
  const endBalance = balanceAfter(i.loan, i.aprPct, i.months, i.interestMode);
  const liqPrice = priceAtLtv(i.loan, i.coins, i.liquidationPct);
  const mcPrice = priceAtLtv(i.loan, i.coins, i.marginCallPct);
  const liqPriceEnd = priceAtLtv(endBalance, i.coins, i.liquidationPct);
  const drops = [20, 40, 60];
  const custom = Number.isFinite(i.dropPct) ? Math.min(Math.max(i.dropPct, 0), 100) : null;
  if (custom !== null && !drops.includes(custom)) drops.push(custom);
  drops.sort((a, b) => a - b);
  const warnings = [];
  if (i.startLtvPct > 0 && ltv0 > i.startLtvPct + 1e-9) warnings.push(`This loan is ${ltv0.toFixed(1)}% of the collateral, above the ${i.startLtvPct}% starting LTV you entered.`);
  return {
    errors: [],
    warnings,
    collateral,
    startLtv: ltv0,
    startStatus: statusFor(ltv0, i.marginCallPct, i.liquidationPct),
    marginCallPrice: mcPrice,
    liquidationPrice: liqPrice,
    dropToMarginCallPct: (1 - mcPrice / i.price) * 100,
    dropToLiquidationPct: (1 - liqPrice / i.price) * 100,
    totalInterest: totalInterest(i.loan, i.aprPct, i.months, i.interestMode),
    endBalance,
    liquidationPriceEnd: liqPriceEnd,
    dropToLiquidationEndPct: (1 - liqPriceEnd / i.price) * 100,
    rows: drops.map(d => ({ ...scenario(i, d, i.loan), custom: d === custom && ![20, 40, 60].includes(d), ...endOf(i, d, endBalance) })),
  };
}

/** Made-up example inputs (hypothetical, not a quote from any lender). */
export const EXAMPLE = { coins: 0.5, price: 60000, loan: 12000, startLtvPct: 50, marginCallPct: 70, liquidationPct: 80, aprPct: 12, months: 12, interestMode: 'paid', dropPct: 50 };
