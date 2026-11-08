import {
  defineApp, Screen, Stack, Row, Box, Pressable, Section, Checkbox, Text, TextField, Select, Button, IconButton,
  Icon, Sheet, Banner, Chart, Scanner, Avatar, Grid, MoneyField, DatePicker, Upload, useQuery, useData, useLocal,
  useStore, useLayout, useMe, useChat, useNow, useNav, useToast, useHaptics, fetch, format, t,
} from 'isolink';
import { useShared } from 'isolink/system';
import s from './app.css';
import { between, last } from './pos';
import { useAddBar } from './addbar';
import { dayWords, isoDay, siteOf, MONTH_NAMES } from './smart';

type Item = {
  id: string; name: string; qty?: string; aisle?: string; got?: boolean; pos?: string; price?: number;
  due?: string; link?: string; file?: unknown; _edited?: number; _by?: string;
};
type Usual = { id: string; name: string; aisle?: string; emoji?: string; price?: number; barcode?: string; times?: number };
type Trip = { id: string; day: string; total?: number; count?: number; who?: string };
type Out = { id: string; who: string; since: number };

/** Each aisle: its name, a picture and a colour. */
const AISLES: [string, string, string, string][] = [
  ['fruit', /*t*/'Fruit & veg', '🥦', '#22c55e'],
  ['bakery', /*t*/'Bakery', '🥖', '#f59e0b'],
  ['dairy', /*t*/'Dairy', '🧀', '#60a5fa'],
  ['meat', /*t*/'Meat & fish', '🐟', '#f87171'],
  ['cupboard', /*t*/'Cupboard', '🥫', '#c084fc'],
  ['frozen', /*t*/'Frozen', '🧊', '#22d3ee'],
  ['drinks', /*t*/'Drinks', '🧃', '#f472b6'],
  ['home', /*t*/'Home', '🧻', '#94a3b8'],
  ['other', /*t*/'Other', '🛍️', '#a3a3a3'],
];
/** A picture for the usual things, from a word in their name. */
const EMOJI: [RegExp, string][] = [
  [/milk/i, '🥛'], [/bread|loaf|sourdough/i, '🍞'], [/egg/i, '🥚'], [/butter/i, '🧈'], [/banana/i, '🍌'],
  [/apple/i, '🍎'], [/coffee/i, '☕'], [/tea\b/i, '🫖'], [/cheese/i, '🧀'], [/pasta|spaghetti/i, '🍝'],
  [/rice/i, '🍚'], [/tomato/i, '🍅'], [/potato/i, '🥔'], [/onion/i, '🧅'], [/garlic/i, '🧄'], [/carrot/i, '🥕'],
  [/lemon/i, '🍋'], [/chicken/i, '🍗'], [/fish|salmon/i, '🐟'], [/beer/i, '🍺'], [/wine/i, '🍷'],
  [/water/i, '💧'], [/juice/i, '🧃'], [/yog/i, '🥣'], [/cereal|oats/i, '🥣'], [/spinach|salad|lettuce/i, '🥬'],
  [/chocolate/i, '🍫'], [/biscuit|cookie/i, '🍪'], [/soap|wash/i, '🧼'], [/loo|toilet|tissue/i, '🧻'],
  [/tin|can\b|beans/i, '🥫'], [/pizza/i, '🍕'], [/ice cream/i, '🍨'], [/avocado/i, '🥑'], [/pepper/i, '🫑'],
];
const emojiFor = (u: { name: string; emoji?: string }) => u.emoji || EMOJI.find(([re]) => re.test(u.name))?.[1] || '🛒';
const CURRENCIES = ['GBP', 'EUR', 'USD', 'AUD', 'CAD', 'JPY', 'INR', 'CNY', 'BRL', 'AED'];
const HOURS_OUT = 3 * 3600000;

/** "2 milk" or "milk x2": the number is the amount. */
function parse(text: string): { name: string; qty?: string } {
  const lead = /^(\d+)\s+(.+)$/.exec(text);
  if (lead) return { name: lead[2], qty: lead[1] };
  const tail = /^(.+?)\s*[x×](\d+)$/.exec(text);
  if (tail) return { name: tail[1], qty: tail[2] };
  return { name: text };
}

