import {
  defineApp, Screen, Stack, Row, Box, Pressable, Text, TextField, Button, IconButton, Icon, Fab, Chip, Checkbox, ContextMenu,
  Composer, DatePicker, TimePicker, PlacePicker, Map, MoneyField, Segmented, Select, Stat, Avatar, Upload, Badge, Progress, Scroll,
  useQuery, useData, useLocal, useAsync, useStore, useMe, useChat, useNav, useNow, useDialog, useToast, usePlatform, fetch, format, has, t,
} from 'isolink';
import s from './app.css';
import { between, last } from './pos';
import { balances, settle } from './money';

type Place = { lat: number; lng: number; name?: string };
type Trip = { id: string; name: string; emoji?: string; place?: Place; start?: string; end?: string; currency?: string };
type Plan = {
  id: string; what: string; day?: string; kind?: string; who?: string; booked?: boolean; link?: string; cost?: number;
  trip?: string; time?: string; place?: Place; ticket?: unknown; pos?: string;
};
type Item = { id: string; item: string; packed?: boolean; who?: string; trip?: string; pos?: string };
type Cost = { id: string; what: string; amount?: number; paid?: string; split?: string[]; trip?: string; day?: string };
type Member = { id: string; name: string };

const KINDS: [string, string, string][] = [
  ['travel', /*t*/'Travel', 'flight'], ['stay', /*t*/'Stay', 'home'], ['eat', /*t*/'Eat', 'restaurant'], ['do', /*t*/'Do', 'confirmation_number'],
];
const EMOJIS = ['✈️', '🏖️', '🏔️', '🏙️', '🚆', '🚗', '⛺', '🛳️', '🎿', '🌴'];
const CURRENCIES = ['GBP', 'EUR', 'USD', 'AUD', 'CAD', 'JPY', 'INR', 'CNY', 'BRL', 'AED'];
const PACK = [/*t*/'Passports', /*t*/'Chargers', /*t*/'Toothbrush', /*t*/'Medicine', /*t*/'Sunglasses', /*t*/'Swimwear', /*t*/'Rain jacket', /*t*/'Adapter'];
const WEEKDAYS = [/*t*/'Sun', /*t*/'Mon', /*t*/'Tue', /*t*/'Wed', /*t*/'Thu', /*t*/'Fri', /*t*/'Sat'];
const WEATHER: [number, string][] = [[0, '☀️'], [3, '⛅'], [48, '🌫️'], [67, '🌧️'], [77, '🌨️'], [82, '🌦️'], [99, '⛈️']];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayAt = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysBetween = (a: string, b: string) => Math.round((dayAt(b).getTime() - dayAt(a).getTime()) / 864e5);
const dayName = (k: string) => `${t(WEEKDAYS[dayAt(k).getDay()])} ${dayAt(k).getDate()}/${dayAt(k).getMonth() + 1}`;
const iconOf = (kind?: string) => KINDS.find(([k]) => k === kind)?.[2] ?? 'event';

function useTrips() {
  const trips = (useQuery('trips', { limit: 100 }) as Trip[]).sort((a, b) => (a.start ?? '9').localeCompare(b.start ?? '9'));
  const plans = useQuery('plans', { limit: 500 }) as Plan[];
  const packing = useQuery('packing', { limit: 500 }) as Item[];
  const costs = useQuery('costs', { limit: 500 }) as Cost[];
  const data = useData();
  const me = useMe();
  const members = useChat() as Member[];
  const now = useNow(60000);
  const today = iso(new Date(now));
  const [chosen, setChosen] = useStore<string>('trip', '');
  // The one chosen, else the next one coming, else the last.
  const trip =
    trips.find((x) => x.id === chosen) ?? trips.find((x) => (x.end ?? x.start ?? '9') >= today) ?? trips[trips.length - 1] ?? null;
  // Rows from before there were trips belong to the first one.
  const first = trips[0]?.id;
  function ofTrip<T extends { trip?: string }>(rows: T[]) {
    return rows.filter((r) => (r.trip ?? first) === trip?.id);
  }
  const nameOf = (id?: string) => (id === me.id ? t('You') : members.find((m) => m.id === id)?.name ?? '');
  return {
    trips, trip, setTrip: setChosen, plans: ofTrip(plans), packing: ofTrip(packing), costs: ofTrip(costs), all: { plans, packing, costs },
    ...data, me, members, today, nameOf, canEdit: me.role !== 'view',
  };
}
type Ctx = ReturnType<typeof useTrips>;

