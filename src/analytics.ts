import { track, pageview } from '@vercel/analytics';
// Analytics is optional and cookieless. Vercel Analytics runs only on *.vercel.app.
// GoatCounter runs anywhere its <script> tag is present in index.html (see the comment there).
export const ON_VERCEL = typeof location !== 'undefined' && /\.vercel\.app$/.test(location.hostname);
type GC = { count?: (o: { path: string; title?: string; event?: boolean }) => void };
export function countInterest(): void {
  // Counts a click only: no email, no form values, no numbers the visitor typed.
  try { (window as unknown as { goatcounter?: GC }).goatcounter?.count?.({ path: 'full-plan-interest', title: "I'd want this (Full plan)", event: true }); } catch { /* ignore */ }
  if (!ON_VERCEL) return;
  try { track('full_plan_interest'); } catch { /* ignore */ }
  try { pageview({ path: '/interest/full-plan', route: '/interest/full-plan' }); } catch { /* ignore */ }
}