/** The price of a line: its price times its amount when the amount is a plain number. */
const cost = (r: Item) => (r.price ?? 0) * (/^\d+$/.test(r.qty ?? '') ? Number(r.qty) : 1);

/** Lines handed over from another app (a recipe's ingredients): "- 2 lemons". */
function linesOf(text: string) {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*(?:\[[ xX]\]\s*)?/, '').trim())
    .filter((l) => l && !/:$/.test(l))
    .slice(0, 60);
}

function useShop() {
  const items = useQuery('items', { limit: 500 }) as Item[];
  const usuals = useQuery('usuals', { limit: 500 }) as Usual[];
  const data = useData();
  const me = useMe();
  /** The aisle something usually goes in: from the usuals, then past items. */
  const aisleFor = (name: string) => {
    const n = name.toLowerCase();
    for (const r of [...usuals, ...items]) if (r.name.toLowerCase() === n && r.aisle) return r.aisle;
    return undefined;
  };
  const usualFor = (name: string) => usuals.find((u) => u.name.toLowerCase() === name.toLowerCase());
  const put = (text: string, more: { aisle?: string; due?: string; link?: string; file?: unknown } = {}) => {
    const { name, qty } = parse(text.trim());
    if (!name) return;
    const u = usualFor(name);
    const aisle = more.aisle ?? aisleFor(name);
    data.add('items', {
      name, qty, aisle, price: u?.price, pos: between(last(items), ''), due: more.due, link: more.link, file: more.file,
    });
    // Remembered for next time, and counted, so the usual ones come first.
    if (u) data.edit('usuals', u.id, { times: (u.times ?? 0) + 1 });
    else data.add('usuals', { name, aisle, times: 1 });
  };
  return { items, usuals, ...data, me, canAdd: me.role !== 'view', put, usualFor, aisleFor };
}

/** Wide windows get aisles side by side. */
const WIDE = 760;

function Empty({ emoji, words }: { emoji: string; words: string }) {
  return (
    <Stack align="center" gap={12} class={s.empty}>
      <Box class={s.emptyArt}><Text class={s.emptyEmoji}>{emoji}</Text></Box>
      <Text class={s.emptyText}>{words}</Text>
    </Stack>
  );
}