/** The trip's days, start to end, plus any planned outside them. */
function daysOf(c: Ctx) {
  const tr = c.trip;
  const out = new Set<string>();
  if (tr?.start) {
    const n = tr.end ? Math.min(60, Math.max(0, daysBetween(tr.start, tr.end))) : 0;
    for (let i = 0; i <= n; i++) {
      const d = dayAt(tr.start);
      out.add(iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)));
    }
  }
  for (const p of c.plans) if (p.day) out.add(p.day);
  return [...out].sort();
}

function Countdown({ c }: { c: Ctx }) {
  const tr = c.trip!;
  const nav = useNav();
  const to = tr.start ? daysBetween(c.today, tr.start) : null;
  const left = tr.end ? daysBetween(c.today, tr.end) : null;
  const line =
    to === null ? '' : to > 1 ? t('{p0} days to go', { p0: to }) : to === 1 ? t('Tomorrow') : to === 0 ? t('Today') :
    left !== null && left >= 0 ? t('Day {p0}', { p0: -to + 1 }) : t('Back home');
  const booked = c.plans.filter((p) => p.booked).length;
  return (
    <Pressable class={s.hero} onPress={c.canEdit ? () => nav.push('Trip', { id: tr.id }) : undefined}>
      <Text class={s.heroEmoji}>{tr.emoji || '✈️'}</Text>
      <Stack grow gap={2}>
        <Text class={s.heroName}>{tr.name}</Text>
        <Text class={s.heroSub}>{[tr.place?.name, tr.start && tr.end ? `${dayName(tr.start)} – ${dayName(tr.end)}` : tr.start ? dayName(tr.start) : ''].filter(Boolean).join(' · ')}</Text>
        {c.plans.length > 0 && <Text class={s.heroSub}>{t('{p0} of {p1} booked', { p0: booked, p1: c.plans.length })}</Text>}
      </Stack>
      {line ? <Text class={s.heroCount}>{line}</Text> : null}
    </Pressable>
  );
}

