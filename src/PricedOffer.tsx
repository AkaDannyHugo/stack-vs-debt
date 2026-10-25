import { useState } from 'react';
import { countPricedClick, countPricedEmail, type OfferPlace } from './analytics';

const BASE = import.meta.env.BASE_URL;
export const SUPPORT_EMAIL = 'stackvsdebt@mail.grokbot.com';
const MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Notify me: Full custom plan')}&body=${encodeURIComponent('Please email me once when the Full custom plan is ready.')}`;

// Honest priced button: the product is not on sale yet. Clicking counts one anonymous GoatCounter
// event and shows an email link; clicking the email link counts a second event. Nothing typed is sent.
export default function PricedOffer({ place }: { place: OfferPlace }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card offer" data-offer={place}>
      <button className="offer-btn" aria-expanded={open} onClick={() => { if (!open) countPricedClick(place); setOpen(true); }}>
        Full custom plan, $9, coming soon. Want it? Leave your email.
      </button>
      <p className="note">The plan is a printable PDF of the model results for the numbers you enter: the month each debt reaches $0 in the model and what the model sells each month. Price: $9 USD one-time, no subscription (see <a href={BASE + 'pricing/'}>Pricing</a>). It is not on sale yet. Math only, for education: not financial, tax or credit advice.</p>
      {open && <p className="offer-mail"><a href={MAILTO} onClick={() => countPricedEmail(place)}>Email {SUPPORT_EMAIL} to be told when it's ready</a></p>}
      <p className="note">Privacy: your email goes only to the Stack vs Debt inbox ({SUPPORT_EMAIL}). We use it once, to tell you when the plan is ready. We never sell or share it. To have it deleted, email that address and ask.</p>
    </div>
  );
}