function ListTab({ shop, currency, wide }: { shop: ReturnType<typeof useShop>; currency: string; wide: boolean }) {
  const { items, usuals, edit, remove, add, put, canAdd, me } = shop;
  const out = (useQuery('out', { limit: 20 }) as Out[]);
  const members = useChat() as { id: string; name: string }[];
  const now = useNow(60000);
  const shared = useShared() as { text?: string; from?: string } | null;
  const toast = useToast();
  const haptic = useHaptics();
  const [taken, setTaken] = useLocal<boolean>(false);
  const [open, setOpen] = useLocal<string | null>(null);
  const [form, setForm] = useLocal<{ name: string; qty: string; price: number | null; link: string }>({ name: '', qty: '', price: null, link: '' });

  const sorted = [...items].sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? ''));
  const toGet = sorted.filter((r) => !r.got);
  const got = sorted.filter((r) => r.got).sort((a, b) => (b._edited ?? 0) - (a._edited ?? 0));
  const groups = [...AISLES.map(([id]) => id), ''].map((a) => [a, toGet.filter((r) => (r.aisle ?? '') === a)] as const)
    .filter(([, rows]) => rows.length > 0);
  const here = out.filter((o) => now - o.since < HOURS_OUT);
  const mine = here.find((o) => o.who === me.id);
  const others = here.filter((o) => o.who !== me.id);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '';
  const left = toGet.reduce((n, r) => n + cost(r), 0);
  const inBasket = got.reduce((n, r) => n + cost(r), 0);
  const handed = shared?.text && !taken ? linesOf(shared.text) : [];
  const today = isoDay(new Date(now));

  const start = () => add('out', { who: me.id, since: Date.now() });
  /** Home again: the shop is kept for Spend, and what was got comes off the list. */
  const finish = () => {
    if (got.length) {
      add('trips', { day: format.date(Date.now(), 'iso'), total: Math.round(inBasket * 100) / 100, count: got.length, who: me.id });
      for (const r of got) remove('items', r.id);
    }
    for (const o of out.filter((o) => o.who === me.id || now - o.since >= HOURS_OUT)) remove('out', o.id);
  };

  const editing = items.find((r) => r.id === open);
  const show = (r: Item) => {
    setForm({ name: r.name, qty: r.qty ?? '', price: r.price ?? null, link: r.link ?? '' });
    setOpen(r.id);
  };
  // Kept when the sheet goes, however it goes.
  const close = () => {
    if (editing && canAdd) {
      const name = form.name.trim() || editing.name;
      const qty = form.qty.trim();
      const price = form.price ?? null;
      const typed = form.link.trim();
      const link = typed ? (/^https?:\/\//i.test(typed) ? typed : `https://${typed}`) : '';
      if (name !== editing.name || qty !== (editing.qty ?? '') || price !== (editing.price ?? null) || link !== (editing.link ?? '')) {
        edit('items', editing.id, { name, qty: qty || null, price, link: link || null });
        const u = shop.usualFor(editing.name);
        if (u && price !== null) edit('usuals', u.id, { price });
      }
    }
    setOpen(null);
  };

  const row = (r: Item) => {
    const extra = !r.got && (r.due || r.link || r.file);
    return (
      <Pressable key={r.id} class={mine ? s.bigItem : s.item} onPress={() => (mine ? (haptic('select'), edit('items', r.id, { got: !r.got })) : show(r))}
                 onLongPress={() => show(r)}>
        <Checkbox round checked={!!r.got} onChange={() => { haptic('select'); edit('items', r.id, { got: !r.got }); }} />
        <Stack grow gap={2}>
          <Text class={r.got ? s.got : mine ? s.bigName : s.name}>{r.name}</Text>
          {extra ? (
            <Row gap={10} align="center">
              {r.due ? (
                <Row gap={4} align="center">
                  <Icon name="event" size={14} tone={r.due < today ? 'danger' : 'muted'} />
                  <Text class={r.due < today ? s.late : s.meta}>{dayWords(r.due, now)}</Text>
                </Row>
              ) : null}
              {r.link ? (
                <Row gap={4} align="center"><Icon name="link" size={14} /><Text class={s.meta} lines={1}>{siteOf(r.link)}</Text></Row>
              ) : null}
              {r.file ? <Icon name="attach_file" size={14} /> : null}
            </Row>
          ) : null}
        </Stack>
        {r.qty ? <Text class={s.qty}>{r.qty}</Text> : null}
        {r.price ? <Text class={s.price}>{format.money(cost(r), currency)}</Text> : null}
      </Pressable>
    );
  };
  const onList = new Set(toGet.map((r) => r.name.toLowerCase()));
  const again = [...usuals].sort((a, b) => (b.times ?? 0) - (a.times ?? 0))
    .filter((u) => !onList.has(u.name.toLowerCase())).slice(0, 6);
  const cards = groups.map(([a, rows]) => {
    const [, name, emoji, hue] = AISLES.find(([id]) => id === a) ?? ['', 'Other', '🛍️', '#a3a3a3'];
    return (
      <Box key={a || 'none'} class={s.card}>
        <Row gap={10} align="center" class={s.cardHead}>
          <Box class={s.badge} style={{ background: `${hue}2e` }}><Text class={s.badgeEmoji}>{emoji}</Text></Box>
          <Text class={s.cardTitle} grow>{t(name)}</Text>
          <Text class={s.cardCount}>{String(rows.length)}</Text>
        </Row>
        <Box class={s.rows}>{rows.map(row)}</Box>
      </Box>
    );
  });
  const facts = [
    left > 0 ? format.money(left, currency) : '',
    groups.length === 1 ? t('1 aisle') : groups.length > 1 ? t('{p0} aisles', { p0: groups.length }) : '',
    got.length > 0 ? t('{p0} got', { p0: got.length }) : '',
  ].filter(Boolean);

  return (
    <>
      {handed.length > 0 && canAdd && (
        <Banner icon="add_circle_outline"
                text={shared?.from ? t('{p0} from {p1}', { p0: handed.length, p1: shared.from }) : t('{p0} to add', { p0: handed.length })}
                action={t('Add')}
                onAction={() => { handed.forEach(put); setTaken(true); toast(t('Added {p0}', { p0: handed.length })); }}
                onDismiss={() => setTaken(true)} />
      )}
      {others.length > 0 && (
        <Box class={s.live}>
          <Avatar person={others[0].who} size={22} />
          <Text class={s.liveText}>{t('{p0} is shopping', { p0: nameOf(others[0].who) })}</Text>
        </Box>
      )}
      {items.length === 0 ? (
        <Empty emoji="🛒" words={t('Nothing to get')} />
      ) : (
        <Row gap={16} align="end" class={s.hero}>
          <Stack grow gap={4}>
            <Text class={s.big}>{toGet.length === 0 ? t('Nothing to get') : mine ? t('{p0} left', { p0: toGet.length }) : t('{p0} to get', { p0: toGet.length })}</Text>
            {facts.length > 0 && <Text class={s.line}>{facts.join(' · ')}</Text>}
          </Stack>
          {canAdd && !mine && toGet.length > 0 && <Button icon="storefront" onPress={start}>{t('Shop')}</Button>}
        </Row>
      )}
      {canAdd && !mine && again.length > 0 && (
        <Box class={items.length === 0 ? [s.quick, s.quickMid] : s.quick}>
          {again.map((u) => (
            <Pressable key={u.id} class={s.chip} onPress={() => put(u.name)}>
              <Text class={s.chipText}>{`${emojiFor(u)}  ${u.name}`}</Text>
            </Pressable>
          ))}
        </Box>
      )}
      {wide && !mine && cards.length > 1 ? <Grid min={300} gap={16}>{cards}</Grid> : cards}
      {got.length > 0 && (
        <Section
          title={t('Got · {p0}', { p0: got.length })}
          folded={!mine}
          action={
            canAdd && !mine ? (
              <Button variant="plain" onPress={() => got.forEach((r) => remove('items', r.id))}>{t('Clear')}</Button>
            ) : undefined
          }
        >
          <Box class={s.card}><Box class={s.rows}>{got.map(row)}</Box></Box>
        </Section>
      )}
      {mine && (
        <Box class={s.total}>
          <Stack grow>
            <Text class={s.totalWords}>{t('{p0} left', { p0: toGet.length })}</Text>
            {left > 0 && <Text class={s.totalSub}>{format.money(left, currency)}</Text>}
          </Stack>
          <Text class={s.totalNumber}>{format.money(inBasket, currency)}</Text>
          <Button onPress={finish}>{t('Done')}</Button>
        </Box>
      )}
      <Sheet open={!!editing} onClose={close} detents={['medium', 'large']}>
        {editing && (
          <Stack gap={16}>
            <TextField label={t('Name')} value={form.name} max={80}
                       onChange={(name: string) => setForm({ ...form, name })} />
            <Row gap={12}>
              <Stack grow>
                <TextField label={t('Amount')} value={form.qty} max={20}
                           onChange={(qty: string) => setForm({ ...form, qty })} />
              </Stack>
              <Stack grow>
                <MoneyField label={t('Price')} value={form.price ?? undefined}
                            onChange={(price: number) => setForm({ ...form, price })} />
              </Stack>
            </Row>
            <Select label={t('Aisle')} value={editing.aisle ?? null}
                    options={AISLES.map(([value, label, emoji]) => ({ value, label: `${emoji}  ${t(label)}` }))}
                    onChange={(aisle: string) => {
                      edit('items', editing.id, { aisle });
                      const u = shop.usualFor(editing.name);
                      if (u) edit('usuals', u.id, { aisle });
                    }} />
            <Row gap={12} align="center" wrap>
              <Icon name="event" />
              <DatePicker value={editing.due} placeholder={t('Date')} late={!!editing.due && editing.due < today}
                          onChange={(due: string) => edit('items', editing.id, { due: due || null })} />
              {editing.due ? <IconButton icon="close" label={t('Clear')} onPress={() => edit('items', editing.id, { due: null })} /> : null}
            </Row>
            <TextField label={t('Link')} type="url" value={form.link} placeholder="https://"
                       onChange={(link: string) => setForm({ ...form, link })} />
            <Upload value={editing.file ? [editing.file] : []} label={t('Add a file')}
                    onUpload={canAdd ? (file: unknown) => edit('items', editing.id, { file }) : undefined}
                    onRemove={canAdd ? () => edit('items', editing.id, { file: null }) : undefined} />
            <Row gap={8} justify="end">
              <Button variant="danger" onPress={() => { remove('items', editing.id); setOpen(null); }}>{t('Delete')}</Button>
              <Button onPress={close}>{t('Done')}</Button>
            </Row>
          </Stack>
        )}
      </Sheet>
    </>
  );
}