function PlanTab({ c }: { c: Ctx }) {
  // macOS groups a list's rows on one card.
  const joined = usePlatform().os === 'mac';
  const nav = useNav();
  const dialog = useDialog();
  // Held on a phone, right-clicked on a computer.
  const hold = async (p: Plan) => {
    if (!c.canEdit) return;
    const picked = await dialog.menu([
      { id: 'edit', icon: 'edit', label: t('Edit') },
      { id: 'booked', icon: 'check_circle', label: p.booked ? t('Not booked') : t('Booked') },
      { divider: true },
      { id: 'delete', icon: 'delete', label: t('Delete'), danger: true },
    ]);
    if (picked === 'edit') nav.push('Plan', { id: p.id });
    if (picked === 'booked') c.edit('plans', p.id, { booked: !p.booked });
    if (picked === 'delete' && (await dialog.confirm({ title: t('Delete this plan?'), ok: t('Delete'), danger: true }))) {
      c.remove('plans', p.id);
    }
  };
  const [view, setView] = useStore<string>('view', 'days');
  const days = daysOf(c);
  const undated = c.plans.filter((p) => !p.day);
  const pinned = c.plans.filter((p) => p.place);
  const row = (p: Plan, i: number) => (
    <Pressable key={p.id} class={joined ? [s.plan, i ? s.inRow : s.inFirst] : s.plan} onPress={() => nav.push('Plan', { id: p.id })} onLongPress={c.canEdit ? () => hold(p) : undefined}>
      <Box class={s.kind}><Icon name={iconOf(p.kind)} size={18} /></Box>
      <Stack grow>
        <Text bold>{p.what}</Text>
        <Text class={s.sub}>{[p.time, p.place?.name, p.who ? c.nameOf(p.who) : ''].filter(Boolean).join(' · ')}</Text>
      </Stack>
      {p.cost ? <Text class={s.sub}>{format.money(p.cost, c.trip?.currency ?? 'GBP')}</Text> : null}
      {p.booked ? <Icon name="check_circle" size={18} tone="success" /> : null}
    </Pressable>
  );
  return (
    <>
      {pinned.length > 0 && (
        <Segmented value={view} onChange={setView}
                   options={[{ value: 'days', label: t('Days'), icon: 'view_agenda' }, { value: 'map', label: t('Map'), icon: 'map' }]} />
      )}
      {view === 'map' && pinned.length > 0 ? (
        <Box class={s.map}>
          <Map pins={pinned.map((p) => ({ lat: p.place!.lat, lng: p.place!.lng, label: p.what }))}
               lines={pinned.length > 1 ? [{ points: pinned.map((p) => p.place!) }] : undefined} />
        </Box>
      ) : (
        <>
          {days.map((d) => {
            const rows = c.plans.filter((p) => p.day === d).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || (a.pos ?? '').localeCompare(b.pos ?? ''));
            return (
              <Box key={d}>
                <Row align="center" class={s.dayHead}>
                  <Text class={d === c.today ? [s.h, s.on] : s.h} grow>{dayName(d)}</Text>
                  {c.canEdit && <IconButton icon="add" label={t('Add')} onPress={() => nav.push('Plan', { day: d })} />}
                </Row>
                {rows.length > 0 && <Stack gap={joined ? 0 : 6} class={joined ? s.joined : undefined}>{rows.map(row)}</Stack>}
              </Box>
            );
          })}
          {undated.length > 0 && (
            <>
              <Text class={s.h}>{t('Any day')}</Text>
              <Stack gap={6}>{undated.map(row)}</Stack>
            </>
          )}
          {!c.plans.length && !days.length && <Text tone="muted" align="center" class={s.empty}>{t('Nothing planned yet')}</Text>}
        </>
      )}
    </>
  );
}

function MoneyTab({ c }: { c: Ctx }) {
  const joined = usePlatform().os === 'mac';
  const nav = useNav();
  const dialog = useDialog();
  const holdCost = async (x: Cost) => {
    if (!c.canEdit) return;
    const picked = await dialog.menu([
      { id: 'edit', icon: 'edit', label: t('Edit') },
      { divider: true },
      { id: 'delete', icon: 'delete', label: t('Delete'), danger: true },
    ]);
    if (picked === 'edit') nav.push('Cost', { id: x.id });
    if (picked === 'delete' && (await dialog.confirm({ title: t('Delete this cost?'), ok: t('Delete'), danger: true }))) {
      c.remove('costs', x.id);
    }
  };
  const cur = c.trip?.currency ?? 'GBP';
  const spent = c.costs.reduce((n, x) => n + (x.amount ?? 0), 0);
  const planned = c.plans.reduce((n, p) => n + (p.cost ?? 0), 0);
  const pays = settle(balances(c.costs));
  const mine = balances(c.costs)[c.me.id] ?? 0;
  return (
    <>
      <Row gap={8}>
        <Stack grow class={s.stat}><Stat label={t('Spent')} value={format.money(spent, cur)} /></Stack>
        <Stack grow class={s.stat}><Stat label={t('Plans')} value={format.money(planned, cur)} /></Stack>
        <Stack grow class={s.stat}>
          <Stat label={mine >= 0 ? t('You’re owed') : t('You owe')} value={format.money(Math.abs(mine), cur)} />
        </Stack>
      </Row>
      {pays.length > 0 && (
        <Box class={s.panel}>
          <Text class={s.h}>{t('Settle up')}</Text>
          {pays.map((p, i) => (
            <Row key={i} gap={8} align="center" class={s.pay}>
              <Avatar person={p.from} size={26} />
              <Text grow>{t('{p0} pays {p1}', { p0: c.nameOf(p.from), p1: c.nameOf(p.to) })}</Text>
              <Text bold>{format.money(p.amount, cur)}</Text>
            </Row>
          ))}
        </Box>
      )}
      <Stack gap={joined ? 0 : 6} class={joined && c.costs.length ? [s.list, s.joined] : s.list}>
        {[...c.costs].sort((a, b) => (b.day ?? '').localeCompare(a.day ?? '')).map((x, i) => (
          <Pressable key={x.id} class={joined ? [s.plan, i ? s.inRow : s.inFirst] : s.plan} onPress={c.canEdit ? () => nav.push('Cost', { id: x.id }) : undefined}
                     onLongPress={c.canEdit ? () => holdCost(x) : undefined}>
            <Avatar person={x.paid} size={30} />
            <Stack grow>
              <Text bold>{x.what}</Text>
              <Text class={s.sub}>{[x.day ? dayName(x.day) : '', x.split?.length ? t('Split {p0} ways', { p0: x.split.length }) : ''].filter(Boolean).join(' · ')}</Text>
            </Stack>
            <Text bold>{format.money(x.amount ?? 0, cur)}</Text>
          </Pressable>
        ))}
      </Stack>
      {!c.costs.length && <Text tone="muted" align="center" class={s.empty}>{t('No costs yet')}</Text>}
    </>
  );
}

