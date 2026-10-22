import { goLink, CARD_COPY, pickCards, type CardContext } from './affiliates';
import { AFFILIATE_DISCLOSURE } from './disclaimer';

/** Never rendered while AFFILIATE_CARDS_ENABLED is false (App gates it, so it is compiled out). Placed after the comparison, never in the verdict. */
export default function ResultCards({ ctx, enabled }: { ctx: CardContext; enabled?: boolean }) {
  const cards = pickCards(ctx, enabled);
  if (!cards.length) return null;
  return (
    <section aria-label="Related tools (affiliate)">
      <h2>Related tools</h2>
      {cards.map(id => (
        <aside className="card aff" key={id} data-aff={id}>
          <p className="aff-title"><b>{CARD_COPY[id].title}</b></p>
          <p>{CARD_COPY[id].body}</p>
          <a href={goLink(id, '/')} rel="sponsored nofollow noopener" target="_blank">{CARD_COPY[id].cta} (affiliate) →</a>
          <p className="note disc">{AFFILIATE_DISCLOSURE}</p>
        </aside>
      ))}
    </section>
  );
}