function UsualsTab({ shop }: { shop: ReturnType<typeof useShop> }) {
  const { items, usuals, put, remove, edit, canAdd } = shop;
  const nav = useNav();
  const [open, setOpen] = useLocal<string | null>(null);
  const [form, setForm] = useLocal<{ name: string; emoji: string }>({ name: '', emoji: '' });
  const onList = (u: Usual) => items.find((r) => !r.got && r.name.toLowerCase() === u.name.toLowerCase());
  const sorted = [...usuals].sort((a, b) => (b.times ?? 0) - (a.times ?? 0) || a.name.localeCompare(b.name));
  const editing = usuals.find((u) => u.id === open);
  const close = () => {
    if (editing && canAdd) {
      const name = form.name.trim() || editing.name;
      edit('usuals', editing.id, { name, emoji: form.emoji.trim() || null });
    }
    setOpen(null);
  };
  return (
    <>
      <Row gap={16} align="end" class={s.hero}>
        <Stack grow gap={4}>
          <Text class={s.big}>{t('Usuals')}</Text>
          {sorted.length > 0 && <Text class={s.line}>{sorted.length === 1 ? t('1 thing') : t('{p0} things', { p0: sorted.length })}</Text>}
        </Stack>
        {canAdd && <Button variant="tonal" icon="qr_code_scanner" onPress={() => nav.push('Scan')}>{t('Scan')}</Button>}
      </Row>
      {sorted.length === 0 ? (
        <Empty emoji="⭐" words={t('No usuals yet')} />
      ) : (
        <Grid min={112} gap={12}>
          {sorted.map((u) => {
            const on = onList(u);
            const hue = AISLES.find(([id]) => id === u.aisle)?.[3] ?? '#a3a3a3';
            return (
              <Pressable key={u.id} class={on ? [s.tile, s.tileOn] : s.tile}
                         onPress={canAdd ? () => (on ? remove('items', on.id) : put(u.name)) : undefined}
                         onLongPress={canAdd ? () => { setForm({ name: u.name, emoji: u.emoji ?? '' }); setOpen(u.id); } : undefined}>
                <Box class={s.tileArt} style={{ background: `${hue}2e` }}><Text class={s.emoji}>{emojiFor(u)}</Text></Box>
                <Text class={s.tileName} lines={1}>{u.name}</Text>
                {u.times ? <Text class={s.tileCount}>{`× ${u.times}`}</Text> : null}
              </Pressable>
            );
          })}
        </Grid>
      )}
      <Sheet open={!!editing} onClose={close} detents={['medium', 'large']}>
        {editing && (
          <Stack gap={16}>
            <Row gap={12}>
              <Stack width={84}>
                <TextField label={t('Emoji')} value={form.emoji} max={8} onChange={(emoji: string) => setForm({ ...form, emoji })} />
              </Stack>
              <Stack grow>
                <TextField label={t('Name')} value={form.name} max={80} onChange={(name: string) => setForm({ ...form, name })} />
              </Stack>
            </Row>
            <Row gap={8} justify="end">
              <Button variant="danger" onPress={() => { remove('usuals', editing.id); setOpen(null); }}>{t('Delete')}</Button>
              <Button onPress={close}>{t('Done')}</Button>
            </Row>
          </Stack>
        )}
      </Sheet>
    </>
  );
}