/** One more thing to pack, last on the list. */
const pack = (c: Ctx, item: string) => {
  if (!item.trim()) return;
  c.add('packing', { item: item.trim().slice(0, 80), trip: c.trip?.id ?? null, pos: between(last(c.packing), '') });
};

function PackingTab({ c }: { c: Ctx }) {
  const [text, setText] = useLocal('');
  const [mineOnly, setMineOnly] = useLocal(false);
  const tr = c.trip;
  const rows = [...c.packing].filter((r) => !mineOnly || !r.who || r.who === c.me.id).sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? ''));
  const left = rows.filter((r) => !r.packed);
  const done = rows.filter((r) => r.packed);
  const add = (item: string) => {
    pack(c, item);
    setText('');
  };
  // The forecast, once the trip is within the 16 days it covers.
  const near = tr?.place && tr.start && daysBetween(c.today, tr.start) <= 15 && daysBetween(c.today, tr.end ?? tr.start) >= 0;
  const key = near ? `${tr!.place!.lat},${tr!.place!.lng},${tr!.start},${tr!.end},${c.today}` : '';
  const sky = useAsync(async () => {
    if (!key) return [];
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${tr!.place!.lat}&longitude=${tr!.place!.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`);
    const d = r.ok ? (await r.json())?.daily : null;
    if (!d) return [];
    return (d.time as string[])
      .map((day, i) => ({ day, code: d.weather_code[i] as number, hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]) }))
      .filter((x) => x.day >= tr!.start! && x.day <= (tr!.end ?? tr!.start!));
  }, [key]);
  const forecast = sky.data ?? [];
  const suggest = PACK.filter((p) => !c.packing.some((r) => r.item.toLowerCase() === t(p).toLowerCase()));
  return (
    <>
      {forecast.length ? (
        <Scroll direction="horizontal">
          <Row gap={8} class={s.sky}>
            {forecast.map((d) => (
              <Stack key={d.day} align="center" gap={2} class={s.skyDay}>
                <Text class={s.sub}>{t(WEEKDAYS[dayAt(d.day).getDay()])}</Text>
                <Text class={s.skyIcon}>{WEATHER.find(([n]) => d.code <= n)?.[1] ?? '☁️'}</Text>
                <Text bold>{`${d.hi}°`}</Text>
                <Text class={s.sub}>{`${d.lo}°`}</Text>
              </Stack>
            ))}
          </Row>
        </Scroll>
      ) : null}
      {rows.length > 0 && <Progress value={done.length / rows.length} label={t('{p0} of {p1} packed', { p0: done.length, p1: rows.length })} />}
      {/* Isolink 0.26.52 on adds from the chat's message box, along the bottom. */}
      {c.canEdit && !has('composer') && (
        <Row gap={8} align="center" class={s.addRow}>
          <Stack grow><TextField value={text} placeholder={t('Add an item')} max={80} onChange={setText} onSubmit={add} /></Stack>
          <IconButton icon="add" label={t('Add')} onPress={() => add(text)} />
        </Row>
      )}
      {c.canEdit && suggest.length > 0 && (
        <Row gap={6} wrap class={s.chips}>
          {suggest.slice(0, 6).map((p) => <Chip key={p} label={t(p)} icon="add" onPress={() => add(t(p))} />)}
        </Row>
      )}
      <Row gap={6} class={s.chips}>
        <Chip label={t('Mine')} icon="person" selected={mineOnly} onPress={() => setMineOnly(!mineOnly)} />
      </Row>
      {[...left, ...done].map((r) => (
        <ContextMenu key={r.id} items={c.canEdit ? [{ id: 'delete', icon: 'delete', label: t('Delete'), danger: true }] : []}
                     onPick={(id: string) => id === 'delete' && c.remove('packing', r.id)}>
          <Row gap={8} align="center" class={s.item}>
            <Checkbox round checked={!!r.packed} label={r.item} onChange={c.canEdit ? (packed: boolean) => c.edit('packing', r.id, { packed }) : undefined} />
            <Stack grow />
            {r.who ? <Avatar person={r.who} size={24} /> : null}
            {c.canEdit && (
              <IconButton icon={r.who === c.me.id ? 'person' : 'person_add_alt'} label={t('Mine')}
                          onPress={() => c.edit('packing', r.id, { who: r.who === c.me.id ? null : c.me.id })} />
            )}
          </Row>
        </ContextMenu>
      ))}
    </>
  );
}

function Home() {
  const c = useTrips();
  const nav = useNav();
  const dialog = useDialog();
  const [tab, setTab] = useStore<string>('tab', 'plan');
  const [packing, setPacking] = useLocal('');
  const pickTrip = async () => {
    const id = await dialog.menu([
      ...c.trips.map((x) => ({ id: x.id, label: `${x.emoji ?? '✈️'} ${x.name}`, icon: x.id === c.trip?.id ? 'check' : undefined })),
      ...(c.canEdit ? [{ divider: true }, { id: '+', label: t('New trip'), icon: 'add' }] : []),
    ]);
    if (id === '+') nav.push('Trip', {});
    else if (id) c.setTrip(id);
  };
  const fab =
    !c.canEdit || !c.trip ? undefined
      : tab === 'plan' ? <Fab icon="add" onPress={() => nav.push('Plan', {})} />
      : tab === 'money' ? <Fab icon="add" onPress={() => nav.push('Cost', {})} />
      : undefined;
  return (
    <Screen
      title={t('Trip planner')}
      tabs={[
        { value: 'plan', label: t('Plan'), icon: 'event' },
        { value: 'money', label: t('Money'), icon: 'payments' },
        { value: 'packing', label: t('Packing'), icon: 'luggage' },
      ]}
      tab={tab}
      onTab={setTab}
      actions={c.trips.length > 0 ? <IconButton icon="swap_horiz" label={t('Trips')} onPress={pickTrip} /> : undefined}
      fab={fab}
      footer={tab === 'packing' && c.canEdit && c.trip && has('composer') ? (
        <Composer value={packing} onChange={setPacking} placeholder={t('Add an item')} sendLabel={t('Add')} ready={!!packing.trim()}
                  onSubmit={() => { pack(c, packing); setPacking(''); }} />
      ) : undefined}
    >
      {!c.trip ? (
        <Stack align="center" gap={10} class={s.empty}>
          <Text class={s.bigEmoji}>🧳</Text>
          <Text tone="muted">{t('No trips yet')}</Text>
          {c.canEdit && <Button onPress={() => nav.push('Trip', {})}>{t('New trip')}</Button>}
        </Stack>
      ) : (
        <>
          <Countdown c={c} />
          {tab === 'plan' && <PlanTab c={c} />}
          {tab === 'money' && <MoneyTab c={c} />}
          {tab === 'packing' && <PackingTab c={c} />}
        </>
      )}
    </Screen>
  );
}

function TripScreen() {
  const nav = useNav();
  const c = useTrips();
  const dialog = useDialog();
  const { id } = nav.params as { id?: string };
  const was = c.trips.find((x) => x.id === id);
  const [f, setF] = useLocal<Trip>(was ?? { id: '', name: '', emoji: EMOJIS[c.trips.length % EMOJIS.length], currency: 'GBP' });
  const set = (x: Partial<Trip>) => setF({ ...f, ...x });
  const save = () => {
    const name = f.name.trim();
    if (!name) return;
    const fields = { name, emoji: f.emoji, place: f.place ?? null, start: f.start ?? null, end: f.end && f.start && f.end < f.start ? f.start : f.end ?? null, currency: f.currency ?? 'GBP' };
    if (was) c.edit('trips', was.id, fields);
    else {
      const nid = c.add('trips', fields);
      // The first trip takes everything planned before trips.
      if (!c.trips.length) {
        for (const p of c.all.plans) if (!p.trip) c.edit('plans', p.id, { trip: nid });
        for (const p of c.all.packing) if (!p.trip) c.edit('packing', p.id, { trip: nid });
        for (const p of c.all.costs) if (!p.trip) c.edit('costs', p.id, { trip: nid });
      }
      c.setTrip(nid);
    }
    nav.pop();
  };
  return (
    <Screen title={was ? t('Edit') : t('New trip')}
            actions={was ? (
              <IconButton icon="delete" label={t('Delete')} onPress={async () => {
                if (!(await dialog.confirm({ title: t('Delete this trip?'), ok: t('Delete'), danger: true }))) return;
                for (const p of c.plans) c.remove('plans', p.id);
                for (const p of c.packing) c.remove('packing', p.id);
                for (const p of c.costs) c.remove('costs', p.id);
                c.remove('trips', was.id);
                c.setTrip('');
                nav.pop();
              }} />
            ) : undefined}
            footer={<Button expand disabled={!f.name.trim()} onPress={save}>{t('Save')}</Button>}>
      <Stack gap={12}>
        <TextField label={t('Name')} value={f.name} max={80} autofocus={!was} onChange={(name: string) => set({ name })} />
        <Row gap={6} wrap>
          {EMOJIS.map((e) => (
            <Pressable key={e} class={f.emoji === e ? [s.pick, s.picked] : s.pick} onPress={() => set({ emoji: e })}>
              <Text class={s.pickEmoji}>{e}</Text>
            </Pressable>
          ))}
        </Row>
        <PlacePicker label={t('Where')} value={f.place} onChange={(place: Place) => set({ place })} />
        <Row gap={8} align="center">
          <Text grow>{t('From')}</Text>
          <DatePicker value={f.start} placeholder={t('Start')} onChange={(start: string) => set({ start })} />
        </Row>
        <Row gap={8} align="center">
          <Text grow>{t('To')}</Text>
          <DatePicker value={f.end} min={f.start} placeholder={t('End')} onChange={(end: string) => set({ end })} />
        </Row>
        <Row gap={8} align="center">
          <Text grow>{t('Currency')}</Text>
          <Select variant="chip" value={f.currency ?? 'GBP'} options={CURRENCIES} onChange={(currency: string) => set({ currency })} />
        </Row>
      </Stack>
    </Screen>
  );
}

function PlanScreen() {
  const nav = useNav();
  const c = useTrips();
  const dialog = useDialog();
  const { id, day } = nav.params as { id?: string; day?: string };
  const was = c.plans.find((x) => x.id === id);
  const [f, setF] = useLocal<Plan>(was ?? { id: '', what: '', kind: 'do', day: day ?? c.trip?.start });
  const set = (x: Partial<Plan>) => setF({ ...f, ...x });
  const save = () => {
    const what = f.what.trim();
    if (!what) return;
    const fields = {
      what, kind: f.kind, day: f.day ?? null, time: f.time ?? null, place: f.place ?? null, who: f.who ?? null,
      booked: !!f.booked, link: f.link?.trim() || null, cost: f.cost || null, ticket: f.ticket ?? null,
    };
    if (was) c.edit('plans', was.id, fields);
    else c.add('plans', { ...fields, trip: c.trip?.id ?? null, pos: between(last(c.plans), '') });
    nav.pop();
  };
  return (
    <Screen title={was ? was.what : t('New plan')}
            actions={was && c.canEdit ? (
              <IconButton icon="delete" label={t('Delete')} onPress={async () => {
                if (!(await dialog.confirm({ title: t('Delete this plan?'), ok: t('Delete'), danger: true }))) return;
                c.remove('plans', was.id);
                nav.pop();
              }} />
            ) : undefined}
            footer={c.canEdit ? <Button expand disabled={!f.what.trim()} onPress={save}>{t('Save')}</Button> : undefined}>
      <Stack gap={12}>
        <Segmented value={f.kind ?? 'do'} onChange={(kind: string) => set({ kind })}
                   options={KINDS.map(([value, label, icon]) => ({ value, label: t(label), icon }))} />
        <TextField label={t('What')} value={f.what} max={120} autofocus={!was} onChange={(what: string) => set({ what })} />
        <Row gap={8} align="center">
          <Icon name="event" />
          <Stack grow />
          <DatePicker value={f.day} min={c.trip?.start} max={c.trip?.end} placeholder={t('Any day')} onChange={(d: string) => set({ day: d })} />
          <TimePicker value={f.time} placeholder={t('Time')} onChange={(time: string) => set({ time })} />
        </Row>
        <PlacePicker value={f.place} onChange={(place: Place) => set({ place })} />
        <MoneyField label={t('Cost')} value={f.cost} onChange={(cost: number) => set({ cost })} />
        <Checkbox checked={!!f.booked} label={t('Booked')} onChange={(booked: boolean) => set({ booked })} />
        {c.members.length > 1 && (
          <Select label={t('Who')} value={f.who ?? ''} onChange={(who: string) => set({ who: who || undefined })}
                  options={[{ value: '', label: t('Everyone') }, ...c.members.map((m) => ({ value: m.id, label: m.name }))]} />
        )}
        <TextField type="url" label={t('Link')} value={f.link ?? ''} onChange={(link: string) => set({ link })} />
        <Upload accept="pdf,png,jpg,jpeg" label={t('Add a ticket')} value={f.ticket ? [f.ticket] : []}
                onUpload={(ticket: unknown) => set({ ticket })} onRemove={() => set({ ticket: null })} />
      </Stack>
    </Screen>
  );
}

function CostScreen() {
  const nav = useNav();
  const c = useTrips();
  const dialog = useDialog();
  const { id } = nav.params as { id?: string };
  const was = c.costs.find((x) => x.id === id);
  const everyone = c.members.length ? c.members.map((m) => m.id) : [c.me.id];
  const [f, setF] = useLocal<Cost>(was ?? { id: '', what: '', paid: c.me.id, split: everyone, day: c.today });
  const set = (x: Partial<Cost>) => setF({ ...f, ...x });
  const save = () => {
    const what = f.what.trim();
    if (!what || !f.amount) return;
    const fields = { what, amount: Math.round(f.amount * 100) / 100, paid: f.paid ?? c.me.id, split: f.split?.length ? f.split : [f.paid ?? c.me.id], day: f.day ?? c.today };
    if (was) c.edit('costs', was.id, fields);
    else c.add('costs', { ...fields, trip: c.trip?.id ?? null });
    nav.pop();
  };
  return (
    <Screen title={was ? t('Edit') : t('New cost')}
            actions={was ? (
              <IconButton icon="delete" label={t('Delete')} onPress={async () => {
                if (!(await dialog.confirm({ title: t('Delete this cost?'), ok: t('Delete'), danger: true }))) return;
                c.remove('costs', was.id);
                nav.pop();
              }} />
            ) : undefined}
            footer={<Button expand disabled={!f.what.trim() || !f.amount} onPress={save}>{t('Save')}</Button>}>
      <Stack gap={12}>
        <TextField label={t('What')} value={f.what} max={120} autofocus={!was} onChange={(what: string) => set({ what })} />
        <MoneyField label={t('Amount')} value={f.amount} onChange={(amount: number) => set({ amount })} />
        <Row gap={8} align="center">
          <Text grow>{t('Day')}</Text>
          <DatePicker value={f.day} onChange={(day: string) => set({ day })} />
        </Row>
        {c.members.length > 1 && (
          <>
            <Select label={t('Paid by')} value={f.paid ?? c.me.id} onChange={(paid: string) => set({ paid })}
                    options={c.members.map((m) => ({ value: m.id, label: m.name }))} />
            <Box class={s.panel}>
              <Text class={s.h}>{t('Split between')}</Text>
              {c.members.map((m) => (
                <Row key={m.id} gap={8} align="center">
                  <Checkbox checked={(f.split ?? []).includes(m.id)}
                            onChange={(on: boolean) => set({ split: on ? [...(f.split ?? []), m.id] : (f.split ?? []).filter((x) => x !== m.id) })} />
                  <Avatar person={m.id} size={24} />
                  <Text grow>{m.name}</Text>
                  {(f.split ?? []).includes(m.id) && f.amount ? (
                    <Text class={s.sub}>{format.money(f.amount / (f.split ?? []).length, c.trip?.currency ?? 'GBP')}</Text>
                  ) : null}
                </Row>
              ))}
            </Box>
          </>
        )}
      </Stack>
    </Screen>
  );
}

export default defineApp({
  screens: { Home, Trip: TripScreen, Plan: PlanScreen, Cost: CostScreen },
  // What you open from the list sits beside it on a wide window.
  split: ['Home'],
  actions: {
    plan: {
      title: 'Add a plan to the trip',
      params: {
        what: 'string',
        day: { type: 'string', optional: true, title: 'YYYY-MM-DD' },
        time: { type: 'string', optional: true, title: 'HH:MM' },
        kind: { type: 'string', optional: true, options: KINDS.map(([k]) => k) },
      },
      run: (p: { what: string; day?: string; time?: string; kind?: string }, { data }: any) => {
        const trips = (data.query('trips', { limit: 100 }) as Trip[]).sort((a, b) => (a.start ?? '9').localeCompare(b.start ?? '9'));
        const today = iso(new Date());
        const trip = trips.find((x) => (x.end ?? x.start ?? '9') >= today) ?? trips[trips.length - 1];
        const id = data.add('plans', {
          what: String(p.what).slice(0, 120),
          day: /^\d{4}-\d{2}-\d{2}$/.test(String(p.day ?? '')) ? p.day : null,
          time: /^\d{2}:\d{2}$/.test(String(p.time ?? '')) ? p.time : null,
          kind: KINDS.some(([k]) => k === p.kind) ? p.kind : 'do',
          trip: trip?.id ?? null,
        });
        return { id, trip: trip?.name ?? null };
      },
    },
    pack: {
      title: 'Add things to pack',
      params: { items: { type: 'string', title: 'One per line' } },
      run: ({ items }: { items: string }, { data }: any) => {
        const trips = (data.query('trips', { limit: 100 }) as Trip[]).sort((a, b) => (a.start ?? '9').localeCompare(b.start ?? '9'));
        const today = iso(new Date());
        const trip = trips.find((x) => (x.end ?? x.start ?? '9') >= today) ?? trips[trips.length - 1];
        const names = String(items).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 50);
        for (const item of names) data.add('packing', { item: item.slice(0, 80), trip: trip?.id ?? null });
        return { added: names.length };
      },
    },
  },
});
