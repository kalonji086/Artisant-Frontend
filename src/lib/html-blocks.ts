export type Run = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: 'h'; level: 1 | 2 | 3; runs: Run[] }
  | { type: 'p'; runs: Run[] }
  | { type: 'li'; runs: Run[]; marker: string };

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
};

const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/**
 * Convertit le HTML des documents légaux (titres, paragraphes, listes, gras/italique)
 * en blocs affichables nativement. Les autres balises sont ignorées, leur texte est conservé.
 */
export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const tokens = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/(<[^>]+>)/);

  let runs: Run[] = [];
  let current: 'h1' | 'h2' | 'h3' | 'p' | 'li' | null = null;
  let bold = 0;
  let italic = 0;
  const lists: { ordered: boolean; n: number }[] = [];
  let marker = '•';

  const flush = () => {
    const cleaned = runs.map((r) => (r.text === '\n' ? r : { ...r, text: r.text.replace(/\s+/g, ' ') }));
    if (cleaned.length) {
      cleaned[0].text = cleaned[0].text.replace(/^\s+/, '');
      cleaned[cleaned.length - 1].text = cleaned[cleaned.length - 1].text.replace(/\s+$/, '');
    }
    const filled = cleaned.filter((r) => r.text.length > 0);
    if (filled.length) {
      if (current === 'li') blocks.push({ type: 'li', runs: filled, marker });
      else if (current === 'h1' || current === 'h2' || current === 'h3') {
        blocks.push({ type: 'h', level: Number(current[1]) as 1 | 2 | 3, runs: filled });
      } else blocks.push({ type: 'p', runs: filled });
    }
    runs = [];
    current = null;
  };

  for (const token of tokens) {
    if (!token) continue;
    if (token[0] !== '<') {
      const text = decode(token);
      if (!text.trim() && runs.length === 0) continue;
      runs.push({ text, bold: bold > 0 || undefined, italic: italic > 0 || undefined });
      continue;
    }

    const m = /^<(\/?)([a-z0-9]+)/i.exec(token);
    if (!m) continue;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();

    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        flush();
        if (!closing) current = (tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'h3') as typeof current;
        break;
      case 'p':
      case 'div':
      case 'section':
      case 'blockquote':
        flush();
        if (!closing) current = 'p';
        break;
      case 'ul':
      case 'ol':
        flush();
        if (closing) lists.pop();
        else lists.push({ ordered: tag === 'ol', n: 0 });
        break;
      case 'li': {
        flush();
        if (!closing) {
          const list = lists[lists.length - 1];
          if (list?.ordered) {
            list.n += 1;
            marker = `${list.n}.`;
          } else marker = '•';
          current = 'li';
        }
        break;
      }
      case 'br':
        runs.push({ text: '\n' });
        break;
      case 'strong':
      case 'b':
        bold = Math.max(0, bold + (closing ? -1 : 1));
        break;
      case 'em':
      case 'i':
        italic = Math.max(0, italic + (closing ? -1 : 1));
        break;
      default:
        break;
    }
  }
  flush();
  return blocks;
}
