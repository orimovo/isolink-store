import {
  defineApp, Screen, Stack, Row, Box, Pressable, Text, TextField, SearchField, Button, IconButton, Icon, Fab,
  Chip, Image, Markdown, Editor, Rating, Slider, Stepper, Segmented, ProgressRing, Progress, Chart, Stat, Scanner,
  Scroll, Badge, Avatar, PersonPicker, Confetti, Draggable, DropZone, Svg, Popover, Dialog, Sheet,
  useQuery, useData, useLocal, useStore, useLayout, useMe, useNav, useNow, useDialog, useShare, useToast, usePlatform, useRef,
  useScroll, fetch, t, has,
} from 'isolink';
import s from './app.css';
import { ORNAMENTS, ORNAMENT_KINDS } from './ornaments';

type Book = {
  id: string; title: string; author?: string; status?: string; rating?: number; lent?: string; lentTo?: string; notes?: string;
  pages?: number; page?: number; cover?: string; isbn?: string; started?: string; finished?: string; tags?: string[];
  order?: number; _edited?: number;
};
/** An ornament on a shelf, standing after the book [after] (first when none). */
type Orn = { id: string; kind: string; shelf: string; after?: string };
type Session = { id: string; book: string; day: string; pages: number };
type Quote = { id: string; book: string; text: string; page?: number };
type Goal = { id: string; year: number; books: number };

