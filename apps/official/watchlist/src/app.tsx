import {
  defineApp, Screen, Stack, Row, Box, Grid, Masonry, Pressable, Text, TextField, SearchField, Button, IconButton, Icon, Fab,
  Image, Rating, Segmented, Chip, Avatar, Dialog, Sheet,
  useQuery, useData, useLocal, useStore, useLayout, useMe, useNav, useDialog, useToast, usePlatform, useKeys,
  useHandoff, useSheet, useSend, useEffect, fetch, delay, format, t, has,
} from 'isolink';
import s from './app.css';

type Film = {
  id: string; title: string; year?: number; kind?: string; runtime?: number; seasons?: number; genre?: string;
  director?: string; about?: string; poster?: string; wiki?: string; status?: string; rating?: number;
  with?: string[]; seen?: string; order?: number; notes?: string;
};

/** A film or show found on Wikidata, with its poster and opening lines from Wikipedia. */
type Hit = {
  title: string; year?: number; kind: string; runtime?: number; seasons?: number; genre?: string;
  director?: string; about?: string; poster?: string; wiki?: string;
};

/** Poster colours for a film with no picture: night skies, neon and velvet. */
const SKIES: [string, string, string][] = [
  ['#1e3a5f', '#0b1422', '#f59e0b'], ['#3b1f5c', '#140a22', '#f9a8d4'], ['#0f2e2a', '#06120f', '#34d399'],
  ['#1f2937', '#0a0d12', '#60a5fa'], ['#4c0519', '#1a0208', '#fb7185'], ['#78350f', '#200d03', '#fde047'],
  ['#082f49', '#03111c', '#a7f3d0'], ['#3f1d0b', '#120704', '#fdba74'],
];
const skyOf = (title: string) => SKIES[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % SKIES.length];
const MONTHS = [/*t*/'Jan', /*t*/'Feb', /*t*/'Mar', /*t*/'Apr', /*t*/'May', /*t*/'Jun', /*t*/'Jul', /*t*/'Aug', /*t*/'Sep', /*t*/'Oct', /*t*/'Nov', /*t*/'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (min: number) => (min >= 60 ? t('{p0}h {p1}m', { p0: Math.floor(min / 60), p1: pad(min % 60) }) : t('{p0}m', { p0: min }));
/** How long it is: "2h 28m", or a show's seasons. */
const lengthOf = (f: { kind?: string; runtime?: number; seasons?: number }) =>
  f.kind === 'show'
    ? (f.seasons ? (f.seasons === 1 ? t('1 season') : t('{p0} seasons', { p0: f.seasons })) : '')
    : (f.runtime ? hm(f.runtime) : '');
const kindOf = (f: { kind?: string }) => (f.kind === 'show' ? t('Show') : t('Film'));

function useFilms() {
  const films = useQuery('films', { limit: 1000 }) as Film[];
  const data = useData();
  const me = useMe();
  const want = films.filter((f) => (f.status ?? 'want') === 'want')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title));
  const seen = films.filter((f) => f.status === 'seen')
    .sort((a, b) => (b.seen ?? '').localeCompare(a.seen ?? '') || a.title.localeCompare(b.title));
  const top = () => Math.min(0, ...want.map((f) => f.order ?? 0)) - 1;
  return { films, want, seen, top, ...data, canEdit: me.role !== 'view' && me.role !== 'add' };
}
type Films = ReturnType<typeof useFilms>;

const watchedEdit = (f: Film) => ({ status: 'seen', seen: f.seen ?? iso(new Date()) });

/** A film as it's sent into a chat. */
const sendable = (f: Film) => ({
  card: 'film',
  data: {
    title: f.title, year: f.year ?? 0, kind: f.kind ?? 'film', length: lengthOf(f), genre: f.genre ?? '',
    director: f.director ?? '', rating: f.status === 'seen' ? f.rating ?? 0 : 0,
  },
  text: [f.title, f.year].filter(Boolean).join(' · '),
});

// ----- Wikidata and Wikipedia -----

const SHOWS = ['wd:Q5398426', 'wd:Q581714', 'wd:Q1259759', 'wd:Q526877', 'wd:Q63952888'];
const FILMS = ['wd:Q11424', 'wd:Q202866', 'wd:Q29168811', 'wd:Q93204', 'wd:Q506240', 'wd:Q24862'];
const ASK = { 'User-Agent': 'Isolink Watchlist (https://isolink.app)', Accept: 'application/sparql-results+json' };

