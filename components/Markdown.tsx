/**
 * A deliberately small Markdown renderer.
 *
 * It handles what this product's written content actually uses — paragraphs,
 * one heading level, bullet lists and bold — and renders React elements rather
 * than HTML. Nothing a doctor pastes can inject markup, because no markup is
 * ever interpreted: raw HTML comes out as the literal characters someone typed.
 * A general Markdown library would need sanitising to reach the same place.
 */

function inline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyPrefix}-${i}`} className="font-medium">{part.slice(2, -2)}</strong>
      : part,
  );
}

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks = source.trim().split(/\n{2,}/);

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const trimmed = block.trim();

        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={i} className="text-[15px] font-medium text-ink-2 mt-9 mb-3">
              {trimmed.slice(3)}
            </h2>
          );
        }

        if (/^[-*]\s/.test(trimmed)) {
          const items = trimmed.split('\n').map((l) => l.replace(/^[-*]\s+/, ''));
          return (
            <ul key={i} className="space-y-3 mb-6">
              {items.map((item, j) => (
                <li key={j} className="flex gap-3 text-[18px] leading-[1.5] font-light">
                  <span className="text-brand select-none">—</span>
                  <span>{inline(item, `${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={i} className="text-[18px] leading-[1.62] font-light mb-5">
            {inline(trimmed, String(i))}
          </p>
        );
      })}
    </div>
  );
}