const STATUSES: [string, string][] = [['reading', /*t*/'Reading'], ['want', /*t*/'Want to read'], ['done', /*t*/'Read']];
/** The state picker on a book's page, in the order a book goes through them. */
const PICK: [string, string][] = [['want', /*t*/'Want to read'], ['reading', /*t*/'Reading'], ['done', /*t*/'Read']];
const TINTS = ['#7c3aed', '#0ea5e9', '#f97316', '#16a34a', '#e11d48', '#0f766e', '#a16207', '#475569'];
const MONTHS = [/*t*/'Jan', /*t*/'Feb', /*t*/'Mar', /*t*/'Apr', /*t*/'May', /*t*/'Jun', /*t*/'Jul', /*t*/'Aug', /*t*/'Sep', /*t*/'Oct', /*t*/'Nov', /*t*/'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tintOf = (b: Book) => TINTS[[...b.title].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];
const progressOf = (b: Book) => (b.status === 'done' ? 1 : b.pages ? Math.min(1, (b.page ?? 0) / b.pages) : 0);

function useBooks() {
  const books = (useQuery('books', { limit: 500 }) as Book[]).sort((a, b) => (b._edited ?? 0) - (a._edited ?? 0));
  const sessions = useQuery('sessions', { sort: ['-day'], limit: 500 }) as Session[];
  const quotes = useQuery('quotes', { limit: 500 }) as Quote[];
  const goals = useQuery('goals', { limit: 50 }) as Goal[];
  const ornaments = (useQuery('ornaments', { limit: 200 }) as Orn[]).filter((o) => ORNAMENTS[o.kind]);
  const data = useData();
  const me = useMe();
  const now = useNow(3600000);
  const year = new Date(now).getFullYear();
  /** Where [b] is up to now: finished when it reaches the last page. */
  const readTo = (b: Book, page: number) => {
    const to = Math.max(0, b.pages ? Math.min(b.pages, page) : page);
    const read = to - (b.page ?? 0);
    if (read > 0) data.add('sessions', { book: b.id, day: iso(new Date()), pages: read });
    const done = !!b.pages && to >= b.pages;
    data.edit('books', b.id, {
      page: to,
      status: done ? 'done' : 'reading',
      started: b.started ?? iso(new Date()),
      ...(done && b.status !== 'done' ? { finished: iso(new Date()) } : {}),
    });
    return done;
  };
  return { books, sessions, quotes, goals, ornaments, ...data, year, readTo, canEdit: me.role !== 'view' };
}

/** A book's menu: held on a phone, right-clicked on a computer. */
function useBookMenu(bk: ReturnType<typeof useBooks>) {
  const nav = useNav();
  const dialog = useDialog();
  const lend = useLend(bk);
  return async (b: Book) => {
    if (!bk.canEdit) return;
    const pick = await dialog.menu([
      { id: 'edit', label: t('Edit'), icon: 'edit' },
      {
        id: 'move', label: t('Move to'), icon: 'swap_horiz',
        items: STATUSES.map(([st, label]) => ({ id: `to:${st}`, label: t(label), checked: (b.status ?? 'want') === st })),
      },
      { id: 'lend', label: b.lent ? t('Got it back') : t('Lend'), icon: 'handshake' },
      { divider: true },
      { id: 'delete', label: t('Delete'), icon: 'delete', danger: true },
    ]);
    if (pick === 'edit') nav.push('Edit', { id: b.id });
    if (typeof pick === 'string' && pick.startsWith('to:')) {
      const status = pick.slice(3);
      if (status !== (b.status ?? 'want')) {
        bk.edit('books', b.id, {
          status,
          ...(status === 'reading' && !b.started ? { started: iso(new Date()) } : {}),
          ...(status === 'done' && b.status !== 'done' ? { finished: iso(new Date()) } : {}),
        });
      }
    }
    if (pick === 'lend') await lend(b);
    if (pick === 'delete' && (await dialog.confirm({ title: t('Delete this book?'), ok: t('Delete'), danger: true }))) {
      for (const x of bk.sessions.filter((x) => x.book === b.id)) bk.remove('sessions', x.id);
      for (const x of bk.quotes.filter((x) => x.book === b.id)) bk.remove('quotes', x.id);
      bk.remove('books', b.id);
    }
  };
}

/** A book's cover, or a coloured one with its title on. */
function Cover({ b, width, onPress, onHold }: { b: Book; width: number; onPress?: () => void; onHold?: () => void }) {
  const h = Math.round(width * 1.5);
  return (
    <Pressable onPress={onPress} onLongPress={onHold} class={s.coverWrap}>
      {b.cover ? <Image src={b.cover} alt={b.title} ratio={2 / 3} class={s.cover} style={{ width }} /> : (
        <Box class={s.cover} style={{ width, height: h, background: tintOf(b) }}>
          <Text class={s.coverTitle} lines={4}>{b.title}</Text>
          {b.author ? <Text class={s.coverAuthor} lines={1}>{b.author}</Text> : null}
        </Box>
      )}
    </Pressable>
  );
}

// ----- books drawn as books: closed (want to read), open on its face
// (reading) and standing on a shelf (read) -----

/** The cover picture filling its box, or a coloured cover with the title on. */
function Face({ b, width = 96, back, bare, spine }: { b: Book; width?: number; back?: boolean; bare?: boolean; spine?: boolean }) {
  if (b.cover) return <Image src={b.cover} alt={b.title} class={back ? [s.fill, s.fillBack] : spine ? [s.fill, s.fillSpine] : s.fill} />;
  return (
    <Box class={s.plain} style={{ background: tintOf(b) }}>
      {bare || back ? null : (
        <Text class={s.coverTitle} lines={width < 80 ? 3 : 4} style={{ fontSize: Math.max(8, Math.round(width * 0.13)) }}>{b.title}</Text>
      )}
      {bare || back || !b.author || width < 80 ? null : <Text class={s.coverAuthor} lines={1}>{b.author}</Text>}
    </Box>
  );
}

/** Want to read: a closed book. Under a mouse the cover opens a little. */
function ClosedBook({ b, width, bare }: { b: Book; width: number; bare?: boolean }) {
  const [over, setOver] = useLocal(false);
  const h = Math.round(width * 1.5);
  return (
    <Box class={s.closed} style={{ width: width + 3, height: h + 2 }} onHover={bare ? undefined : setOver}>
      <Box class={s.board} />
      <Box class={s.leaves}>{bare ? null : [0, 1, 2, 3, 4, 5].map((i) => <Box key={i} class={s.line} />)}</Box>
      <Box class={over ? [s.face, s.faceOpen] : s.face} style={{ width, height: h }}>
        <Face b={b} width={width} bare={bare} />
        <Box class={s.hinge} />
      </Box>
    </Box>
  );
}

/** Reading: open on its face, back cover, spine and front. Under a mouse it closes a little. */
function OpenBook({ b, width, bare }: { b: Book; width: number; bare?: boolean }) {
  const [over, setOver] = useLocal(false);
  const h = Math.round(width * 1.5);
  const sp = Math.max(4, Math.round(width * 0.12));
  return (
    <Row class={s.open} style={{ height: h }} onHover={bare ? undefined : setOver}>
      <Box class={over ? [s.back, s.backShut] : s.back} style={{ width, height: h }}>
        <Face b={b} back />
        <Box class={s.backShade} />
        {bare ? null : (
          <Box class={s.blurb}>
            <Box class={s.blurbLine} style={{ width: Math.round(width * 0.6) }} />
            <Box class={s.blurbLine} style={{ width: Math.round(width * 0.5) }} />
            <Box class={s.blurbLine} style={{ width: Math.round(width * 0.56) }} />
            <Box class={s.barcode} />
          </Box>
        )}
      </Box>
      <Box class={s.spineOpen} style={{ width: sp, height: h }}>
        <Face b={b} bare />
        <Box class={s.spineShade} />
      </Box>
      <Box class={over ? [s.front, s.frontShut] : s.front} style={{ width, height: h }}>
        <Face b={b} width={width} bare={bare} />
        <Box class={s.frontShade} />
      </Box>
    </Row>
  );
}

const SPINE_HEIGHTS = [150, 138, 160, 146, 132, 156, 142];
const spineWidth = (b: Book) => Math.max(20, Math.min(44, Math.round((b.pages ?? 300) / 13)));

/** Read: the book's spine, a strip of its cover with the title down it. */
function Spine({ b, height, scale = 1, onPress, onHold }: { b: Book; height: number; scale?: number; onPress?: () => void; onHold?: () => void }) {
  return (
    <Pressable class={s.spine} style={{ width: Math.round(spineWidth(b) * scale), height }} onPress={onPress} onLongPress={onHold}>
      <Face b={b} bare spine />
      <Box class={s.spineDim} />
      <Box class={s.spineBand} />
      <Box class={s.spineTitle}><Text class={s.spineText} lines={1}>{b.title}</Text></Box>
      {b.rating ? <Text class={s.spineRate}>{`${b.rating}★`}</Text> : null}
    </Pressable>
  );
}

/** A shelf: its books stand on a plain line. */
function Shelf({ children }: { children?: unknown }) {
  return (
    <Box class={s.lineShelf}>
      <Scroll direction="horizontal">
        <Row align="end" gap={1} class={s.lineBooks}>{children}</Row>
      </Scroll>
      <Box class={s.shelfLine} />
    </Box>
  );
}

/** Read books on as many shelves as they need. */
function Bookcase({ books, onOpen, onHold }: { books: Book[]; onOpen: (b: Book) => void; onHold: (b: Book) => void }) {
  const width = useLayout().width;
  // Room on a shelf: the window less the side bar on a computer and the page's margins.
  const room = Math.max(160, Math.min(width >= 900 ? width - 340 : width, 900) - 84);
  const rows: Book[][] = [[]];
  let used = 0;
  for (const b of books) {
    const w = spineWidth(b) + 1;
    if (used + w > room && rows[rows.length - 1].length) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(b);
    used += w;
  }
  return (
    <Stack gap={10}>
      {rows.map((row, r) => (
        <Shelf key={r}>
          {row.map((b, i) => (
            <Spine key={b.id} b={b} height={SPINE_HEIGHTS[(i + r * 3) % SPINE_HEIGHTS.length]}
                   onPress={() => onOpen(b)} onHold={() => onHold(b)} />
          ))}
        </Shelf>
      ))}
    </Stack>
  );
}

/** A book as its state draws it, for the top of its page and the state picker. */
function BookAs({ b, status, width, bare }: { b: Book; status: string; width: number; bare?: boolean }) {
  if (status === 'want') return <ClosedBook b={b} width={width} bare={bare} />;
  if (status === 'reading') return <OpenBook b={b} width={Math.round(width * 0.85)} bare={bare} />;
  if (bare) {
    return (
      <Row align="end" gap={1}>
        {[[9, 38], [12, 44], [8, 34]].map(([w, h], i) => (
          <Box key={i} class={s.mini} style={{ width: w, height: h, opacity: i === 1 ? 1 : 0.7 }}><Face b={b} bare /></Box>
        ))}
      </Row>
    );
  }
  return (
    <Shelf>
      <Box class={s.leftover} style={{ width: 22, height: Math.round(width * 1.25) }} />
      <Spine b={b} height={Math.round(width * 1.36)} />
      <Box class={s.leftover} style={{ width: 26, height: Math.round(width * 1.2) }} />
    </Shelf>
  );
}

/** Moves a book to [status], dating when it was started and finished as it goes. */
function statusEdit(b: Book, status: string): Partial<Book> {
  return {
    status,
    ...(status === 'reading' && !b.started ? { started: iso(new Date()) } : {}),
    ...(status === 'done' && b.status !== 'done' ? { finished: b.finished ?? iso(new Date()), page: b.pages ?? b.page ?? undefined } : {}),
  };
}

// ----- the shelves: Reading open on the page, Want to read face out on a
// shelf, Read A to Z as spines with a letter bookend for each letter -----

/** A title as it's filed: without "The", "A" or "An" in front. */
const filed = (b: Book) => b.title.replace(/^(the|an?)\s+/i, '').toUpperCase();
const letterOf = (b: Book) => {
  const c = filed(b).normalize('NFD')[0] ?? '#';
  return c >= 'A' && c <= 'Z' ? c : '#';
};
const byFiled = (a: Book, b: Book) => (filed(a) < filed(b) ? -1 : filed(a) > filed(b) ? 1 : 0);
const byOrder = (a: Book, b: Book) => (a.order ?? 0) - (b.order ?? 0) || (b._edited ?? 0) - (a._edited ?? 0);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

type Drag = { t: 'book' | 'orn'; id: string; kind?: string } | null;
type Item = { t: 'book'; b: Book } | { t: 'orn'; o: Orn } | { t: 'stop'; letter: string };

/** Sizes on a phone and on a bigger screen. */
function useSizes() {
  const width = useLayout().width;
  const phone = width < 600;
  return {
    phone,
    open: phone ? 54 : 66,
    closed: phone ? 70 : 92,
    spine: phone ? 0.82 : 1,
    orn: phone ? 0.9 : 1.15,
    // Room along a shelf: the page less its margins and the A to Z down the side.
    room: Math.max(220, Math.min(width, 1400) - (phone ? 70 : 120)),
  };
}

const ornSize = (kind: string, k: number): [number, number] => {
  const [w, h] = ORNAMENTS[kind];
  return [Math.round(w * k), Math.round(h * k)];
};

function Ornament({ kind, k }: { kind: string; k: number }) {
  const [w, h] = ornSize(kind, k);
  return <Svg src={ORNAMENTS[kind][2]} width={w} height={h} />;
}

/** The metal bookend before each letter's books, with the letter on. */
function Stopper({ letter, phone }: { letter: string; phone: boolean }) {
  return (
    <Box class={phone ? [s.stop, s.stopPhone] : s.stop} mark={`az:${letter}`}>
      <Text class={s.stopLetter} style={{ width: phone ? 19 : 24 }}>{letter}</Text>
      <Box class={s.stopFoot} />
    </Box>
  );
}

/** A dashed outline where books go, on a shelf with none. */
function Placeholder({ shelf, z }: { shelf: string; z: ReturnType<typeof useSizes> }) {
  if (shelf === 'reading') return <Box class={[s.ph, s.phOpen]} style={{ width: Math.round(z.open * 2.12), height: Math.round(z.open * 1.5) }} />;
  if (shelf === 'want') return <Box class={s.ph} style={{ width: z.closed, height: Math.round(z.closed * 1.5) }} />;
  return (
    <Row align="end" gap={1}>
      {[[30, 150], [24, 136], [36, 156]].map(([w, h], i) => (
        <Box key={i} class={[s.ph, s.phSpine]} style={{ width: Math.round(w * z.spine), height: Math.round(h * z.spine) }} />
      ))}
    </Row>
  );
}

/** A book in the hand, between shelves: lying flat. */
function Flat({ b, width }: { b: Book; width: number }) {
  return (
    <Box class={s.flat} style={{ width, height: Math.round(width * 1.5) }}>
      <Face b={b} width={width} />
    </Box>
  );
}

function ShelfTab({ bk, onOpen, drag, setDrag }: {
  bk: ReturnType<typeof useBooks>; onOpen: (b: Book) => void; drag: Drag; setDrag: (d: Drag) => void;
}) {
  const nav = useNav();
  const menu = useBookMenu(bk);
  const scroll = useScroll();
  const z0 = useSizes();
  // Room along a shelf, as wide as the shelves are drawn (less their ends).
  const [width, setWidth] = useLocal(0);
  const z = width ? { ...z0, room: Math.max(160, width - 12) } : z0;
  const [q, setQ] = useLocal('');
  const want = q.trim().toLowerCase();
  const match = (b: Book) => !want || [b.title, b.author ?? '', ...(b.tags ?? [])].some((x) => x.toLowerCase().includes(want));
  const goal = bk.goals.find((g) => g.year === bk.year);
  const doneThisYear = bk.books.filter((b) => b.status === 'done' && (b.finished ?? '').startsWith(String(bk.year))).length;
  // Where a dragged thing would land: the shelf, and the book it would go before ('' at the end).
  const overRef = useRef<{ shelf: string; before: string } | null>(null);
  const [over, setOver] = useLocal<{ shelf: string; before: string } | null>(null);
  const enter = (shelf: string, before: string) => {
    overRef.current = { shelf, before };
    setOver(overRef.current);
  };
  const leave = (shelf: string, before: string) => {
    const o = overRef.current;
    if (o && o.shelf === shelf && o.before === before) {
      overRef.current = null;
      setOver(null);
    }
  };

  const reading = bk.books.filter((b) => b.status === 'reading' && match(b)).sort(byOrder);
  const wantBooks = bk.books.filter((b) => (b.status ?? 'want') === 'want' && match(b)).sort(byOrder);
  const readBooks = bk.books.filter((b) => b.status === 'done' && match(b)).sort(byFiled);
  const dragged = drag?.t === 'book' ? bk.books.find((b) => b.id === drag.id) : undefined;

  /** A shelf's books with its ornaments after the books they follow, and for Read a bookend at each new letter. */
  const itemsOf = (shelf: string, books: Book[]): Item[] => {
    const orns = want ? [] : bk.ornaments.filter((o) => o.shelf === shelf);
    const ids = new Set(books.map((b) => b.id));
    const out: Item[] = orns.filter((o) => !o.after).map((o) => ({ t: 'orn', o }));
    let letter = '';
    for (const b of books) {
      if (shelf === 'done' && letterOf(b) !== letter) {
        letter = letterOf(b);
        out.push({ t: 'stop', letter });
      }
      out.push({ t: 'book', b });
      for (const o of orns) if (o.after === b.id) out.push({ t: 'orn', o });
    }
    for (const o of orns) if (o.after && !ids.has(o.after)) out.push({ t: 'orn', o });
    return out;
  };

  const widthOf = (shelf: string, it: Item) => {
    if (it.t === 'stop') return z.phone ? 25 : 33;
    if (it.t === 'orn') return ornSize(it.o.kind, z.orn)[0] + 12;
    if (shelf === 'reading') return Math.round(z.open * 2.12) + 16;
    if (shelf === 'want') return z.closed + 7;
    return Math.round(spineWidth(it.b) * z.spine) + 2;
  };
  /** Items in rows that fit the shelf; a bookend never ends a row on its own. */
  const rowsOf = (shelf: string, items: Item[]) => {
    const rows: Item[][] = [[]];
    let used = 0;
    items.forEach((it, i) => {
      const w = widthOf(shelf, it);
      const need = it.t === 'stop' && items[i + 1] ? w + widthOf(shelf, items[i + 1]) : w;
      if (used + need > z.room && rows[rows.length - 1].length) {
        rows.push([]);
        used = 0;
      }
      rows[rows.length - 1].push(it);
      used += w;
    });
    return rows;
  };

  const phWidth = (shelf: string) =>
    shelf === 'reading' ? Math.round(z.open * 2.12) : shelf === 'want' ? z.closed : Math.round(92 * z.spine) + 2;

  /** How wide the gap opens: as wide as what's coming. */
  const gapWidth = (shelf: string) => {
    if (!drag) return 0;
    if (drag.t === 'orn') return ornSize(drag.kind ?? 'plant', z.orn)[0] + 12;
    if (!dragged) return 0;
    return widthOf(shelf, { t: 'book', b: dragged });
  };
  /** The book the gap opens before on [shelf]: Read keeps A to Z, so a book goes where its title files. */
  const gapBefore = (shelf: string) => {
    if (!over || over.shelf !== shelf || !drag) return null;
    if (shelf === 'done' && dragged) {
      const next = readBooks.find((b) => b.id !== dragged.id && byFiled(dragged, b) < 0);
      return next ? next.id : '';
    }
    return over.before;
  };

  /** Puts [id] before [before] in a shelf kept in the person's order. */
  const reorder = (list: Book[], id: string, before: string) => {
    const rest = list.filter((b) => b.id !== id);
    const at = before ? rest.findIndex((b) => b.id === before) : -1;
    const ids = rest.map((b) => b.id);
    ids.splice(at < 0 ? ids.length : at, 0, id);
    ids.forEach((x, i) => {
      const b = bk.books.find((y) => y.id === x);
      if (b && b.order !== i) bk.edit('books', x, { order: i });
    });
  };

  const drop = (shelf: string, before: string, data: { t: string; id?: string; kind?: string }) => {
    overRef.current = null;
    setOver(null);
    setDrag(null);
    if (!bk.canEdit || !data) return;
    if (data.t === 'book' && data.id) {
      const b = bk.books.find((x) => x.id === data.id);
      if (!b) return;
      const status = shelf === 'done' ? 'done' : shelf;
      if ((b.status ?? 'want') !== status) bk.edit('books', b.id, statusEdit(b, status));
      if (shelf === 'reading') reorder(bk.books.filter((x) => x.status === 'reading').sort(byOrder), b.id, before);
      if (shelf === 'want') reorder(bk.books.filter((x) => (x.status ?? 'want') === 'want').sort(byOrder), b.id, before);
      return;
    }
    if (data.t === 'orn' && shelf !== 'reading') {
      const books = shelf === 'want' ? wantBooks : readBooks;
      const at = before ? books.findIndex((x) => x.id === before) : books.length;
      const after = at > 0 ? books[at - 1].id : at < 0 && books.length ? books[books.length - 1].id : '';
      if (data.id) bk.edit('ornaments', data.id, { shelf, after: after || null });
      else if (data.kind) bk.add('ornaments', { kind: data.kind, shelf, after: after || null });
    }
  };

  /** What a book looks like in the hand over each shelf: open in Reading, face out on Want to read, a spine on Read. */
  const forms = (b: Book) => ({
    reading: <OpenBook b={b} width={z.open} bare />,
    want: <ClosedBook b={b} width={z.closed} bare />,
    done: <Spine b={b} height={Math.round(146 * z.spine)} scale={z.spine} />,
  });

  const shelfHeight = (shelf: string) =>
    shelf === 'reading' ? Math.round(z.open * 1.5) + 28 : shelf === 'want' ? Math.round(z.closed * 1.5) + 8 : Math.round(166 * z.spine);

  const zone = (shelf: string, before: string, key: string, child: unknown, gap: string | null, width?: number) => (
    <DropZone key={key} kind={shelf} tint={false}
              onEnter={() => enter(shelf, before)} onLeave={() => leave(shelf, before)}
              onDrop={(d: any) => drop(shelf, before, d)}>
      <Row align="end" style={{ height: shelfHeight(shelf), width }}>
        <Box class={s.gap} style={{ width: gap === before ? gapWidth(shelf) : 0 }} />
        {child}
      </Row>
    </DropZone>
  );

  const bookIn = (shelf: string, b: Book, i: number) => {
    const inner =
      shelf === 'reading' ? (
        <Stack gap={4} class={s.readingBook} style={{ width: z.open * 2 + Math.max(4, Math.round(z.open * 0.12)) }}>
          <OpenBook b={b} width={z.open} />
          <Progress value={progressOf(b)} />
        </Stack>
      ) : shelf === 'want' ? (
        <Stack gap={4} align="start">
          <ClosedBook b={b} width={z.closed} />
          {b.lent ? <Badge label={t('Lent')} tone="warning" /> : null}
        </Stack>
      ) : (
        <Spine b={b} height={Math.round(SPINE_HEIGHTS[i % SPINE_HEIGHTS.length] * z.spine)} scale={z.spine} />
      );
    return (
      <Draggable data={{ t: 'book', id: b.id }} away="collapse" lifted={<Flat b={b} width={Math.round(z.closed * 0.8)} />}
                 forms={forms(b)} onDragStart={() => setDrag({ t: 'book', id: b.id })} onDragEnd={() => setDrag(null)}>
        <Pressable align="start" onPress={() => onOpen(b)} onLongPress={() => menu(b)}>{inner}</Pressable>
      </Draggable>
    );
  };

  const shelf = (key: string, items: Item[], placeholder: boolean) => {
    // Rows need the shelf's width: nothing until it's known (the first frame).
    if (!width) return null;
    const rows = rowsOf(key, items);
    const gap = gapBefore(key);
    return rows.map((row, r) => {
      // Each book takes what's dropped on it, before it; a bookend, before the book after it.
      const cells = row.map((it, i) => {
        if (it.t === 'stop') {
          const next = row[i + 1];
          return zone(key, next && next.t === 'book' ? next.b.id : '', `s:${it.letter}`, <Stopper letter={it.letter} phone={z.phone} />, null);
        }
        if (it.t === 'orn') {
          const next = row.slice(i + 1).find((x) => x.t === 'book') as { b: Book } | undefined;
          return zone(key, next ? next.b.id : '', `o:${it.o.id}`, (
            <Draggable data={{ t: 'orn', id: it.o.id, kind: it.o.kind }} away="collapse"
                       onDragStart={() => setDrag({ t: 'orn', id: it.o.id, kind: it.o.kind })} onDragEnd={() => setDrag(null)}>
              <Box class={s.orn}><Ornament kind={it.o.kind} k={z.orn} /></Box>
            </Draggable>
          ), null);
        }
        return zone(key, it.b.id, it.b.id, bookIn(key, it.b, i + r * 3), gap);
      });
      const last = r === rows.length - 1;
      const ph = last && placeholder && !(over && over.shelf === key);
      // The end of the last row takes what's dropped past the books: as wide as what's left of it.
      const used = row.reduce((n, it) => n + widthOf(key, it), 0) + (ph ? phWidth(key) : 0);
      const opening = gap !== null && row.some((it) => it.t === 'book' && it.b.id === gap) ? gapWidth(key) : 0;
      const rest = Math.max(32, z.room - used - opening - (gap === '' && last ? gapWidth(key) : 0));
      // Wraps rather than spill over while the page is still settling on its width.
      return (
        <Box key={`${key}:${r}`} class={key === 'reading' ? s.pageRow : s.lineShelf}>
          <Row align="end" wrap class={s.lineBooks}>
            {cells}
            {ph ? <Row align="end" style={{ height: shelfHeight(key) }}><Placeholder shelf={key} z={z} /></Row> : null}
            {last ? zone(key, '', 'end', null, gap, rest + (gap === '' ? gapWidth(key) : 0)) : null}
          </Row>
          {key === 'reading' ? null : <Box class={s.shelfLine} />}
        </Box>
      );
    });
  };

  if (bk.books.length === 0) {
    return (
      <Stack align="center" gap={10} class={s.empty}>
        <Text class={s.bigEmoji}>📚</Text>
        <Text tone="muted">{t('No books yet')}</Text>
      </Stack>
    );
  }
  const have = new Set(readBooks.map(letterOf));
  const head = (label: string, n: number) => (
    <Row align="center" gap={6} class={s.shelfHead}>
      <Text class={s.shelfTitle}>{t(label)}</Text>
      <Text class={s.sub}>{String(n)}</Text>
    </Row>
  );
  return (
    <Row align="start" gap={6}>
      <Stack grow gap={2} onWidth={setWidth}>
        <SearchField value={q} placeholder={t('Search')} onChange={setQ} />
        {!want && goal ? (
          <Pressable class={s.goal} onPress={() => nav.push('Goal', {})}>
            <ProgressRing value={Math.min(1, doneThisYear / goal.books)} size={54} stroke={6} label={String(doneThisYear)} />
            <Stack grow>
              <Text bold>{t('{p0} of {p1} books', { p0: doneThisYear, p1: goal.books })}</Text>
              <Text class={s.sub}>{String(bk.year)}</Text>
            </Stack>
          </Pressable>
        ) : null}
        {head('Reading', reading.length)}
        {shelf('reading', reading.map((b) => ({ t: 'book', b }) as Item), !reading.length)}
        {head('Want to read', wantBooks.length)}
        {shelf('want', itemsOf('want', wantBooks), !wantBooks.length)}
        {head('Read', readBooks.length)}
        {shelf('done', itemsOf('done', readBooks), !readBooks.length)}
      </Stack>
      {readBooks.length > 8 ? (
        <Stack class={s.az}>
          {LETTERS.filter((l) => l !== '#' || have.has('#')).map((l) => (
            <Pressable key={l} class={have.has(l) ? s.azLetter : [s.azLetter, s.azOff]}
                       onPress={() => {
                         const at = LETTERS.slice(LETTERS.indexOf(l)).find((x) => have.has(x));
                         if (at) scroll.to(`az:${at}`);
                       }}>
              <Text class={s.azText}>{l}</Text>
            </Pressable>
          ))}
        </Stack>
      ) : null}
    </Row>
  );
}

/** The ornaments to stand on the shelves, in a flyout from the top bar: drag one out onto a shelf. */
function OrnamentsButton({ setDrag }: { setDrag: (d: Drag) => void }) {
  const [open, setOpen] = useLocal(false);
  const z = useSizes();
  return (
    <Popover open={open} onClose={() => setOpen(false)} width={z.phone ? 260 : 300}
             anchor={<Button variant="plain" onPress={() => setOpen(!open)}>{t('Ornaments')}</Button>}>
      <Row wrap gap={2} justify="center" class={s.flyout}>
        {ORNAMENT_KINDS.map((kind) => (
          <Draggable key={kind} data={{ t: 'orn', kind }} lifted={<Ornament kind={kind} k={z.orn} />}
                     onDragStart={() => { setOpen(false); setDrag({ t: 'orn', id: '', kind }); }} onDragEnd={() => setDrag(null)}>
            <Box class={s.flyItem}><Ornament kind={kind} k={0.75} /></Box>
          </Draggable>
        ))}
      </Row>
    </Popover>
  );
}

/** Picked up off a shelf, an ornament can be dropped here to take it off. */
function RemoveBar({ bk, setDrag }: { bk: ReturnType<typeof useBooks>; setDrag: (d: Drag) => void }) {
  return (
    <DropZone kind="remove" onDrop={(d: any) => {
      setDrag(null);
      if (d && d.t === 'orn' && d.id) bk.remove('ornaments', d.id);
    }}>
      <Row align="center" justify="center" gap={2} class={s.remove}>
        <Icon name="delete" />
        <Text bold>{t('Remove')}</Text>
      </Row>
    </DropZone>
  );
}

function StatsTab({ bk }: { bk: ReturnType<typeof useBooks> }) {
  const nav = useNav();
  const menu = useBookMenu(bk);
  const finished = bk.books.filter((b) => b.status === 'done' && (b.finished ?? '').startsWith(String(bk.year)));
  const pages = bk.sessions.filter((x) => x.day.startsWith(String(bk.year))).reduce((n, x) => n + x.pages, 0);
  const rated = finished.filter((b) => b.rating);
  const days = new Set(bk.sessions.map((x) => x.day));
  let streak = 0;
  for (let d = new Date(); days.has(iso(d)) || (streak === 0 && days.has(iso(new Date(d.getTime() - 864e5)))); d = new Date(d.getTime() - 864e5)) {
    if (days.has(iso(d))) streak++;
  }
  const goal = bk.goals.find((g) => g.year === bk.year);
  return (
    <>
      <Pressable class={s.goal} onPress={() => nav.push('Goal', {})}>
        <ProgressRing value={goal ? Math.min(1, finished.length / goal.books) : 0} size={64} stroke={7} label={String(finished.length)} />
        <Stack grow>
          <Text bold>{goal ? t('{p0} of {p1} books', { p0: finished.length, p1: goal.books }) : t('Set a goal')}</Text>
          <Text class={s.sub}>{String(bk.year)}</Text>
        </Stack>
        <Icon name="chevron_right" />
      </Pressable>
      <Row gap={8}>
        <Stack grow class={s.stat}><Stat label={t('Pages')} value={String(pages)} /></Stack>
        <Stack grow class={s.stat}><Stat label={t('Days in a row')} value={String(streak)} /></Stack>
        <Stack grow class={s.stat}>
          <Stat label={t('Rating')} value={rated.length ? (rated.reduce((n, b) => n + (b.rating ?? 0), 0) / rated.length).toFixed(1) : '–'} />
        </Stack>
      </Row>
      <Box class={s.panel}>
        <Text class={s.h}>{t('Books a month')}</Text>
        <Chart kind="bar" height={120} data={MONTHS.map((m, i) => ({
          label: t(m), value: finished.filter((b) => Number((b.finished ?? '').slice(5, 7)) === i + 1).length,
        }))} />
      </Box>
      {finished.length > 0 && (
        <>
          <Text class={s.h}>{t('Read this year')}</Text>
          <Bookcase books={finished} onOpen={(b) => nav.push('Book', { id: b.id })} onHold={menu} />
        </>
      )}
    </>
  );
}

function QuotesTab({ bk }: { bk: ReturnType<typeof useBooks> }) {
  const nav = useNav();
  const share = useShare();
  if (!bk.quotes.length) {
    return (
      <Stack align="center" gap={10} class={s.empty}>
        <Text class={s.bigEmoji}>❝</Text>
        <Text tone="muted">{t('No quotes yet')}</Text>
      </Stack>
    );
  }
  return (
    <Stack gap={10}>
      {bk.quotes.map((q) => {
        const b = bk.books.find((x) => x.id === q.book);
        return (
          <Pressable key={q.id} class={s.quote} onPress={() => b && nav.push('Book', { id: b.id })}>
            <Text class={s.quoteText}>{`“${q.text}”`}</Text>
            <Row align="center">
              <Text class={s.sub} grow>{[b?.title, b?.author, q.page ? t('p. {p0}', { p0: q.page }) : ''].filter(Boolean).join(' · ')}</Text>
              <IconButton icon="share" label={t('Share')} onPress={() => share.share(`“${q.text}” — ${b?.author ?? b?.title ?? ''}`)} />
            </Row>
          </Pressable>
        );
      })}
    </Stack>
  );
}

/** A page of an open book: lines of print, and the person's quotes from it written in by hand and circled. */
function Page({ n, side, width, quotes, first }: { n: number; side: 'l' | 'r'; width: number; quotes: Quote[]; first?: boolean }) {
  const lines = (k: number, from = 0) => Array.from({ length: k }, (_, i) => (
    <Box key={i + from} class={s.print} style={{ width: Math.round((width - 28) * [0.96, 0.88, 0.92, 0.7, 0.94, 0.84, 0.9, 0.6, 0.86, 0.93, 0.78][(i + from + n) % 11]) }} />
  ));
  const count = Math.floor((Math.round(width * 1.35) - 64) / 11) - (first ? 2 : 0);
  return (
    <Stack gap={9} class={side === 'l' ? [s.pg, s.pgL] : [s.pg, s.pgR]} style={{ width, height: Math.round(width * 1.35) }}>
      {first ? <Text class={s.chapter}>{t('Chapter {p0}', { p0: Math.max(1, Math.round(n / 30)) })}</Text> : null}
      {quotes.length ? (
        <>
          {lines(2)}
          {quotes.map((q) => (
            <Box key={q.id} class={s.marked}>
              <Text class={s.hand}>{q.text}</Text>
              <Box class={s.ring} />
            </Box>
          ))}
          {lines(Math.max(2, count - 4 - quotes.length * 2), 2)}
        </>
      ) : lines(count)}
      <Box grow />
      <Row justify={side === 'l' ? 'start' : 'end'} class={s.pageFoot}><Text class={s.pageNo}>{String(n)}</Text></Row>
    </Stack>
  );
}

/** A book opened from the shelves: paged where it's up to when it's being read, with the state picker and stars. */
function BookPop({ bk, id, onClose }: { bk: ReturnType<typeof useBooks>; id: string | null; onClose: () => void }) {
  const nav = useNav();
  const dialog = useDialog();
  const z = useSizes();
  const [page, setPage] = useLocal<number | null>(null);
  const [party, setParty] = useLocal(false);
  const b = id ? bk.books.find((x) => x.id === id) : undefined;
  const close = () => { setPage(null); onClose(); };
  const body = !b ? <Box /> : (() => {
    const quotes = bk.quotes.filter((q) => q.book === b.id);
    const at = page ?? b.page ?? 0;
    const left = Math.max(1, at % 2 ? at : at || 1);
    const pw = z.phone ? 128 : 200;
    const addQuote = async () => {
      const text = await dialog.prompt({ title: t('Quote'), value: '' });
      if (text && text.trim()) bk.add('quotes', { book: b.id, text: text.trim().slice(0, 2000), page: left });
    };
    return (
      <Stack gap={10}>
        {party && <Confetti />}
        <Row align="center" gap={8}>
          <Stack grow>
            <Text variant="title" lines={2}>{b.title}</Text>
            <Text class={s.sub}>{[b.author, b.pages ? t('{p0} pages', { p0: b.pages }) : ''].filter(Boolean).join(' · ')}</Text>
          </Stack>
          <IconButton icon="open_in_full" label={t('More')} onPress={() => { close(); nav.push('Book', { id: b.id }); }} />
        </Row>
        {b.status === 'reading' ? (
          <>
            <Row align="center" justify="center" gap={z.phone ? 1 : 3}>
              <IconButton icon="chevron_left" label={t('Back')} disabled={left <= 1} onPress={() => setPage(Math.max(0, left - 2))} />
              <Box class={s.spread} style={{ background: tintOf(b) }}>
                <Row transition="fade" key={left}>
                  <Page n={left} side="l" width={pw} first={left % 30 < 2} quotes={quotes.filter((q) => q.page === left)} />
                  <Page n={left + 1} side="r" width={pw} quotes={quotes.filter((q) => q.page === left + 1)} />
                </Row>
                <Box class={s.ribbon} style={{ left: pw + 1 }} />
              </Box>
              <IconButton icon="chevron_right" label={t('Next')} disabled={!!b.pages && left + 2 > b.pages}
                          onPress={() => setPage(b.pages ? Math.min(b.pages, left + 2) : left + 2)} />
            </Row>
            {b.pages && bk.canEdit ? (
              <Row align="center" gap={3}>
                <Text class={s.sub}>{t('Page {p0} of {p1}', { p0: at, p1: b.pages })}</Text>
                <Stack grow><Slider value={at} min={0} max={b.pages} step={1} onChange={(v: number) => setPage(Math.round(v))} /></Stack>
                {page !== null && page !== (b.page ?? 0) ? (
                  <Button onPress={() => { if (bk.readTo(b, page)) setParty(true); setPage(null); }}>{t('Save')}</Button>
                ) : (
                  <Button variant="tonal" onPress={addQuote}>{t('Quote')}</Button>
                )}
              </Row>
            ) : null}
          </>
        ) : (
          <Row align="center" justify="center" gap={8} class={s.popHero}>
            <BookAs b={b} status={b.status ?? 'want'} width={z.phone ? 96 : 120} />
            {b.status === 'done' ? (
              <Rating value={b.rating ?? 0} onChange={bk.canEdit ? (rating: number) => bk.edit('books', b.id, { rating }) : undefined} />
            ) : null}
          </Row>
        )}
        {bk.canEdit ? (
          <Row gap={6}>
            {PICK.map(([status, label]) => (
              <Pressable key={status} class={(b.status ?? 'want') === status ? [s.tile, s.tileOn] : s.tile}
                         onPress={() => { if ((b.status ?? 'want') !== status) bk.edit('books', b.id, statusEdit(b, status)); }}>
                <Box class={s.glyph}><BookAs b={{ id: '', title: '' }} status={status} width={24} bare /></Box>
                <Text class={s.tileText}>{t(label)}</Text>
              </Pressable>
            ))}
          </Row>
        ) : null}
      </Stack>
    );
  })();
  return z.phone
    ? <Sheet open={!!b} onClose={close}>{body}</Sheet>
    : <Dialog open={!!b} onClose={close} width={z.phone ? undefined : 680}>{body}</Dialog>;
}

function Home() {
  const bk = useBooks();
  const nav = useNav();
  const [tab, setTab] = useStore<string>('tab', 'shelf');
  const [drag, setDrag] = useLocal<Drag>(null);
  const [pop, setPop] = useLocal<string | null>(null);
  const shelves = tab === 'shelf';
  return (
    <Screen
      title={t('Reading list')}
      maxWidth={shelves ? 0 : undefined}
      tabs={[
        { value: 'shelf', label: t('Shelf'), icon: 'menu_book' },
        { value: 'stats', label: t('Stats'), icon: 'insights' },
        { value: 'quotes', label: t('Quotes'), icon: 'format_quote' },
      ]}
      tab={tab}
      onTab={setTab}
      actions={shelves && bk.canEdit ? <OrnamentsButton setDrag={setDrag} /> : undefined}
      footer={drag?.t === 'orn' && drag.id ? <RemoveBar bk={bk} setDrag={setDrag} /> : undefined}
      fab={bk.canEdit && shelves ? <Fab icon="add" onPress={() => nav.push('Add', {})} /> : undefined}
    >
      {shelves && <ShelfTab bk={bk} onOpen={(b) => setPop(b.id)} drag={drag} setDrag={setDrag} />}
      {tab === 'stats' && <StatsTab bk={bk} />}
      {tab === 'quotes' && <QuotesTab bk={bk} />}
      <BookPop bk={bk} id={pop} onClose={() => setPop(null)} />
    </Screen>
  );
}

function BookScreen() {
  const nav = useNav();
  const bk = useBooks();
  const dialog = useDialog();
  const lend = useLend(bk);
  const { id } = nav.params as { id: string };
  const b = bk.books.find((x) => x.id === id);
  const [page, setPage] = useLocal<number | null>(null);
  const [party, setParty] = useLocal(false);
  if (!b) return <Screen title={t('Reading list')} />;
  const quotes = bk.quotes.filter((q) => q.book === id);
  const at = page ?? b.page ?? 0;
  const addQuote = async () => {
    const text = await dialog.prompt({ title: t('Quote'), value: '' });
    if (text && text.trim()) bk.add('quotes', { book: id, text: text.trim().slice(0, 2000), page: b.page || null });
  };
  return (
    <Screen
      title={b.title}
      actions={bk.canEdit ? (
        <IconButton icon="more_vert" label={t('More')} onPress={async () => {
          const pick = await dialog.menu([
            { id: 'edit', label: t('Edit'), icon: 'edit' },
            { id: 'lend', label: b.lent ? t('Got it back') : t('Lend'), icon: 'handshake' },
            { divider: true },
            { id: 'delete', label: t('Delete'), icon: 'delete', danger: true },
          ]);
          if (pick === 'edit') nav.push('Edit', { id });
          if (pick === 'lend') await lend(b);
          if (pick === 'delete' && (await dialog.confirm({ title: t('Delete this book?'), ok: t('Delete'), danger: true }))) {
            for (const x of bk.sessions.filter((x) => x.book === id)) bk.remove('sessions', x.id);
            for (const x of quotes) bk.remove('quotes', x.id);
            bk.remove('books', id);
            nav.pop();
          }
        }} />
      ) : undefined}
    >
      {party && <Confetti />}
      <Row gap={20} align="center" class={s.bookHead}>
        <Box class={s.hero} style={b.status === 'done' ? { width: 180 } : undefined}><BookAs b={b} status={b.status ?? 'want'} width={110} /></Box>
        <Stack grow gap={6}>
          <Text variant="title">{b.title}</Text>
          {b.author ? <Text tone="muted">{b.author}</Text> : null}
          {b.pages ? <Text class={s.sub}>{t('{p0} pages', { p0: b.pages })}</Text> : null}
          {b.status === 'done' ? (
            <Rating value={b.rating ?? 0} onChange={bk.canEdit ? (rating: number) => bk.edit('books', id, { rating }) : undefined} />
          ) : null}
          {b.lent ? (
            <Pressable class={s.lentPill} onPress={bk.canEdit ? async () => {
              if (await dialog.menu([{ id: 'back', label: t('Got it back'), icon: 'undo' }]) === 'back') await lend(b);
            } : undefined}>
              <Avatar person={b.lent} size={22} />
              <Text class={s.lentText}>{b.lentTo ? t('Lent to {p0}', { p0: b.lentTo }) : t('Lent')}</Text>
            </Pressable>
          ) : null}
        </Stack>
      </Row>
      {bk.canEdit && (
        <Row gap={6}>
          {PICK.map(([status, label]) => (
            <Pressable key={status} class={(b.status ?? 'want') === status ? [s.tile, s.tileOn] : s.tile}
                       onPress={() => bk.edit('books', id, {
                         status,
                         ...(status === 'reading' && !b.started ? { started: iso(new Date()) } : {}),
                         ...(status === 'done' ? { finished: b.finished ?? iso(new Date()), page: b.pages ?? b.page ?? null } : {}),
                       })}>
              <Box class={s.glyph}><BookAs b={{ id: '', title: '' }} status={status} width={24} bare /></Box>
              <Text class={s.tileText}>{t(label)}</Text>
            </Pressable>
          ))}
        </Row>
      )}
      {b.status === 'reading' && b.pages && bk.canEdit ? (
        <Box class={s.panel}>
          <Row align="center">
            <Text class={s.h} grow>{t('Page {p0} of {p1}', { p0: at, p1: b.pages })}</Text>
            <Text class={s.sub}>{`${Math.round((at / b.pages) * 100)}%`}</Text>
          </Row>
          <Slider value={at} min={0} max={b.pages} step={1} onChange={(v: number) => setPage(Math.round(v))} />
          {page !== null && page !== (b.page ?? 0) && (
            <Button onPress={() => { if (bk.readTo(b, page)) setParty(true); setPage(null); }}>{t('Save')}</Button>
          )}
        </Box>
      ) : null}
      <Row align="center" class={s.sectionHead}>
        <Text class={s.h} grow>{t('Quotes')}</Text>
        {bk.canEdit && <IconButton icon="add" label={t('Add')} onPress={addQuote} />}
      </Row>
      {quotes.map((q) => <Box key={q.id} class={s.quote}><Text class={s.quoteText}>{`“${q.text}”`}</Text></Box>)}
      <Text class={s.h}>{t('Notes')}</Text>
      {bk.canEdit
        ? <Editor value={b.notes ?? ''} lines={6} onChange={(notes: string) => bk.edit('books', id, { notes })} />
        : <Markdown>{b.notes ?? ''}</Markdown>}
    </Screen>
  );
}

/** Lends a book to one of the person's people, from Isolink's own picker; or
 *  takes it back. On an Isolink without the picker, the old Lend page. */
function useLend(bk: ReturnType<typeof useBooks>) {
  const nav = useNav();
  const dialog = useDialog();
  return async (b: Book) => {
    if (b.lent) {
      bk.edit('books', b.id, { lent: null, lentTo: null });
      return;
    }
    let p: { id: string; name: string } | null = null;
    try {
      if (!has('pick.person')) throw new Error('no picker');
      p = await dialog.person();
    } catch {
      nav.push('Lend', { id: b.id });
      return;
    }
    if (p) bk.edit('books', b.id, { lent: p.id, lentTo: p.name.slice(0, 80) });
  };
}

function LendScreen() {
  const nav = useNav();
  const bk = useBooks();
  const { id } = nav.params as { id: string };
  return (
    <Screen title={t('Lend')}>
      <PersonPicker onChange={(lent: string) => { bk.edit('books', id, { lent }); nav.pop(); }} />
    </Screen>
  );
}

type Hit = { title: string; author?: string; pages?: number; cover?: string; isbn?: string };

async function lookUp(q: { isbn?: string; text?: string }): Promise<Hit[]> {
  const query = q.isbn ? `isbn=${encodeURIComponent(q.isbn)}` : `q=${encodeURIComponent(q.text ?? '')}`;
  const r = await fetch(`https://openlibrary.org/search.json?${query}&limit=12&fields=title,author_name,number_of_pages_median,cover_i,isbn`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.docs ?? []).map((d: any) => ({
    title: String(d.title ?? '').slice(0, 200),
    author: d.author_name?.[0] ? String(d.author_name[0]).slice(0, 120) : undefined,
    pages: Number(d.number_of_pages_median) > 0 ? Math.min(20000, Number(d.number_of_pages_median)) : undefined,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
    isbn: q.isbn ?? d.isbn?.[0],
  })).filter((h: Hit) => h.title);
}

/** Find a book by its name or barcode, or type it in. */
function AddScreen() {
  const nav = useNav();
  const bk = useBooks();
  const toast = useToast();
  const [q, setQ] = useLocal('');
  const [hits, setHits] = useLocal<Hit[] | null>(null);
  const [busy, setBusy] = useLocal(false);
  const [scan, setScan] = useLocal(false);
  const [status, setStatus] = useStore<string>('addAs', 'want');
  const search = async (by: { isbn?: string; text?: string }) => {
    setBusy(true);
    try {
      setHits(await lookUp(by));
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };
  const keep = (h: Hit) => {
    const id = bk.add('books', {
      title: h.title, author: h.author ?? null, pages: h.pages ?? null, cover: h.cover ?? null, isbn: h.isbn ?? null, status,
      ...(status === 'reading' ? { started: iso(new Date()), page: 0 } : {}),
      ...(status === 'done' ? { finished: iso(new Date()) } : {}),
    });
    toast(t('Added {p0}', { p0: h.title }));
    nav.pop();
    nav.push('Book', { id });
  };
  // A computer's search box searches on Enter, so no button under it.
  const desktop = usePlatform().desktop;
  return (
    <Screen title={t('Add a book')}>
      <Segmented value={status} onChange={setStatus} options={STATUSES.map(([value, label]) => ({ value, label: t(label) }))} />
      <Row gap={8} align="center" class={s.searchRow}>
        <Stack grow><SearchField value={q} placeholder={t('Title or author')} onChange={setQ} onSubmit={() => q.trim() && search({ text: q.trim() })} /></Stack>
        <IconButton icon="qr_code_scanner" label={t('Scan')} onPress={() => setScan(!scan)} />
      </Row>
      {scan && (
        <Scanner height={220} formats={['ean13']} onScan={({ text }: { text: string }) => { setScan(false); search({ isbn: text }); }} />
      )}
      {q.trim() && !busy && <Button variant="tonal" onPress={() => search({ text: q.trim() })}>{t('Search')}</Button>}
      {busy && <Text tone="muted" align="center">{t('Looking…')}</Text>}
      <Stack gap={desktop ? 3 : 8}>
        {(hits ?? []).map((h, i) => (
          <Pressable key={i} class={s.hit} onPress={() => keep(h)}>
            <Cover b={{ id: '', title: h.title, author: h.author, cover: h.cover }} width={46} />
            <Stack grow>
              <Text bold lines={2}>{h.title}</Text>
              <Text class={s.sub}>{[h.author, h.pages ? t('{p0} pages', { p0: h.pages }) : ''].filter(Boolean).join(' · ')}</Text>
            </Stack>
            <Icon name="add" />
          </Pressable>
        ))}
      </Stack>
      {hits && (
        <Button variant="plain" onPress={() => nav.push('Edit', { title: q.trim(), status })}>{t('Type it in')}</Button>
      )}
    </Screen>
  );
}

function EditScreen() {
  const nav = useNav();
  const bk = useBooks();
  const { id, title, status } = nav.params as { id?: string; title?: string; status?: string };
  const was = bk.books.find((x) => x.id === id);
  const [f, setF] = useLocal<Book>(was ?? { id: '', title: title ?? '', status: status ?? 'want' });
  const set = (x: Partial<Book>) => setF({ ...f, ...x });
  const save = () => {
    if (!f.title.trim()) return;
    const fields = { title: f.title.trim(), author: f.author?.trim() || null, pages: f.pages || null };
    if (was) {
      bk.edit('books', was.id, fields);
      nav.pop();
    } else {
      const nid = bk.add('books', { ...fields, status: f.status ?? 'want' });
      nav.pop();
      nav.pop();
      nav.push('Book', { id: nid });
    }
  };
  return (
    <Screen title={was ? t('Edit') : t('Add a book')} footer={<Button expand disabled={!f.title.trim()} onPress={save}>{t('Save')}</Button>}>
      <Stack gap={12}>
        <TextField label={t('Title')} value={f.title} max={200} autofocus={!was} onChange={(v: string) => set({ title: v })} />
        <TextField label={t('Author')} value={f.author ?? ''} max={120} onChange={(v: string) => set({ author: v })} />
        <TextField type="number" label={t('Pages')} value={f.pages ? String(f.pages) : ''}
                   onChange={(v: string | number) => set({ pages: Math.max(0, Math.min(20000, Math.round(Number(v) || 0))) })} />
      </Stack>
    </Screen>
  );
}

function GoalScreen() {
  const nav = useNav();
  const bk = useBooks();
  const goal = bk.goals.find((g) => g.year === bk.year);
  const [n, setN] = useLocal(goal?.books ?? 12);
  return (
    <Screen title={t('Goal for {p0}', { p0: bk.year })}
            footer={<Button expand onPress={() => {
              if (goal) bk.edit('goals', goal.id, { books: n });
              else bk.add('goals', { year: bk.year, books: n });
              nav.pop();
            }}>{t('Save')}</Button>}>
      <Stack align="center" gap={16} class={s.goalPick}>
        <Text class={s.goalNumber}>{String(n)}</Text>
        <Text tone="muted">{t('books')}</Text>
        <Stepper value={n} min={1} max={365} onChange={setN} />
        <Row gap={6} wrap justify="center">
          {[6, 12, 24, 52].map((x) => <Chip key={x} label={String(x)} selected={n === x} onPress={() => setN(x)} />)}
        </Row>
      </Stack>
    </Screen>
  );
}

const named = (rows: Book[], title: string) => {
  const want = String(title).toLowerCase();
  return rows.find((b) => b.title.toLowerCase() === want) ?? rows.find((b) => b.title.toLowerCase().includes(want));
};

export default defineApp({
  screens: { Home, Book: BookScreen, Add: AddScreen, Edit: EditScreen, Goal: GoalScreen, Lend: LendScreen },
  // What you open from the list sits beside it on a wide window.
  split: ['Home'],
  actions: {
    add: {
      title: 'Add a book to the list',
      params: {
        title: 'string',
        author: { type: 'string', optional: true },
        status: { type: 'string', optional: true, options: STATUSES.map(([x]) => x) },
      },
      run: ({ title, author, status }: { title: string; author?: string; status?: string }, { data }: any) => {
        const id = data.add('books', {
          title: String(title).slice(0, 200),
          author: author ? String(author).slice(0, 120) : null,
          status: STATUSES.some(([x]) => x === status) ? status : 'want',
        });
        return { id };
      },
    },
    page: {
      title: 'Say which page a book is up to',
      params: { book: { type: 'string', title: "The book's title" }, page: 'number' },
      run: ({ book, page }: { book: string; page: number }, { data }: any) => {
        const b = named(data.query('books', { limit: 500 }) as Book[], book);
        if (!b) throw new Error(`No book called ${book}`);
        const to = Math.max(0, Math.round(b.pages ? Math.min(b.pages, page) : page));
        if (to > (b.page ?? 0)) data.add('sessions', { book: b.id, day: iso(new Date()), pages: to - (b.page ?? 0) });
        const done = !!b.pages && to >= b.pages;
        data.edit('books', b.id, { page: to, status: done ? 'done' : 'reading', ...(done ? { finished: iso(new Date()) } : {}) });
        return { title: b.title, page: to, finished: done };
      },
    },
    reading: {
      title: 'What is being read now',
      params: {},
      run: (_: unknown, { data }: any) => ({
        books: (data.query('books', { limit: 500 }) as Book[])
          .filter((b) => b.status === 'reading')
          .map((b) => ({ title: b.title, author: b.author ?? null, page: b.page ?? 0, pages: b.pages ?? null })),
      }),
    },
  },
});