function SpendTab({ currency, setCurrency }: { currency: string; setCurrency: (c: string) => void }) {
  const trips = (useQuery('trips', { limit: 500 }) as Trip[]).sort((a, b) => b.day.localeCompare(a.day));
  const now = new Date();
  const months: { label: string; value: number; shops: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const these = trips.filter((x) => x.day.startsWith(key));
    months.push({
      label: t(MONTH_NAMES[d.getMonth()]),
      value: these.reduce((n, x) => n + (x.total ?? 0), 0),
      shops: these.length,
    });
  }
  const [lastMonth, thisMonth] = months.slice(-2);
  const per = (m: { value: number; shops: number }) => (m.shops ? m.value / m.shops : 0);
  const change = thisMonth.shops && lastMonth.shops ? per(thisMonth) - per(lastMonth) : 0;
  const sixMonths = months.reduce((n, m) => n + m.value, 0);
  return (
    <>
      <Grid min={180} gap={16}>
        <Box class={[s.stat, s.statHero]}>
          <Text class={s.statKeyOn}>{t('This month')}</Text>
          <Text class={s.statValueOn}>{format.money(thisMonth.value, currency)}</Text>
          <Text class={s.statSubOn}>{thisMonth.shops === 1 ? t('1 shop') : t('{p0} shops', { p0: thisMonth.shops })}</Text>
        </Box>
        <Box class={s.stat}>
          <Text class={s.statKey}>{t('Per shop')}</Text>
          <Text class={s.statValue}>{format.money(per(thisMonth), currency)}</Text>
          {change ? <Text class={change > 0 ? s.statUp : s.statDown}>{`${change > 0 ? '↑' : '↓'} ${format.money(Math.abs(change), currency)}`}</Text> : null}
        </Box>
        <Box class={s.stat}>
          <Text class={s.statKey}>{t('6 months')}</Text>
          <Text class={s.statValue}>{format.money(sixMonths, currency)}</Text>
          <Text class={s.statSub}>{t('{p0} a month', { p0: format.money(sixMonths / 6, currency) })}</Text>
        </Box>
      </Grid>
      <Box class={[s.card, s.chartCard]}><Chart kind="bar" data={months.map(({ label, value }) => ({ label, value }))} height={160} /></Box>
      <Row align="center" class={s.sectionRow}>
        <Text class={s.section} grow>{t('Shops')}</Text>
        <Select variant="chip" value={currency} options={CURRENCIES} onChange={setCurrency} />
      </Row>
      {trips.length === 0 ? (
        <Empty emoji="🧾" words={t('No shops yet')} />
      ) : (
        <Box class={s.card}>
          <Box class={s.rows}>
            {trips.slice(0, 20).map((x) => (
              <Row key={x.id} gap={12} align="center" class={s.item}>
                {x.who ? <Avatar person={x.who} size={32} /> : <Box class={s.badge}><Icon name="storefront" size={16} /></Box>}
                <Stack grow gap={2}>
                  <Text class={s.name}>{format.date(x.day)}</Text>
                  <Text class={s.meta}>{x.count === 1 ? t('1 thing') : t('{p0} things', { p0: x.count ?? 0 })}</Text>
                </Stack>
                <Text class={s.amount}>{format.money(x.total ?? 0, currency)}</Text>
              </Row>
            ))}
          </Box>
        </Box>
      )}
    </>
  );
}

