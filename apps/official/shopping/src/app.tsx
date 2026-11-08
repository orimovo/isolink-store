import {
  defineApp, Screen, Stack, Row, Box, Pressable, Section, Checkbox, Text, TextField, Select, Button, IconButton,
  Icon, Sheet, Banner, Chart, Scanner, Avatar, ListItem, Grid, MoneyField, useQuery, useData, useLocal, useStore,
  useLayout, useMe, useChat, useNow, useNav, useToast, fetch, format, t,
} from 'isolink';
import { useShared } from 'isolink/system';
import s from './app.css';
import { between, last } from './pos';

type Item = {
  id: string; name: string; qty?: string; aisle?: string; got?: boolean; pos?: string; price?: number;
  _edited?: number; _by?: string;
};
type Usual = { id: string; name: string; aisle?: string; emoji?: string; price?: number; barcode?: string; times?: number };
type Trip = { id: string; day: string; total?: number; count?: number; who?: string };
type Out = { id: string; who: string; since: number };

const AISLES: [string, string][] = [
  ['fruit', /*t*/'Fruit & veg'],
  ['bakery', /*t*/'Bakery'],
  ['dairy', /*t*/'Dairy'],
  ['meat', /*t*/'Meat & fish'],
  ['cupboard', /*t*/'Cupboard'],
  ['frozen', /*t*/'Frozen'],
  ['drinks', /*t*/'Drinks'],
  ['home', /*t*/'Home'],
  ['other', /*t*/'Other'],
];
const DOTS: Record<string, string> = {
  fruit: '#4ade80', bakery: '#fbbf24', dairy: '#60a5fa', meat: '#f87171', cupboard: '#c084fc',
  frozen: '#67e8f9', drinks: '#f472b6', home: '#a3a3a3', other: '#a3a3a3', '': '#a3a3a3',
};
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
  const put = (text: string) => {
    const { name, qty } = parse(text.trim());
    if (!name) return;
    const u = usualFor(name);
    data.add('items', { name, qty, aisle: aisleFor(name), price: u?.price, pos: between(last(items), '') });
    // Remembered for next time, and counted, so the usual ones come first.
    if (u) data.edit('usuals', u.id, { times: (u.times ?? 0) + 1 });
    else data.add('usuals', { name, aisle: aisleFor(name), times: 1 });
  };
  return { items, usuals, ...data, me, canAdd: me.role !== 'view', put, usualFor };
}

/** Wide windows get one centred column and an Add row in the list, in place of the bar at the bottom. */
const WIDE = 760;

type Adder = { draft: string; setDraft: (t: string) => void; submit: () => void } | null;

