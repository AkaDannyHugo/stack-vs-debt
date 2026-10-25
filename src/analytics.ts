import { track } from '@vercel/analytics';
// Analytics is optional and cookieless. Vercel Analytics runs only on *.vercel.app.
// GoatCounter runs anywhere its <script> tag is present in index.html (see the comment there).
export const ON_VERCEL = typeof location !== 'undefined' && /\.vercel\.app$/.test(location.hostname);
type GC = { count?: (o: { path: string; title?: string; event?: boolean }) => void };
export type OfferPlace = 'home' | 'results';
const gcEvent = (path: string, title: string) => { try { (window as unknown as { goatcounter?: GC }).goatcounter?.count?.({ path, title, event: true }); } catch { /* ignore */ } };
// Priced button (COO-20261024-14). Event names: priced-button-click-<place>, priced-email-click-<place>,
// plus priced-from-scenario/<slug> when the visitor arrived from a worked example. Counts clicks only.
export function countPricedClick(place: OfferPlace): void {
  gcEvent('priced-button-click-' + place, 'Priced button: Full custom plan $9 (' + place + ')');
  try {
    const slug = sessionStorage.getItem('stack-vs-debt:scenario');
    if (slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) gcEvent('priced-from-scenario/' + slug, 'Priced button from ' + slug);
  } catch { /* ignore */ }
  if (ON_VERCEL) { try { track('priced_button_click', { place }); } catch { /* ignore */ } }
}
export function countPricedEmail(place: OfferPlace): void {
  gcEvent('priced-email-click-' + place, 'Priced button: email link (' + place + ')');
  if (ON_VERCEL) { try { track('priced_email_click', { place }); } catch { /* ignore */ } }
}