function Home() {
  const shop = useShop();
  const [tab, setTab] = useStore<string>('tab', 'list');
  const [currency, setCurrency] = useStore<string>('currency', 'GBP');
  const out = (useQuery('out', { limit: 20 }) as Out[]);
  const now = useNow(60000);
  const shopping = out.some((o) => o.who === shop.me.id && now - o.since < HOURS_OUT);
  const wide = useLayout().width >= WIDE;
  const adder = useAddBar({
    placeholder: t('Add to list'),
    qty: true,
    pick: {
      icon: 'category',
      label: t('Aisle'),
      options: AISLES.map(([id, label, emoji]) => ({ id, label: `${emoji}  ${t(label)}` })),
      guess: (said) => shop.aisleFor(said.text),
    },
    sources: ['link', 'file'],
    onAdd: (said) => shop.put(said.qty ? `${said.qty} ${said.text}` : said.text, {
      aisle: said.pick, due: said.day, link: said.link, file: said.file,
    }),
  });
  return (
    <Screen
      title={t('Shopping')}
      tabs={[
        { value: 'list', label: t('List'), icon: 'shopping_cart' },
        { value: 'usuals', label: t('Usuals'), icon: 'star' },
        { value: 'spend', label: t('Spend'), icon: 'bar_chart' },
      ]}
      tab={tab}
      onTab={setTab}
      footer={shop.canAdd && tab === 'list' && !shopping ? adder.bar : undefined}
    >
      <Box class={s.center}>
        <Box class={s.column}>
          {tab === 'list' && <ListTab shop={shop} currency={currency} wide={wide} />}
          {tab === 'usuals' && <UsualsTab shop={shop} />}
          {tab === 'spend' && <SpendTab currency={currency} setCurrency={setCurrency} />}
        </Box>
      </Box>
      {adder.sheet}
    </Screen>
  );
}