/** "science fiction film" → "Science fiction". */
const genreName = (g: string) => {
  const x = g.replace(/ (film|television series|television program|genre|film genre)$/i, '').trim();
  return x ? x[0].toUpperCase() + x.slice(1) : '';
};

/** Films and shows matching some words, or one IMDb id, best first. */
async function lookUp(q: { text?: string; imdb?: string }, lang = 'en'): Promise<Hit[]> {
  const words = (q.text ?? '').replace(/["\\\n]/g, ' ').trim().slice(0, 100);
  if (!words && !q.imdb) return [];
  const l = /^[a-z]{2}$/.test(lang) ? lang : 'en';
  const find = q.imdb
    ? `?item wdt:P345 "${q.imdb.replace(/[^a-z0-9]/g, '')}". BIND(0 AS ?ord)`
    : `SERVICE wikibase:mwapi { bd:serviceParam wikibase:api "EntitySearch"; wikibase:endpoint "www.wikidata.org";
         mwapi:search "${words}"; mwapi:language "${l}"; mwapi:limit "30".
         ?item wikibase:apiOutputItem mwapi:item. ?ord wikibase:apiOrdinal true. }`;
  const sparql = `SELECT ?item (MIN(?ord) AS ?o) (SAMPLE(?l) AS ?label) (MIN(?date) AS ?released) (MAX(?secs) AS ?length)
  (MAX(?sn) AS ?seasons) (SAMPLE(?kind) AS ?type) (SAMPLE(?art) AS ?article) (SAMPLE(?dir) AS ?director) (SAMPLE(?gen) AS ?genre)
WHERE {
  ${find}
  ?item wdt:P31 ?k. VALUES ?k { ${[...FILMS, ...SHOWS].join(' ')} }
  BIND(IF(?k IN (${SHOWS.join(', ')}), "show", "film") AS ?kind)
  OPTIONAL { ?item rdfs:label ?l1. FILTER(LANG(?l1) = "${l}") }
  OPTIONAL { ?item rdfs:label ?l2. FILTER(LANG(?l2) = "en") }
  BIND(COALESCE(?l1, ?l2) AS ?l)
  OPTIONAL { ?item wdt:P577 ?date. }
  OPTIONAL { ?item p:P2047/psn:P2047/wikibase:quantityAmount ?secs. }
  OPTIONAL { ?item wdt:P2437 ?sn. }
  OPTIONAL { ?item wdt:P57 ?d. ?d rdfs:label ?dir. FILTER(LANG(?dir) = "en") }
  OPTIONAL { ?item wdt:P136 ?g. ?g rdfs:label ?gen. FILTER(LANG(?gen) = "en") }
  OPTIONAL { ?art schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }
} GROUP BY ?item ORDER BY ?o LIMIT 12`;
  const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, { headers: ASK });
  if (!r.ok) return [];
  const j = await r.json();
  const v = (b: any, k: string) => (b[k] ? String(b[k].value) : undefined);
  const hits: Hit[] = (j.results?.bindings ?? []).map((b: any) => {
    const kind = v(b, 'type') === 'show' ? 'show' : 'film';
    const year = Number((v(b, 'released') ?? '').slice(0, 4));
    const secs = Number(v(b, 'length'));
    const seasons = Number(v(b, 'seasons'));
    const article = v(b, 'article');
    return {
      title: String(v(b, 'label') ?? '').slice(0, 200),
      year: year > 1880 && year < 2200 ? year : undefined,
      kind,
      runtime: kind === 'film' && secs > 0 ? Math.min(6000, Math.round(secs / 60)) : undefined,
      seasons: kind === 'show' && seasons > 0 ? Math.min(200, Math.round(seasons)) : undefined,
      genre: v(b, 'genre') ? genreName(v(b, 'genre') as string).slice(0, 80) : undefined,
      director: v(b, 'director')?.slice(0, 120),
      wiki: (v(b, 'item') ?? '').split('/').pop()?.slice(0, 20),
      article: article ? decodeURIComponent(article.split('/wiki/')[1] ?? '').replace(/_/g, ' ') : undefined,
    } as Hit & { article?: string };
  }).filter((h: Hit) => h.title && !/^Q\d+$/.test(h.title));
  await withPosters(hits as (Hit & { article?: string })[]);
  return hits;
}

/** Each one's poster and first lines, from its English Wikipedia page, in one ask. */
async function withPosters(hits: (Hit & { article?: string })[]) {
  const titles = hits.map((h) => h.article).filter(Boolean) as string[];
  if (!titles.length) return;
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1`
      + `&prop=pageimages%7Cextracts&piprop=thumbnail&pithumbsize=400&pilicense=any&exintro=1&explaintext=1&exsentences=2&exlimit=20`
      + `&titles=${encodeURIComponent(titles.slice(0, 20).join('|'))}`, { headers: { 'User-Agent': ASK['User-Agent'] } });
    if (!r.ok) return;
    const q = (await r.json()).query ?? {};
    const to: Record<string, string> = {};
    for (const n of [...(q.normalized ?? []), ...(q.redirects ?? [])]) to[n.from] = n.to;
    const pages: Record<string, any> = {};
    for (const p of q.pages ?? []) pages[p.title] = p;
    for (const h of hits) {
      if (!h.article) continue;
      let name = h.article;
      for (let i = 0; i < 3 && to[name]; i++) name = to[name];
      const p = pages[name];
      if (!p) continue;
      const src = p.thumbnail?.source;
      if (typeof src === 'string' && src.startsWith('https://upload.wikimedia.org/')) h.poster = src.slice(0, 400);
      if (typeof p.extract === 'string' && p.extract.trim()) h.about = p.extract.trim().slice(0, 600);
    }
  } catch {
    // Without posters they're drawn.
  }
}

const rowOf = (h: Hit) => ({
  title: h.title, year: h.year ?? null, kind: h.kind, runtime: h.runtime ?? null, seasons: h.seasons ?? null,
  genre: h.genre ?? null, director: h.director ?? null, about: h.about ?? null, poster: h.poster ?? null, wiki: h.wiki ?? null,
});

/** What a message names: an IMDb link's id, a link's last words, or the words. */
function askOf(text: string, links: string[]) {
  const all = `${text} ${links.join(' ')}`;
  const imdb = /\b(tt\d{6,10})\b/.exec(all)?.[1];
  const link = links[0];
  const fromLink = link
    ? decodeURIComponent(link.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() ?? '').replace(/[-_+]+/g, ' ').replace(/\.\w+$/, '')
    : '';
  const words = text.replace(/https?:\/\/\S+/g, '').trim();
  return { imdb, text: words.length > 1 && words.length < 120 ? words : fromLink };
}

// ----- posters and tickets -----

/** A film's poster, or one drawn from its name: a night sky, a moon and the title. */
function Poster({ f, width, lit }: { f: { title: string; year?: number; poster?: string }; width?: number; lit?: boolean }) {
  const [top, bottom, glow] = skyOf(f.title);
  const small = (width ?? 140) < 80;
  return (
    <Box class={lit ? [s.poster, s.lit] : s.poster} style={width ? { width } : undefined}>
      {f.poster ? <Image src={f.poster} alt={f.title} ratio={2 / 3} /> : (
        <Box class={s.drawn} style={{ background: `linear-gradient(170deg, ${top} 0%, ${bottom} 100%)` }}>
          <Box class={s.hills} style={width ? { height: Math.round(width * 0.6) } : undefined} />
          <Box class={small ? [s.drawnIn, s.drawnInSmall] : s.drawnIn}>
            <Text class={s.drawnYear}>{small || !f.year ? ' ' : String(f.year)}</Text>
            <Row justify="center"><Box class={small ? [s.moon, s.moonSmall] : s.moon} style={{ background: glow }} /></Row>
            {small ? <Box /> : <Text class={s.drawnTitle} lines={3}>{f.title}</Text>}
          </Box>
        </Box>
      )}
      <Box class={s.sheen} />
    </Box>
  );
}

/** A film in the wall: its poster, then its name and length. */
function Tile({ f, lit, onPress }: { f: Film; lit?: boolean; onPress: () => void }) {
  return (
    <Pressable class={s.tile} onPress={onPress} cursor="pointer">
      <Poster f={f} lit={lit} />
      <Text class={s.tileTitle} lines={1}>{f.title}</Text>
      <Text class={s.tileSub} lines={1}>{[kindOf(f), lengthOf(f)].filter(Boolean).join(' · ')}</Text>
    </Pressable>
  );
}

/** A watched film as a cinema ticket: the day on its stub, stars and who came. */
function Ticket({ f, onPress, onHold }: { f: Film; onPress: () => void; onHold: () => void }) {
  const d = f.seen ? new Date(`${f.seen}T12:00:00`) : null;
  return (
    <Pressable class={s.ticket} onPress={onPress} onLongPress={onHold} cursor="pointer">
      <Box class={s.stub}>
        {d ? (
          <>
            <Text class={s.stubDay}>{pad(d.getDate())}</Text>
            <Text class={s.stubMonth}>{t(MONTHS[d.getMonth()])}</Text>
            <Text class={s.stubYear}>{String(d.getFullYear())}</Text>
          </>
        ) : <Icon name="confirmation_number" class={s.stubIcon} />}
      </Box>
      <Row gap={12} align="center" class={s.ticketBody}>
        <Poster f={f} width={52} />
        <Stack grow gap={1}>
          <Text class={s.ticketTitle} lines={2}>{f.title}</Text>
          <Text class={s.ticketMeta} lines={1}>{[f.year, lengthOf(f), f.genre].filter(Boolean).join(' · ')}</Text>
          <Row gap={8} align="center" class={s.ticketFoot}>
            <Row gap={0}>
              <Text class={s.stars}>{'★'.repeat(f.rating ?? 0)}</Text>
              <Text class={s.starsOff}>{'★'.repeat(5 - (f.rating ?? 0))}</Text>
            </Row>
            {(f.with ?? []).slice(0, 4).map((n) => <Avatar key={n} name={n} size={20} />)}
          </Row>
        </Stack>
      </Row>
    </Pressable>
  );
}

/** A film's menu: held on a phone, right-clicked on a computer. */
function useFilmMenu(fl: Films) {
  const nav = useNav();
  const dialog = useDialog();
  const send = useSend();
  return async (f: Film) => {
    if (!fl.canEdit) return;
    const seen = f.status === 'seen';
    const pick = await dialog.menu([
      seen ? { id: 'want', label: t('To watch'), icon: 'movie' } : { id: 'seen', label: t('Watched'), icon: 'check' },
      ...(!seen ? [{ id: 'top', label: t('Move to top'), icon: 'vertical_align_top' }] : []),
      { id: 'edit', label: t('Edit'), icon: 'edit' },
      ...(has('chat.send') ? [{ id: 'share', label: t('Share'), icon: 'send' }] : []),
      { divider: true },
      { id: 'delete', label: t('Remove'), icon: 'delete', danger: true },
    ]);
    if (pick === 'seen') fl.edit('films', f.id, watchedEdit(f));
    if (pick === 'want') fl.edit('films', f.id, { status: 'want', order: fl.top() });
    if (pick === 'top') fl.edit('films', f.id, { order: fl.top() });
    if (pick === 'edit') nav.push('Edit', { id: f.id });
    if (pick === 'share') await send(sendable(f));
    if (pick === 'delete' && (await dialog.confirm({ title: t('Remove {p0}?', { p0: f.title }), ok: t('Remove'), danger: true }))) {
      fl.remove('films', f.id);
    }
  };
}

/** A film opened from the wall or a ticket: its poster over its own blurred light, then what to do with it. */
function FilmPop({ fl, id, onClose }: { fl: Films; id: string | null; onClose: () => void }) {
  const dialog = useDialog();
  const send = useSend();
  const toast = useToast();
  const menu = useFilmMenu(fl);
  const phone = useLayout().width < 600;
  const f = id ? fl.films.find((x) => x.id === id) : undefined;
  const body = !f ? <Box /> : (() => {
    const seen = f.status === 'seen';
    const [top, bottom] = skyOf(f.title);
    const addWith = async () => {
      let name: string | null = null;
      if (has('pick.person')) name = (await dialog.person())?.name ?? null;
      else name = await dialog.prompt({ title: t('With'), placeholder: t('Name'), value: '' });
      name = (name ?? '').trim().slice(0, 40);
      if (name && !(f.with ?? []).includes(name)) fl.edit('films', f.id, { with: [...(f.with ?? []), name].slice(0, 8) });
    };
    const dropWith = async (name: string) => {
      const pick = await dialog.menu([{ id: 'drop', label: t('Remove'), icon: 'person_remove', danger: true }]);
      if (pick === 'drop') fl.edit('films', f.id, { with: (f.with ?? []).filter((n) => n !== name) });
    };
    const share = async () => {
      const sent = await send(sendable(f));
      if (sent) toast(t('Sent'));
    };
    return (
      <Stack gap={14}>
        <Box class={s.hero}>
          {f.poster
            ? <Image src={f.poster} alt="" class={s.heroBack} />
            : <Box class={s.heroBack} style={{ background: `linear-gradient(170deg, ${top} 0%, ${bottom} 100%)` }} />}
          <Box class={s.heroShade} />
          <Row gap={phone ? 12 : 18} align="end" class={s.heroRow}>
            <Poster f={f} width={phone ? 92 : 124} />
            <Stack grow gap={4}>
              <Text class={s.heroTitle} lines={3}>{f.title}</Text>
              <Text class={s.heroMeta} lines={2}>{[f.year, kindOf(f), lengthOf(f), f.genre].filter(Boolean).join('  ·  ')}</Text>
              {f.director ? <Text class={s.heroDirector} lines={1}>{f.director}</Text> : null}
            </Stack>
          </Row>
        </Box>
        {f.about ? <Text class={s.about} lines={phone ? 5 : 4}>{f.about}</Text> : null}
        {seen ? (
          <Stack gap={10}>
            <Row gap={12} align="center">
              <Rating value={f.rating ?? 0} onChange={fl.canEdit ? (rating: number) => fl.edit('films', f.id, { rating: rating || null }) : undefined} />
              {f.seen ? <Text class={s.sub}>{format.date(f.seen, 'day')}</Text> : null}
            </Row>
            <Row gap={6} wrap>
              {(f.with ?? []).map((n) => (
                <Chip key={n} label={n} onPress={fl.canEdit ? () => dropWith(n) : undefined} />
              ))}
              {fl.canEdit ? <Chip icon="person_add_alt" label={t('With')} onPress={addWith} /> : null}
            </Row>
          </Stack>
        ) : null}
        {fl.canEdit ? (
          <Row gap={8} align="center">
            {seen
              ? <Button variant="tonal" icon="movie" onPress={() => fl.edit('films', f.id, { status: 'want', order: fl.top() })}>{t('To watch')}</Button>
              : <Button icon="check" onPress={() => fl.edit('films', f.id, watchedEdit(f))}>{t('Watched')}</Button>}
            {has('chat.send') ? <Button variant="tonal" icon="send" onPress={share}>{t('Share')}</Button> : null}
            <Box grow />
            <IconButton icon="more_horiz" label={t('More')} onPress={() => { onClose(); menu(f); }} />
          </Row>
        ) : null}
      </Stack>
    );
  })();
  return phone
    ? <Sheet open={!!f} onClose={onClose}>{body}</Sheet>
    : <Dialog open={!!f} onClose={onClose} width={600}>{body}</Dialog>;
}

// ----- screens -----

function Home() {
  const fl = useFilms();
  const nav = useNav();
  const menu = useFilmMenu(fl);
  const { width } = useLayout();
  const phone = width < 600;
  const [tab, setTab] = useStore<string>('tab', 'want');
  const [pop, setPop] = useLocal<string | null>(null);
  const [lit, setLit] = useLocal<string | null>(null);
  const [spinning, setSpinning] = useLocal(false);
  const add = () => nav.push('Add', {});

  // Pick: a light runs along the posters, slows, and stops on tonight's.
  const pick = async () => {
    const list = fl.want;
    if (spinning || list.length < 2) return;
    setSpinning(true);
    let at = Math.floor(Math.random() * list.length);
    const steps = 14 + Math.floor(Math.random() * Math.min(12, list.length));
    for (let n = 0; n < steps; n++) {
      at = (at + 1) % list.length;
      setLit(list[at].id);
      await delay(45 + n * n * 1.6);
    }
    await delay(420);
    setLit(null);
    setSpinning(false);
    setPop(list[at].id);
  };
  useKeys({ 'mod+n': { run: add, label: t('Add') }, 'mod+p': { run: pick, label: t('Pick') } });

  const move = (id: string, to: number) => {
    const list = fl.want.filter((f) => f.id !== id);
    const at = Math.max(0, Math.min(to, list.length));
    const before = list[at - 1]?.order;
    const after = list[at]?.order;
    const order = before === undefined && after === undefined ? 0
      : before === undefined ? (after as number) - 1
        : after === undefined ? before + 1
          : (before + after) / 2;
    fl.edit('films', id, { order });
  };

  const count = tab === 'want'
    ? (fl.want.length === 1 ? t('1 to watch') : t('{p0} to watch', { p0: fl.want.length }))
    : (fl.seen.length === 1 ? t('1 watched') : t('{p0} watched', { p0: fl.seen.length }));

  return (
    <Screen
      title={t('Watchlist')}
      subtitle={has('screen.title') ? count : undefined}
      maxWidth={tab === 'want' ? 0 : 960}
      tabs={[
        { value: 'want', label: t('To watch'), icon: 'movie' },
        { value: 'seen', label: t('Watched'), icon: 'confirmation_number' },
      ]}
      tab={tab}
      onTab={setTab}
      actions={tab === 'want' && fl.want.length > 1 ? <IconButton icon="casino" label={t('Pick')} onPress={pick} /> : undefined}
      fab={fl.canEdit ? <Fab icon="add" label={t('Add')} onPress={add} /> : undefined}
    >
      {tab === 'want' ? (
        fl.want.length ? (
          <Masonry min={phone ? 100 : 160} columns={phone ? 3 : undefined} gap={phone ? 10 : 20}
                   onReorder={fl.canEdit && !spinning ? move : undefined}
                   onHold={(id: string) => { const f = fl.want.find((x) => x.id === id); if (f) menu(f); }}>
            {fl.want.map((f) => <Tile key={f.id} f={f} lit={lit === f.id} onPress={() => setPop(f.id)} />)}
          </Masonry>
        ) : (
          <Grid min={phone ? 100 : 160} columns={phone ? 3 : undefined} gap={phone ? 10 : 20}>
            <Pressable class={s.slot} onPress={fl.canEdit ? add : undefined} cursor="pointer">
              <Icon name="add" class={s.slotIcon} />
            </Pressable>
          </Grid>
        )
      ) : (
        fl.seen.length ? (
          <Grid min={320} columns={phone ? 1 : undefined} gap={phone ? 10 : 14}>
            {fl.seen.map((f) => <Ticket key={f.id} f={f} onPress={() => setPop(f.id)} onHold={() => menu(f)} />)}
          </Grid>
        ) : (
          <Box class={s.blankTicket}><Icon name="confirmation_number" class={s.slotIcon} /></Box>
        )
      )}
      <FilmPop fl={fl} id={pop} onClose={() => setPop(null)} />
    </Screen>
  );
}

/** Find a film or show by name, or type it in. */
function AddScreen() {
  const nav = useNav();
  const fl = useFilms();
  const toast = useToast();
  const me = useMe();
  const desktop = usePlatform().desktop;
  const [q, setQ] = useLocal('');
  const [hits, setHits] = useLocal<Hit[] | null>(null);
  const [busy, setBusy] = useLocal(false);
  const search = async () => {
    const ask = askOf(q.trim(), /^https?:\/\//.test(q.trim()) ? [q.trim()] : []);
    if (!ask.text && !ask.imdb) return;
    setBusy(true);
    try {
      setHits(await lookUp(ask, me.lang));
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };
  const had = (h: Hit) => fl.films.find((f) => (h.wiki && f.wiki === h.wiki) || (f.title === h.title && f.year === h.year));
  const keep = (h: Hit) => {
    const was = had(h);
    if (was) {
      toast(t('Already on your list'));
      return;
    }
    fl.add('films', { ...rowOf(h), status: 'want', order: fl.top() });
    toast(t('Added {p0}', { p0: h.title }));
    nav.pop();
  };
  return (
    <Screen title={t('Add')}>
      <Box class={s.searchRow}>
        <SearchField value={q} placeholder={t('Films and shows')} onChange={setQ} onSubmit={search} autofocus />
      </Box>
      {!desktop && q.trim() && !busy ? <Button variant="tonal" onPress={search}>{t('Search')}</Button> : null}
      {busy ? <Text tone="muted" align="center">{t('Looking…')}</Text> : null}
      <Stack gap={desktop ? 2 : 6}>
        {(hits ?? []).map((h, i) => (
          <Pressable key={`${h.wiki ?? i}`} class={s.hit} onPress={() => keep(h)} cursor="pointer">
            <Poster f={h} width={46} />
            <Stack grow gap={1}>
              <Text bold lines={2}>{h.title}</Text>
              <Text class={s.sub} lines={1}>{[h.year, kindOf(h), lengthOf(h), h.director].filter(Boolean).join(' · ')}</Text>
            </Stack>
            <Icon name={had(h) ? 'check' : 'add'} tone={had(h) ? 'muted' : 'accent'} />
          </Pressable>
        ))}
      </Stack>
      {hits && !busy && !hits.length ? <Text tone="muted" align="center">{t('Nothing found')}</Text> : null}
      {hits && !busy ? <Button variant="plain" onPress={() => nav.push('Edit', { title: q.trim() })}>{t('Type it in')}</Button> : null}
    </Screen>
  );
}

function EditScreen() {
  const nav = useNav();
  const fl = useFilms();
  const { id, title } = nav.params as { id?: string; title?: string };
  const was = id ? fl.films.find((x) => x.id === id) : undefined;
  const [f, setF] = useLocal<Partial<Film>>(was ?? { title: title ?? '', kind: 'film' });
  const set = (k: keyof Film) => (v: unknown) => setF({ ...f, [k]: v });
  const num = (v: unknown, lo: number, hi: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const save = () => {
    const row = {
      title: String(f.title ?? '').trim().slice(0, 200),
      year: num(f.year, 1880, 2200),
      kind: f.kind === 'show' ? 'show' : 'film',
      runtime: f.kind === 'show' ? null : num(f.runtime, 1, 6000),
      seasons: f.kind === 'show' ? num(f.seasons, 1, 200) : null,
      genre: String(f.genre ?? '').trim().slice(0, 80) || null,
      director: String(f.director ?? '').trim().slice(0, 120) || null,
      notes: String(f.notes ?? '').slice(0, 4000) || null,
    };
    if (!row.title) return;
    if (was) fl.edit('films', was.id, row);
    else fl.add('films', { ...row, status: 'want', order: fl.top() });
    nav.pop();
  };
  return (
    <Screen title={was ? t('Edit') : t('Add')}
            footer={<Button expand disabled={!String(f.title ?? '').trim()} onPress={save}>{t('Save')}</Button>}>
      <Stack gap={12}>
        <Segmented value={f.kind === 'show' ? 'show' : 'film'} onChange={set('kind')}
                   options={[{ value: 'film', label: t('Film') }, { value: 'show', label: t('Show') }]} />
        <TextField label={t('Title')} value={String(f.title ?? '')} onChange={set('title')} max={200} autofocus={!was} />
        <Row gap={10}>
          <Stack grow><TextField label={t('Year')} type="number" value={f.year ? String(f.year) : ''} onChange={set('year')} /></Stack>
          {f.kind === 'show'
            ? <Stack grow><TextField label={t('Seasons')} type="number" value={f.seasons ? String(f.seasons) : ''} onChange={set('seasons')} /></Stack>
            : <Stack grow><TextField label={t('Minutes')} type="number" value={f.runtime ? String(f.runtime) : ''} onChange={set('runtime')} /></Stack>}
        </Row>
        <TextField label={t('Genre')} value={String(f.genre ?? '')} onChange={set('genre')} max={80} />
        <TextField label={f.kind === 'show' ? t('Made by') : t('Director')} value={String(f.director ?? '')} onChange={set('director')} max={120} />
        <TextField label={t('Notes')} value={String(f.notes ?? '')} onChange={set('notes')} multiline />
      </Stack>
    </Screen>
  );
}

/** Add to Watchlist, over a chat: the film the message names. */
function AddFilm() {
  const handoff = useHandoff();
  const sheet = useSheet();
  const data = useData();
  const me = useMe();
  const item = handoff?.items?.[0];
  const ask = askOf(String(item?.text ?? ''), (item?.links ?? []) as string[]);
  const [hits, setHits] = useLocal<Hit[] | null>(null);
  const [at, setAt] = useLocal(0);
  useEffect(() => {
    lookUp(ask, me.lang).then(setHits).catch(() => setHits([]));
  }, []);
  const h = hits?.[at];
  const add = () => {
    const row = h ? rowOf(h) : { title: ask.text.slice(0, 200), kind: 'film' };
    if (!row.title) return;
    data.add('films', { ...row, status: 'want', order: -Date.now() / 1000 });
    sheet.close({ toast: t('Added {p0}', { p0: row.title }) });
  };
  if (!hits) return <Text tone="muted" align="center">{t('Looking…')}</Text>;
  if (!h && !ask.text) return <Text tone="muted" align="center">{t('Nothing found')}</Text>;
  return (
    <Stack gap={12}>
      <Row gap={12} align="start">
        <Poster f={h ?? { title: ask.text }} width={72} />
        <Stack grow gap={3}>
          <Text bold lines={3}>{h?.title ?? ask.text}</Text>
          {h ? <Text class={s.sub}>{[h.year, kindOf(h), lengthOf(h)].filter(Boolean).join(' · ')}</Text> : null}
          {h?.director ? <Text class={s.sub}>{h.director}</Text> : null}
          {hits.length > 1 ? (
            <Button variant="plain" onPress={() => setAt((at + 1) % hits.length)}>{t('Not this one')}</Button>
          ) : null}
        </Stack>
      </Row>
      <Button expand icon="movie" onPress={add}>{t('Add')}</Button>
    </Stack>
  );
}

const named = (rows: Film[], title: string) => {
  const want = String(title).toLowerCase();
  return rows.find((f) => f.title.toLowerCase() === want) ?? rows.find((f) => f.title.toLowerCase().includes(want));
};

export default defineApp({
  screens: { Home, Add: AddScreen, Edit: EditScreen },
  sheets: { AddFilm },
  chat: {
    receive: {
      // A film someone sent: on this person's list to watch.
      film: (sent: { title?: string; year?: number; kind?: string; genre?: string; director?: string }, { data }: any) => {
        const title = String(sent.title ?? '').trim().slice(0, 200) || t('Film');
        const year = Math.round(Number(sent.year));
        data.add('films', {
          title,
          year: year > 1880 && year < 2200 ? year : null,
          kind: sent.kind === 'show' ? 'show' : 'film',
          genre: sent.genre ? String(sent.genre).slice(0, 80) : null,
          director: sent.director ? String(sent.director).slice(0, 120) : null,
          status: 'want',
          order: -Date.now() / 1000,
        });
        return { toast: t('Added {p0}', { p0: title }) };
      },
    },
  },
  actions: {
    add: {
      title: 'Add a film or show to watch',
      params: {
        title: 'string',
        year: { type: 'number', optional: true },
        kind: { type: 'string', optional: true, options: ['film', 'show'] },
      },
      run: ({ title, year, kind }: { title: string; year?: number; kind?: string }, { data }: any) => {
        const id = data.add('films', {
          title: String(title).slice(0, 200),
          year: year && year > 1880 && year < 2200 ? Math.round(year) : null,
          kind: kind === 'show' ? 'show' : 'film',
          status: 'want',
          order: -Date.now() / 1000,
        });
        return { id };
      },
    },
    watched: {
      title: 'Mark a film or show as watched, with stars out of 5',
      params: { title: { type: 'string', title: 'Its title' }, stars: { type: 'number', optional: true } },
      run: ({ title, stars }: { title: string; stars?: number }, { data }: any) => {
        const f = named(data.query('films', { limit: 1000 }) as Film[], title);
        if (!f) throw new Error(`No film called ${title}`);
        const rating = stars ? Math.max(1, Math.min(5, Math.round(stars))) : f.rating ?? null;
        data.edit('films', f.id, { ...watchedEdit(f), rating });
        return { title: f.title, rating };
      },
    },
    list: {
      title: 'What is on the list to watch',
      params: {},
      run: (_: unknown, { data }: any) => ({
        films: (data.query('films', { limit: 1000 }) as Film[])
          .filter((f) => (f.status ?? 'want') === 'want')
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((f) => ({ title: f.title, year: f.year ?? null, kind: f.kind ?? 'film', length: lengthOf(f) || null, genre: f.genre ?? null })),
      }),
    },
  },
});
