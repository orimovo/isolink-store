import {
  defineApp, Screen, Stack, Row, Box, Pressable, Text, TextField, SearchField, Button, IconButton, Icon, Fab, Grid,
  Chip, Image, Markdown, Editor, Rating, Slider, Stepper, Segmented, ProgressRing, Progress, Chart, Stat, Scanner,
  Scroll, Badge, Avatar, PersonPicker, Confetti,
  useQuery, useData, useLocal, useStore, useMe, useNav, useNow, useDialog, useShare, useToast, usePlatform, fetch, t,
} from 'isolink';
import s from './app.css';

type Book = {
  id: string; title: string; author?: string; status?: string; rating?: number; lent?: string; notes?: string;
  pages?: number; page?: number; cover?: string; isbn?: string; started?: string; finished?: string; tags?: string[];
  _edited?: number;
};
type Session = { id: string; book: string; day: string; pages: number };
type Quote = { id: string; book: string; text: string; page?: number };
type Goal = { id: string; year: number; books: number };

const STATUSES: [string, string][] = [['reading', /*t*/'Reading'], ['want', /*t*/'Want to read'], ['done', /*t*/'Read']];
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
  return { books, sessions, quotes, goals, ...data, year, readTo, canEdit: me.role !== 'view' };
}

/** A book's menu: held on a phone, right-clicked on a computer. */
function useBookMenu(bk: ReturnType<typeof useBooks>) {
  const nav = useNav();
  const dialog = useDialog();
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
    if (pick === 'lend') {
      if (b.lent) bk.edit('books', b.id, { lent: null });
      else nav.push('Lend', { id: b.id });
    }
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

function ShelfTab({ bk }: { bk: ReturnType<typeof useBooks> }) {
  const nav = useNav();
  const menu = useBookMenu(bk);
  const [q, setQ] = useLocal('');
  const want = q.trim().toLowerCase();
  const match = (b: Book) => !want || [b.title, b.author ?? '', ...(b.tags ?? [])].some((x) => x.toLowerCase().includes(want));
  const reading = bk.books.filter((b) => b.status === 'reading' && match(b));
  const goal = bk.goals.find((g) => g.year === bk.year);
  const doneThisYear = bk.books.filter((b) => b.status === 'done' && (b.finished ?? '').startsWith(String(bk.year))).length;
  if (bk.books.length === 0) {
    return (
      <Stack align="center" gap={10} class={s.empty}>
        <Text class={s.bigEmoji}>📚</Text>
        <Text tone="muted">{t('No books yet')}</Text>
      </Stack>
    );
  }
  return (
    <>
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
      {reading.map((b) => (
        <Pressable key={b.id} class={s.now} onPress={() => nav.push('Book', { id: b.id })} onLongPress={() => menu(b)}>
          <Cover b={b} width={62} />
          <Stack grow gap={4}>
            <Text bold lines={2}>{b.title}</Text>
            {b.author ? <Text class={s.sub}>{b.author}</Text> : null}
            <Progress value={progressOf(b)} />
            <Text class={s.sub}>{b.pages ? t('Page {p0} of {p1}', { p0: b.page ?? 0, p1: b.pages }) : ''}</Text>
          </Stack>
        </Pressable>
      ))}
      {STATUSES.filter(([st]) => st !== 'reading').map(([st, label]) => {
        const rows = bk.books.filter((b) => (b.status ?? 'want') === st && match(b));
        if (!rows.length) return null;
        return (
          <Box key={st}>
            <Row align="center" class={s.shelfHead}>
              <Text class={s.h} grow>{t(label)}</Text>
              <Text class={s.sub}>{String(rows.length)}</Text>
            </Row>
            <Scroll direction="horizontal">
              <Row gap={12} class={s.shelf}>
                {rows.map((b) => (
                  <Stack key={b.id} gap={4} class={s.shelfBook}>
                    <Cover b={b} width={96} onPress={() => nav.push('Book', { id: b.id })} onHold={() => menu(b)} />
                    {st === 'done' && b.rating ? <Text class={s.stars}>{'★'.repeat(b.rating)}</Text> : null}
                    {b.lent ? <Badge label={t('Lent')} tone="warning" /> : null}
                  </Stack>
                ))}
              </Row>
            </Scroll>
          </Box>
        );
      })}
    </>
  );
}

function StatsTab({ bk }: { bk: ReturnType<typeof useBooks> }) {
  const nav = useNav();
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
          <Grid min={90} gap={10}>
            {finished.map((b) => <Cover key={b.id} b={b} width={90} onPress={() => nav.push('Book', { id: b.id })} />)}
          </Grid>
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

function Home() {
  const bk = useBooks();
  const nav = useNav();
  const [tab, setTab] = useStore<string>('tab', 'shelf');
  return (
    <Screen
      title={t('Reading list')}
      tabs={[
        { value: 'shelf', label: t('Shelf'), icon: 'menu_book' },
        { value: 'stats', label: t('Stats'), icon: 'insights' },
        { value: 'quotes', label: t('Quotes'), icon: 'format_quote' },
      ]}
      tab={tab}
      onTab={setTab}
      fab={bk.canEdit && tab === 'shelf' ? <Fab icon="add" onPress={() => nav.push('Add', {})} /> : undefined}
    >
      {tab === 'shelf' && <ShelfTab bk={bk} />}
      {tab === 'stats' && <StatsTab bk={bk} />}
      {tab === 'quotes' && <QuotesTab bk={bk} />}
    </Screen>
  );
}

function BookScreen() {
  const nav = useNav();
  const bk = useBooks();
  const dialog = useDialog();
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
          if (pick === 'lend') {
            if (b.lent) bk.edit('books', id, { lent: null });
            else nav.push('Lend', { id });
          }
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
      <Row gap={14} class={s.bookHead}>
        <Cover b={b} width={110} />
        <Stack grow gap={6}>
          <Text variant="title">{b.title}</Text>
          {b.author ? <Text tone="muted">{b.author}</Text> : null}
          {b.pages ? <Text class={s.sub}>{t('{p0} pages', { p0: b.pages })}</Text> : null}
          {b.lent ? (
            <Row gap={6} align="center"><Avatar person={b.lent} size={22} /><Text class={s.sub}>{t('Lent')}</Text></Row>
          ) : null}
        </Stack>
      </Row>
      {bk.canEdit && (
        <Segmented value={b.status ?? 'want'} options={STATUSES.map(([value, label]) => ({ value, label: t(label) }))}
                   onChange={(status: string) => bk.edit('books', id, {
                     status,
                     ...(status === 'reading' && !b.started ? { started: iso(new Date()) } : {}),
                     ...(status === 'done' ? { finished: b.finished ?? iso(new Date()), page: b.pages ?? b.page ?? null } : {}),
                   })} />
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
      {b.status === 'done' ? (
        <Row align="center" class={s.rating}>
          <Rating value={b.rating ?? 0} onChange={bk.canEdit ? (rating: number) => bk.edit('books', id, { rating }) : undefined} />
          <Stack grow />
          {b.finished ? <Text class={s.sub}>{b.finished}</Text> : null}
        </Row>
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
      {q.trim() && !busy && !desktop && <Button variant="tonal" onPress={() => search({ text: q.trim() })}>{t('Search')}</Button>}
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
