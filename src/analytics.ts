import { track, pageview } from '@vercel/analytics';
// Analytics only runs on Vercel hosting. Everywhere else these are harmless no-ops.
export const ON_VERCEL = typeof location !== 'undefined' && /\.vercel\.app$/.test(location.hostname);
export function countInterest(): void {
  if (!ON_VERCEL) return;
  try { track('full_plan_interest'); } catch { /* ignore */ }
  try { pageview({ path: '/interest/full-plan', route: '/interest/full-plan' }); } catch { /* ignore */ }
}
