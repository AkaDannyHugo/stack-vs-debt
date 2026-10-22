// Contextual affiliate result cards. OFF by default.
// Turning this on needs: DHugo's yes via the COO on (1) the affiliate sign-ups and
// (2) the CLAIMS_CHECKLIST.md C4-A amendment; then real links replace the placeholders.
// Rules (C4-A): non-lending, non-exchange only; never inside the verdict; disclosure next to the link;
// no "we recommend"; cards never change any calculation.
import attributionConfig from './attribution.config.json';
export const AFFILIATE_CARDS_ENABLED = false;

export type CardId = 'tax' | 'wallet';
// Card links go through the attribution redirect: <ATTRIBUTION_BASE>/go/<slug>?from=<page>. The server-side
// allowlist (/workspace/apps/attribution/config/slugs.json) maps each slug to its target; targets are PLACEHOLDERS
// (example.com) until DHugo joins a program. One config file switches the base for both the app and static pages.
export function attributionBase(): string { return attributionConfig.ATTRIBUTION_BASE.replace(/\/$/, ''); }
export function goLink(id: CardId, fromPath: string = '/'): string {
  return `${attributionBase()}/go/${attributionConfig.GO_SLUGS[id]}?from=${encodeURIComponent(fromPath)}`;
}
// Card slugs: aff-tax = crypto tax software (shortlist in monetization/AFFILIATES.md), aff-wallet = hardware wallet.
// Links are built only at render time (ResultCards), so the bundle carries no link, URL or config while cards are off.
export const CARD_COPY: Record<CardId, { title: string; body: string; cta: string }> = {
  tax: {
    title: 'Tracking your cost basis for taxes?',
    body: 'In the US, selling crypto is usually a taxable event, and the gain depends on what was originally paid. Crypto tax software can import exchange and wallet history and produce a gains report. Rules vary; a tax professional can check a specific situation.',
    cta: 'Compare crypto tax software',
  },
  wallet: {
    title: 'Keeping the coins for now?',
    body: 'How coins are stored is a separate question from this math. A hardware wallet keeps the keys offline. It does not protect against price drops, and losing the recovery phrase can mean losing the coins.',
    cta: 'Read about hardware wallets',
  },
};

export interface CardContext {
  hasCrypto: boolean;     // at least one crypto holding with a value
  sellsCrypto: boolean;   // some modeled strategy sells crypto
  taxPct: number;         // "Tax set aside %": > 0 means the user expects a taxable gain on sales
  topStrategy: 'wait' | 'lump' | 'drip'; // highest-scoring path in the model
}

/** Which cards fit this result. Tax card: a sell result with a taxable gain. Wallet card: only a hold result. */
export function pickCards(c: CardContext, enabled: boolean = AFFILIATE_CARDS_ENABLED): CardId[] {
  if (!enabled || !c.hasCrypto) return [];
  const out: CardId[] = [];
  if (c.sellsCrypto && c.taxPct > 0) out.push('tax');
  if (c.topStrategy === 'wait') out.push('wallet');
  return out;
}
