// What a line typed into the add bar says beyond its words: when, how many,
// a #tag and a link. Shared by Shopping, Todo and Notes (keep the copies the same).
import { t } from 'isolink';

export type Said = {
  /** The words left once the rest is taken out. */
  text: string;
  /** `YYYY-MM-DD`. */
  day?: string;
  /** `HH:MM`. */
  time?: string;
  qty?: string;
  tag?: string;
  link?: string;
};

const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const DAY_NAMES = [/*t*/'Sunday', /*t*/'Monday', /*t*/'Tuesday', /*t*/'Wednesday', /*t*/'Thursday', /*t*/'Friday', /*t*/'Saturday'];
export const MONTH_NAMES = [/*t*/'Jan', /*t*/'Feb', /*t*/'Mar', /*t*/'Apr', /*t*/'May', /*t*/'Jun', /*t*/'Jul', /*t*/'Aug',
  /*t*/'Sep', /*t*/'Oct', /*t*/'Nov', /*t*/'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const midnight = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
/** [days] after today. */
export const dayFrom = (now: number, days: number) => {
  const d = midnight(now);
  d.setDate(d.getDate() + days);
  return isoDay(d);
};
/** The next [weekday] (0 is Sunday), never today. */
export const nextWeekday = (now: number, weekday: number) => {
  const d = midnight(now);
  return dayFrom(now, (weekday - d.getDay() + 7) % 7 || 7);
};

/** Reads [line]. [qty] picks up "2 milk" and "milk x2"; [time] picks up "5pm"; [dates] off leaves days and times as words. */
export function read(line: string, now: number, qty = false, time = true, dates = true): Said {
  const out: Said = { text: line };
  let rest = line;
  const take = (re: RegExp, use: (m: RegExpExecArray) => boolean | void) => {
    const m = re.exec(rest);
    if (!m || use(m) === false) return;
    rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
  };

  take(/https?:\/\/\S+/i, (m) => { out.link = m[0]; });
  take(/(^|\s)#([\p{L}\d_-]+)/u, (m) => { out.tag = m[2]; });

  // When: a word for it, a weekday, "in 3 days", or "12 Nov".
  if (dates) take(/\b(?:by |on |due )?(today|tonight|tomorrow|tmrw|next week|this weekend|weekend)\b/i, (m) => {
    const w = m[1].toLowerCase();
    if (w === 'today') out.day = dayFrom(now, 0);
    else if (w === 'tonight') { out.day = dayFrom(now, 0); if (time) out.time = '19:00'; }
    else if (w === 'tomorrow' || w === 'tmrw') out.day = dayFrom(now, 1);
    else if (w === 'next week') out.day = nextWeekday(now, 1);
    else out.day = new Date(now).getDay() === 6 ? dayFrom(now, 0) : nextWeekday(now, 6);
  });
  if (dates && !out.day) {
    take(/\b(?:by |on |due )?(next )?(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b/i, (m) => {
      const weekday = WEEK.indexOf(m[2].toLowerCase());
      const days = (weekday - midnight(now).getDay() + 7) % 7 || 7;
      out.day = dayFrom(now, m[1] ? days + 7 : days);
    });
  }
  if (dates && !out.day) {
    take(/\bin (\d{1,3}) (day|week)s?\b/i, (m) => { out.day = dayFrom(now, Number(m[1]) * (/^w/i.test(m[2]) ? 7 : 1)); });
  }
  if (dates && !out.day) {
    take(/\b(?:by |on |due )?(\d{1,2})(?:st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i, (m) => {
      const today = midnight(now);
      const d = new Date(today.getFullYear(), MONTH.indexOf(m[2].toLowerCase()), Number(m[1]));
      if (d.getDate() !== Number(m[1])) return false;
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      out.day = isoDay(d);
    });
  }

  // A time: "5pm", "at 9", "18:30".
  if (dates && time) take(/\b(?:at )?(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b|\bat (\d{1,2})(?::(\d{2}))?\b|\b(\d{1,2}):(\d{2})\b/i, (m) => {
    let h: number;
    let min: string;
    if (m[1]) {
      h = Number(m[1]) % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0);
      min = m[2] ?? '00';
    } else if (m[4]) {
      h = Number(m[4]);
      // "at 6" is the evening.
      if (h > 0 && h < 8) h += 12;
      min = m[5] ?? '00';
    } else {
      h = Number(m[6]);
      min = m[7];
    }
    if (h > 23 || Number(min) > 59) return false;
    out.time = `${pad(h)}:${min}`;
  });

  if (qty) {
    take(/^\s*(\d{1,3})\s+(?=\S)/, (m) => { out.qty = m[1]; });
    if (!out.qty) take(/\s[x×](\d{1,3})\b/, (m) => { out.qty = m[1]; });
  }

  out.text = rest.replace(/\s+/g, ' ').trim();
  return out;
}

/** A day in a word or two: Today, Tomorrow, Friday, 12 Nov. */
export function dayWords(day: string, now: number) {
  const days = Math.round((Date.parse(day) - Date.parse(dayFrom(now, 0))) / 864e5);
  if (days === 0) return t('Today');
  if (days === 1) return t('Tomorrow');
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (days > 1 && days < 7) return t(DAY_NAMES[date.getDay()]);
  return `${d} ${t(MONTH_NAMES[m - 1])}`;
}

/** A link's site, for a chip: "bbc.co.uk". */
export const siteOf = (link: string) => link.replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0];