/** Scan a packet: one you've had before goes back on the list; a new one is
 *  looked up on Open Food Facts. */
function Scan() {
  const shop = useShop();
  const nav = useNav();
  const toast = useToast();
  const [found, setFound] = useLocal<{ code: string; name: string } | null>(null);
  const [looking, setLooking] = useLocal<boolean>(false);
  const scanned = async ({ text }: { text: string }) => {
    const code = String(text).trim();
    if (!/^\d{8,14}$/.test(code)) return;
    const u = shop.usuals.find((x) => x.barcode === code);
    if (u) {
      shop.put(u.name);
      toast(t('Added {p0}', { p0: u.name }));
      return;
    }
    setLooking(true);
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,quantity`);
      const j = r.ok ? await r.json() : null;
      const p = j && j.product;
      const name = p && p.product_name ? String(p.product_name).slice(0, 80) : '';
      setFound({ code, name });
    } catch {
      setFound({ code, name: '' });
    } finally {
      setLooking(false);
    }
  };
  const keep = () => {
    if (!found || !found.name.trim()) return;
    const name = found.name.trim();
    shop.put(name);
    const u = shop.usualFor(name);
    if (u) shop.edit('usuals', u.id, { barcode: found.code });
    else shop.add('usuals', { name, barcode: found.code, times: 1 });
    toast(t('Added {p0}', { p0: name }));
    setFound(null);
  };
  return (
    <Screen title={t('Scan')}>
      <Scanner height={260} formats={['ean13', 'ean8', 'upca', 'upce']} onScan={scanned} />
      {looking && <Text tone="muted" align="center" class={s.meta}>{'…'}</Text>}
      {found && (
        <Box class={s.card}>
          <Stack gap={12} pad={[12, 0]}>
            <TextField label={t('Name')} value={found.name} max={80} autofocus={!found.name}
                       onChange={(name: string) => setFound({ ...found, name })} onSubmit={keep} />
            <Row gap={8} justify="end">
              <Button variant="plain" onPress={() => setFound(null)}>{t('Cancel')}</Button>
              <Button onPress={keep} disabled={!found.name.trim()}>{t('Add')}</Button>
            </Row>
          </Stack>
        </Box>
      )}
      <Button variant="plain" onPress={() => nav.pop()}>{t('Done')}</Button>
    </Screen>
  );
}

export default defineApp({
  screens: { Home, Scan },
  actions: {
    add: {
      title: 'Add to the shopping list',
      params: {
        items: { type: 'string', title: 'What to add, one per line, such as "2 lemons"' },
      },
      run: ({ items }: { items: string }, { data }: any) => {
        const rows = data.query('items', { limit: 500 }) as Item[];
        const usuals = data.query('usuals', { limit: 500 }) as Usual[];
        let pos = last(rows);
        const added: string[] = [];
        for (const line of linesOf(String(items ?? '').replace(/,\s*/g, '\n'))) {
          const { name, qty } = parse(line);
          const u = usuals.find((x) => x.name.toLowerCase() === name.toLowerCase());
          pos = between(pos, '');
          data.add('items', { name, qty, aisle: u?.aisle, price: u?.price, pos });
          added.push(name);
        }
        if (!added.length) throw new Error('Nothing to add');
        return { added };
      },
    },
    got: {
      title: 'Tick something off the shopping list',
      params: { item: 'string' },
      run: ({ item }: { item: string }, { data }: any) => {
        const rows = data.query('items', { limit: 500 }) as Item[];
        const want = String(item).toLowerCase();
        const r = rows.find((x) => !x.got && x.name.toLowerCase() === want) ?? rows.find((x) => !x.got && x.name.toLowerCase().includes(want));
        if (!r) throw new Error(`${item} isn't on the list`);
        data.edit('items', r.id, { got: true });
        return { got: r.name };
      },
    },
  },
});
