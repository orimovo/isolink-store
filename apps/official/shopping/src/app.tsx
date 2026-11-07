import {
  defineApp, Screen, Stack, Row, Box, Pressable, Section, Checkbox, Text, TextField, Select, Button,
  IconButton, Icon, Sheet, useQuery, useData, useLocal, useMe, t,
} from 'isolink';
import s from './app.css';
import { between, last } from './pos';

type Item = { id: string; name: string; qty?: string; aisle?: string; got?: boolean; pos?: string; _edited?: number };
type Usual = { id: string; name: string; aisle?: string };

const AISLES: [string, string][] = [
  ['fruit', 'Fruit & veg'],
  ['bakery', 'Bakery'],
  ['dairy', 'Dairy'],
  ['meat', 'Meat & fish'],
  ['cupboard', 'Cupboard'],
  ['frozen', 'Frozen'],
  ['drinks', 'Drinks'],
  ['home', 'Home'],
  ['other', 'Other'],
];

/** "2 milk" or "milk x2": the number is the amount. */
function parse(text: string): { name: string; qty?: string } {
  const lead = /^(\d+)\s+(.+)$/.exec(text);
  if (lead) return { name: lead[2], qty: lead[1] };
  const tail = /^(.+?)\s*[x×](\d+)$/.exec(text);
  if (tail) return { name: tail[1], qty: tail[2] };
  return { name: text };
}

function Home() {
  const items = useQuery('items', { limit: 500 }) as Item[];
  const usuals = useQuery('usuals', { limit: 500 }) as Usual[];
  const { add, edit, remove } = useData();
  const me = useMe();
  const [draft, setDraft] = useLocal<string>('');
  const [open, setOpen] = useLocal<string | null>(null);
  const [form, setForm] = useLocal<{ name: string; qty: string }>({ name: '', qty: '' });
  const canAdd = me.role !== 'view';

  /** The aisle something usually goes in: from the usuals, then past items. */
  const aisleFor = (name: string) => {
    const n = name.toLowerCase();
    for (const r of [...usuals, ...items]) if (r.name.toLowerCase() === n && r.aisle) return r.aisle;
    return undefined;
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    const { name, qty } = parse(text);
    const aisle = aisleFor(name);
    setDraft('');
    add('items', { name, qty, aisle, pos: between(last(items), '') });
    // Remembered for next time.
    if (!usuals.some((u) => u.name.toLowerCase() === name.toLowerCase())) add('usuals', { name, aisle });
  };

  const sorted = [...items].sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? ''));
  const toGet = sorted.filter((r) => !r.got);
  const got = sorted.filter((r) => r.got).sort((a, b) => (b._edited ?? 0) - (a._edited ?? 0));
  const groups = [...AISLES.map(([id]) => id), ''].map((a) => [a, toGet.filter((r) => (r.aisle ?? '') === a)] as const);
  const editing = items.find((r) => r.id === open);
  const show = (r: Item) => {
    setForm({ name: r.name, qty: r.qty ?? '' });
    setOpen(r.id);
  };
  // Kept when the sheet goes, however it goes.
  const close = () => {
    if (editing && canAdd) {
      const name = form.name.trim() || editing.name;
      const qty = form.qty.trim();
      if (name !== editing.name || qty !== (editing.qty ?? '')) edit('items', editing.id, { name, qty: qty || null });
    }
    setOpen(null);
  };

  const DOTS: Record<string, string> = {
    fruit: '#4ade80', bakery: '#fbbf24', dairy: '#60a5fa', meat: '#f87171', cupboard: '#c084fc',
    frozen: '#67e8f9', drinks: '#f472b6', home: '#a3a3a3', other: '#a3a3a3', '': '#a3a3a3',
  };
  const row = (r: Item) => (
    <Pressable key={r.id} class={s.item} onPress={() => show(r)} onLongPress={() => show(r)}>
      <Checkbox checked={!!r.got} onChange={() => edit('items', r.id, { got: !r.got })} />
      <Text grow class={r.got ? s.got : s.name}>{r.name}</Text>
      {r.qty ? <Text class={s.qty}>{r.qty}</Text> : null}
    </Pressable>
  );
  // Usual things not on the list: one tap puts them back.
  const onList = new Set(toGet.map((r) => r.name.toLowerCase()));
  const again = usuals.filter((u) => !onList.has(u.name.toLowerCase())).slice(0, 4);
  const readd = (u: Usual) => add('items', { name: u.name, aisle: u.aisle, pos: between(last(items), '') });

  return (
    <Screen
      title={t('Shopping')}
      footer={
        canAdd ? (
          <Row gap={8} align="center">
            <Stack grow>
              <TextField value={draft} onChange={setDraft} placeholder={t('Add')} onSubmit={submit} />
            </Stack>
            <IconButton icon="arrow_upward" variant="filled" label={t('Add')} onPress={submit} />
          </Row>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <Stack align="center" gap={8} pad={48}>
          <Icon name="shopping_cart" size={40} />
          <Text tone="muted">{t('Nothing to get')}</Text>
        </Stack>
      ) : (
        <Box class={s.head}>
          <Text class={s.count}>{toGet.length === 0 ? t('Nothing to get') : t('{p0} to get', { p0: toGet.length })}</Text>
          {got.length > 0 && <Text class={s.sub}>{t('{p0} got', { p0: got.length })}</Text>}
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
      {canAdd && again.length > 0 && (
        <Box class={s.usuals}>
          {again.map((u) => (
            <Pressable key={u.id} class={s.usual} onPress={() => readd(u)}>
              <Text>{`+ ${u.name}`}</Text>
            </Pressable>
          ))}
        </Box>
      )}
      {got.length > 0 && (
        <Section
          title={t('Got · {p0}', { p0: got.length })}
          folded
          action={
            canAdd ? (
              <Button variant="plain" onPress={() => got.forEach((r) => remove('items', r.id))}>{t('Clear')}</Button>
            ) : undefined
          }
        >
          <Box class={s.card}>{got.map(row)}</Box>
        </Section>
      )}
      <Sheet open={!!editing} onClose={close}>
        {editing && (
          <Stack gap={12}>
            <TextField label={t('Name')} value={form.name} max={80}
                       onChange={(name: string) => setForm({ ...form, name })} />
            <TextField label={t('Amount')} value={form.qty} max={20}
                       onChange={(qty: string) => setForm({ ...form, qty })} />
            <Select label={t('Aisle')} value={editing.aisle ?? null}
                    options={AISLES.map(([value, label]) => ({ value, label: t(label) }))}
                    onChange={(aisle: string) => {
                      edit('items', editing.id, { aisle });
                      const u = usuals.find((x) => x.name.toLowerCase() === editing.name.toLowerCase());
                      if (u) edit('usuals', u.id, { aisle });
                    }} />
            <Row gap={8} justify="end">
              <Button variant="danger" onPress={() => { remove('items', editing.id); setOpen(null); }}>{t('Delete')}</Button>
              <Button onPress={close}>{t('Done')}</Button>
            </Row>
          </Stack>
        )}
      </Sheet>
    </Screen>
  );
}

export default defineApp({ screens: { Home } });
