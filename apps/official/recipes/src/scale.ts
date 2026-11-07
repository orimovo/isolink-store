// Ingredient lines: their amounts, scaled to how many it serves.

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };
const VULGAR = '[½⅓⅔¼¾⅛]';
const MIXED = /^(\d+)\s+(\d+)\/(\d+)/;
const SLASH = /^(\d+)\/(\d+)/;
const PLAIN = new RegExp(`^(\\d+(?:[.,]\\d+)?)?(?:\\s*(${VULGAR}))?`);

/** The amount at the start of [line], and the rest of it. */
export function amountOf(line: string): { n: number | null; rest: string } {
  const l = line.trim();
  let m = MIXED.exec(l);
  if (m) return { n: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: l.slice(m[0].length) };
  m = SLASH.exec(l);
  if (m) return { n: Number(m[1]) / Number(m[2]), rest: l.slice(m[0].length) };
  m = PLAIN.exec(l);
  if (!m || !m[0].trim()) return { n: null, rest: l };
  const n = (m[1] ? Number(m[1].replace(',', '.')) : 0) + (m[2] ? FRACTIONS[m[2]] : 0);
  return { n, rest: l.slice(m[0].length) };
}

const nice = (n: number) => {
  const whole = Math.floor(n);
  const part = n - whole;
  for (const [ch, v] of Object.entries(FRACTIONS)) {
    if (Math.abs(part - v) < 0.02) return whole ? `${whole}${ch}` : ch;
  }
  if (part < 0.02) return String(whole);
  return String(Math.round(n * 10) / 10);
};

/** [line] with its amount times [k]. */
export function scaled(line: string, k: number) {
  if (k === 1) return line.trim();
  const { n, rest } = amountOf(line);
  return n === null || n === 0 ? line.trim() : `${nice(n * k)}${rest}`.trim();
}

export const linesOf = (text?: string) =>
  (text ?? '').split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);

/** A step's minutes, when it says how long ("simmer for 20 minutes"). */
export function minutesIn(step: string) {
  const m = /(\d+)\s*(?:-|–|to)?\s*(\d+)?\s*(?:min|minute|minutes|mins)\b/i.exec(step);
  if (m) return Number(m[2] ?? m[1]);
  const h = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i.exec(step);
  return h ? Math.round(Number(h[1]) * 60) : null;
}
