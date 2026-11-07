// Order keys between two others, the same way Isolink's own views make them.
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

export function between(a: string, b: string): string {
  let out = '';
  for (let i = 0; ; i++) {
    const lo = i < a.length ? DIGITS.indexOf(a[i]) : 0;
    const hi = b === '' || i >= b.length ? DIGITS.length : DIGITS.indexOf(b[i]);
    if (hi - lo > 1) return out + DIGITS[(lo + hi) >> 1];
    out += DIGITS[lo];
    if (b !== '' && i + 1 >= b.length && hi - lo === 1) b = '';
  }
}

export function last(rows: { pos?: string }[]): string {
  let top = '';
  for (const r of rows) if (typeof r.pos === 'string' && r.pos > top) top = r.pos;
  return top;
}