function ListTab({ shop, currency, adder }: { shop: ReturnType<typeof useShop>; currency: string; adder: Adder }) {
  const { items, usuals, edit, remove, add, put, canAdd, me } = shop;
  const out = (useQuery('out', { limit: 20 }) as Out[]);
  const members = useChat() as { id: string; name: string }[];
  const now = useNow(60000);
  const shared = useShared() as { text?: string; from?: string } | null;
  const toast = useToast();
  const [taken, setTaken] = useLocal<boolean>(false);
  const [open, setOpen] = useLocal<string | null>(null);
  const [form, setForm] = useLocal<{ name: string; qty: string; price: number | null }>({ name: '', qty: '', price: null });

  const sorted = [...items].sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? ''));
  const toGet = sorted.filter((r) => !r.got);
  const got = sorted.filter((r) => r.got).sort((a, b) => (b._edited ?? 0) - (a._edited ?? 0));
  const groups = [...AISLES.map(([id]) => id), ''].map((a) => [a, toGet.filter((r) => (r.aisle ?? '') === a)] as const);
  const here = out.filter((o) => now - o.since < HOURS_OUT);
  const mine = here.find((o) => o.who === me.id);
  const others = here.filter((o) => o.who !== me.id);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '';
  const left = toGet.reduce((n, r) => n + cost(r), 0);
  const inBasket = got.reduce((n, r) => n + cost(r), 0);
  const handed = shared?.text && !taken ? linesOf(shared.text) : [];

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
    setForm({ name: r.name, qty: r.qty ?? '', price: r.price ?? null });
    setOpen(r.id);
  };
  // Kept when the sheet goes, however it goes.
  const close = () => {
    if (editing && canAdd) {
      const name = form.name.trim() || editing.name;
      const qty = form.qty.trim();
      const price = form.price ?? null;
      if (name !== editing.name || qty !== (editing.qty ?? '') || price !== (editing.price ?? null)) {
        edit('items', editing.id, { name, qty: qty || null, price });
        const u = shop.usualFor(editing.name);
        if (u && price !== null) edit('usuals', u.id, { price });
      }
    }
    setOpen(null);
  };

  const row = (r: Item) => (
    <Pressable key={r.id} class={mine ? s.bigItem : s.item} onPress={() => (mine ? edit('items', r.id, { got: !r.got }) : show(r))}
               onLongPress={() => show(r)}>
      <Checkbox round={!!mine} checked={!!r.got} onChange={() => edit('items', r.id, { got: !r.got })} />
      <Text grow class={r.got ? s.got : mine ? s.bigName : s.name}>{r.name}</Text>
      {r.qty ? <Text class={s.qty}>{r.qty}</Text> : null}
      {r.price ? <Text class={s.price}>{format.money(cost(r), currency)}</Text> : null}
    </Pressable>
  );
  const onList = new Set(toGet.map((r) => r.name.toLowerCase()));
  const again = [...usuals].sort((a, b) => (b.times ?? 0) - (a.times ?? 0))
    .filter((u) => !onList.has(u.name.toLowerCase())).slice(0, 4);

  return (
    <>
      {handed.length > 0 && canAdd && (
        <Banner icon="playlist_add"
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
        adder ? null : (
          <Stack align="center" gap={8} pad={48}>
            <Icon name="shopping_cart" size={40} />
            <Text tone="muted">{t('Nothing to get')}</Text>
          </Stack>
        )
      ) : (
        <Row class={s.head} align="center">
          <Stack grow>
            <Text class={s.count}>{toGet.length === 0 ? t('Nothing to get') : mine ? t('{p0} left', { p0: toGet.length }) : t('{p0} to get', { p0: toGet.length })}</Text>
            {got.length > 0 && <Text class={s.sub}>{t('{p0} got', { p0: got.length })}</Text>}
          </Stack>
          {canAdd && !mine && toGet.length > 0 && <Button variant="tonal" icon="storefront" onPress={start}>{t('Shop')}</Button>}
        </Row>
      )}
      {adder && canAdd && (
        <Row class={s.add} align="center" gap={10}>
          <Icon name="add_circle_outline" size={20} />
          <Stack grow>
            <TextField plain value={adder.draft} onChange={adder.setDraft} placeholder={t('Add')} onSubmit={adder.submit} />
          </Stack>
        </Row>
      )}
      {adder && items.length === 0 && (
        <Stack align="center" gap={10} pad={64}>
          <Icon name="shopping_cart" size={44} />
          <Text class={s.emptyText}>{t('Nothing to get')}</Text>
        </Stack>
      )}
      {adder && canAdd && !mine && again.length > 0 && (
        <Box class={items.length === 0 ? [s.usuals, s.usualsMid] : s.usuals}>
          {again.map((u) => (
            <Pressable key={u.id} class={s.usual} onPress={() => put(u.name)}>
              <Text>{`+ ${u.name}`}</Text>
            </Pressable>
          ))}
        </Box>
      )}
      {groups.map(([a, rows]) =>
        rows.length === 0 ? null : (
          <Box key={a || 'none'} class={s.card}>
            <Box class={s.aisle}>
              <Box class={s.dot} style={{ background: DOTS[a] }} />
              <Text>{t(AISLES.find(([id]) => id === a)?.[1] ?? 'Other')}</Text>
            </Box>
            {rows.map(row)}
          </Box>
        ),
      )}
      {!adder && canAdd && !mine && again.length > 0 && (
        <Box class={s.usuals}>
          {again.map((u) => (
            <Pressable key={u.id} class={s.usual} onPress={() => put(u.name)}>
              <Text>{`+ ${u.name}`}</Text>
            </Pressable>
          ))}
        </Box>
      )}
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
          <Box class={s.card}>{got.map(row)}</Box>
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
      <Sheet open={!!editing} onClose={close}>
        {editing && (
          <Stack gap={12}>
            <TextField label={t('Name')} value={form.name} max={80}
                       onChange={(name: string) => setForm({ ...form, name })} />
            <Row gap={8}>
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
                    options={AISLES.map(([value, label]) => ({ value, label: t(label) }))}
                    onChange={(aisle: string) => {
                      edit('items', editing.id, { aisle });
                      const u = shop.usualFor(editing.name);
                      if (u) edit('usuals', u.id, { aisle });
                    }} />
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
      {canAdd && (
        <Button variant="tonal" icon="barcode_reader" expand onPress={() => nav.push('Scan')}>{t('Scan')}</Button>
      )}
      {sorted.length === 0 ? (
        <Stack align="center" gap={8} pad={48}>
          <Icon name="star" size={40} />
          <Text tone="muted">{t('No usuals yet')}</Text>
        </Stack>
      ) : (
        <Grid min={84} gap={8} class={s.tiles}>
          {sorted.map((u) => {
            const on = onList(u);
            return (
              <Pressable key={u.id} class={on ? [s.tile, s.tileOn] : s.tile}
                         onPress={canAdd ? () => (on ? remove('items', on.id) : put(u.name)) : undefined}
                         onLongPress={canAdd ? () => { setForm({ name: u.name, emoji: u.emoji ?? '' }); setOpen(u.id); } : undefined}>
                <Text class={s.emoji}>{emojiFor(u)}</Text>
                <Text class={s.tileName} lines={1}>{u.name}</Text>
              </Pressable>
            );
          })}
        </Grid>
      )}
      <Sheet open={!!editing} onClose={close}>
        {editing && (
          <Stack gap={12}>
            <Row gap={8}>
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
  const months: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      label: t(MONTHS[d.getMonth()]),
      value: trips.filter((x) => x.day.startsWith(key)).reduce((n, x) => n + (x.total ?? 0), 0),
    });
  }
  const thisMonth = months[months.length - 1].value;
  const count = trips.filter((x) => x.day.startsWith(format.date(Date.now(), 'iso').slice(0, 7))).length;
  return (
    <>
      <Row align="center" class={s.head}>
        <Stack grow>
          <Text class={s.count}>{format.money(thisMonth, currency)}</Text>
          <Text class={s.sub}>{count === 1 ? t('This month · 1 shop') : t('This month · {p0} shops', { p0: count })}</Text>
        </Stack>
        <Select variant="chip" value={currency} options={CURRENCIES} onChange={setCurrency} />
      </Row>
      <Box class={s.card}><Chart kind="bar" data={months} height={140} /></Box>
      {trips.length === 0 ? (
        <Stack align="center" gap={8} pad={32}>
          <Icon name="receipt_long" size={36} />
          <Text tone="muted">{t('No shops yet')}</Text>
        </Stack>
      ) : (
        <Box class={s.card}>
          {trips.slice(0, 20).map((x) => (
            <ListItem key={x.id} title={format.date(x.day)}
                      subtitle={x.count === 1 ? t('1 thing') : t('{p0} things', { p0: x.count ?? 0 })}
                      leading={x.who ? <Avatar person={x.who} size={28} /> : <Icon name="storefront" />}
                      trailing={<Text bold>{format.money(x.total ?? 0, currency)}</Text>} />
          ))}
        </Box>
      )}
    </>
  );
}
const MONTHS = [/*t*/'Jan', /*t*/'Feb', /*t*/'Mar', /*t*/'Apr', /*t*/'May', /*t*/'Jun', /*t*/'Jul', /*t*/'Aug',
  /*t*/'Sep', /*t*/'Oct', /*t*/'Nov', /*t*/'Dec'];

function Home() {
  const shop = useShop();
  const [tab, setTab] = useStore<string>('tab', 'list');
  const [currency, setCurrency] = useStore<string>('currency', 'GBP');
  const [draft, setDraft] = useLocal<string>('');
  const wide = useLayout().width >= WIDE;
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    shop.put(text);
  };
  const body = (
    <>
      {tab === 'list' && <ListTab shop={shop} currency={currency} adder={wide ? { draft, setDraft, submit } : null} />}
      {tab === 'usuals' && <UsualsTab shop={shop} />}
      {tab === 'spend' && <SpendTab currency={currency} setCurrency={setCurrency} />}
    </>
  );
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
      footer={
        shop.canAdd && tab === 'list' && !wide ? (
          <Row gap={8} align="center">
            <Stack grow>
              <TextField value={draft} onChange={setDraft} placeholder={t('Add')} onSubmit={submit} />
            </Stack>
            <IconButton icon="arrow_upward" variant="filled" label={t('Add')} onPress={submit} />
          </Row>
        ) : undefined
      }
    >
      {wide ? (
        <Box class={s.center}>
          <Box class={s.column}>{body}</Box>
        </Box>
      ) : body}
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
      {looking && <Text tone="muted" align="center" class={s.sub}>{'…'}</Text>}
      {found && (
        <Box class={s.card}>
          <Stack gap={10}>
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
