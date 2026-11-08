import {
  defineApp, Screen, Stack, Row, Box, Pressable, Text, TextField, Select, Button, IconButton, Icon, Fab, Grid,
  ProgressRing, Heatmap, Chart, Segmented, Stat, Confetti, Sheet, Avatar, Checkbox, TimePicker, Stepper,
  useQuery, useData, useLocal, useStore, useMe, useChat, useNav, useNow, useDialog, useShare, t,
} from 'isolink';
import { remind } from 'isolink/system';
import s from './app.css';
import { between, last } from './pos';

type Habit = {
  id: string; name: string; goal?: string; emoji?: string; color?: string; part?: string; target?: number;
  unit?: string; remind?: string; with?: string[]; pos?: string; _by?: string;
};
type Checkin = { id: string; habit: string; day: string; count?: number; note?: string; _by?: string };

const COLORS = ['#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#14b8a6', '#64748b'];
const EMOJIS = ['💧', '🧘', '📖', '🏃', '🥗', '💤', '🎸', '✍️', '🌱', '💊', '🧹', '📵', '🚶', '🦷', '☀️', '🙏', '💪', '🍎'];
const GOALS: [string, string][] = [['daily', /*t*/'Every day'], ['weekdays', /*t*/'Weekdays'], ['weekly', /*t*/'Once a week']];
const PARTS: [string, string][] = [
  ['morning', /*t*/'Morning'], ['afternoon', /*t*/'Afternoon'], ['evening', /*t*/'Evening'], ['any', /*t*/'Any time'],
];
const DAYS = [/*t*/'S', /*t*/'M', /*t*/'T', /*t*/'W', /*t*/'T ', /*t*/'F', /*t*/'S '];
const WEEKDAYS = [/*t*/'Sunday', /*t*/'Monday', /*t*/'Tuesday', /*t*/'Wednesday', /*t*/'Thursday', /*t*/'Friday', /*t*/'Saturday'];
const AWARDS: [string, string, string][] = [
  ['first', '🌱', /*t*/'First tick'], ['week', '🔥', /*t*/'7 days'], ['month', '🏆', /*t*/'30 days'],
  ['hundred', '💯', /*t*/'100 ticks'], ['early', '🌅', /*t*/'Early bird'], ['owl', '🌙', /*t*/'Night owl'],
  ['three', '🎯', /*t*/'3 habits'], ['together', '🤝', /*t*/'Together'],
];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayAt = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** The Monday of [d]'s week. */
const weekOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const colorOf = (h: Habit) => h.color || COLORS[0];
const targetOf = (h: Habit) => Math.max(1, h.target ?? 1);

/** How many [who] ticked [h] on [day]. */
function countOn(cs: Checkin[], h: Habit, day: string, who: string) {
  return cs.filter((c) => c.habit === h.id && c.day === day && (c._by ?? who) === who).reduce((n, c) => n + (c.count ?? 1), 0);
}
/** Whether [h] is asked for on [d]. */
const due = (h: Habit, d: Date) => (h.goal === 'weekdays' ? d.getDay() !== 0 && d.getDay() !== 6 : true);

/** Days (or weeks, for a weekly one) in a row it was done, up to today. */
function streak(cs: Checkin[], h: Habit, who: string, today: Date) {
  const done = new Set(cs.filter((c) => c.habit === h.id && (c._by ?? who) === who).map((c) => c.day));
  const full = (k: string) => countOn(cs, h, k, who) >= targetOf(h);
  if (h.goal === 'weekly') {
    let n = 0;
    let w = weekOf(today);
    const any = (w: Date) => [0, 1, 2, 3, 4, 5, 6].some((i) => done.has(iso(addDays(w, i))));
    if (!any(w)) w = addDays(w, -7);
    while (any(w) && n < 520) { n++; w = addDays(w, -7); }
    return n;
  }
  let n = 0;
  let d = today;
  if (!full(iso(d))) d = addDays(d, -1);
  for (let i = 0; i < 2000; i++) {
    if (!due(h, d)) { d = addDays(d, -1); continue; }
    if (!full(iso(d))) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}
function best(cs: Checkin[], h: Habit, who: string) {
  const days = [...new Set(cs.filter((c) => c.habit === h.id && (c._by ?? who) === who).map((c) => c.day))].sort();
  let top = 0;
  for (const k of days) top = Math.max(top, streak(cs, h, who, dayAt(k)));
  return top;
}

function useHabits() {
  const habits = (useQuery('habits', { limit: 200 }) as Habit[])
    .sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? '') || a.name.localeCompare(b.name));
  const checkins = useQuery('checkins', { sort: ['-day'], limit: 500 }) as Checkin[];
  const data = useData();
  const me = useMe();
  const now = useNow(60000);
  const today = new Date(now);
  const key = iso(today);
  const mine = (h: Habit) => !h.with?.length || h._by === me.id || (h.with ?? []).includes(me.id) || !h._by;
  /** One more toward today's goal; past it, back to none. */
  const tick = (h: Habit, day = key) => {
    const had = countOn(checkins, h, day, me.id);
    if (had >= targetOf(h)) {
      for (const c of checkins.filter((c) => c.habit === h.id && c.day === day && (c._by ?? me.id) === me.id)) data.remove('checkins', c.id);
      return false;
    }
    data.add('checkins', { habit: h.id, day, count: 1 });
    return had + 1 >= targetOf(h);
  };
  return { habits: habits.filter(mine), all: habits, checkins, ...data, me, today, key, tick, canEdit: me.role !== 'view' };
}

function Ring({ h, n, size, onPress }: { h: Habit; n: number; size: number; onPress?: () => void }) {
  const goal = targetOf(h);
  const done = n >= goal;
  return (
    <Pressable onPress={onPress} class={s.ringWrap}>
      <Box class={s.ring} style={{ width: size, height: size, borderRadius: size / 2, background: done ? colorOf(h) : 'transparent' }}>
        <ProgressRing value={Math.min(n, goal) / goal} size={size} stroke={4} label={done ? '✓' : h.emoji || '•'} />
      </Box>
    </Pressable>
  );
}

function TodayTab({ hb, celebrate }: { hb: ReturnType<typeof useHabits>; celebrate: (h: Habit) => void }) {
  const nav = useNav();
  const { habits, checkins, me, today } = hb;
  const [day, setDay] = useLocal<string>(hb.key);
  const week = weekOf(today);
  const shown = dayAt(day);
  const dueOn = habits.filter((h) => due(h, shown));
  const doneOn = (k: string) => {
    const d = dayAt(k);
    const asked = habits.filter((h) => due(h, d));
    return asked.length ? asked.filter((h) => countOn(checkins, h, k, me.id) >= targetOf(h)).length / asked.length : 0;
  };
  const doneCount = dueOn.filter((h) => countOn(checkins, h, day, me.id) >= targetOf(h)).length;
  if (habits.length === 0) {
    return (
      <Stack align="center" gap={10} class={s.empty}>
        <Text class={s.bigEmoji}>🌱</Text>
        <Text tone="muted">{t('No habits yet')}</Text>
        {hb.canEdit && <Button onPress={() => nav.push('Edit', {})}>{t('New habit')}</Button>}
      </Stack>
    );
  }
  return (
    <>
      <Row class={s.week} justify="between">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const d = addDays(week, i);
          const k = iso(d);
          const future = d.getTime() > today.getTime();
          return (
            <Pressable key={k} class={s.day} onPress={future ? undefined : () => setDay(k)}>
              <Text class={k === day ? s.dayOn : s.dayName}>{t(DAYS[d.getDay()]).trim()}</Text>
              <ProgressRing value={future ? 0 : doneOn(k)} size={34} stroke={3} label={String(d.getDate())}
                            tone={k === day ? 'accent' : 'muted'} />
            </Pressable>
          );
        })}
      </Row>
      <Row align="center" class={s.head}>
        <Stack grow>
          <Text class={s.big}>{t('{p0} of {p1}', { p0: doneCount, p1: dueOn.length })}</Text>
          <Text tone="muted">{day === hb.key ? t(WEEKDAYS[shown.getDay()]) : `${t(WEEKDAYS[shown.getDay()])} ${shown.getDate()}`}</Text>
        </Stack>
      </Row>
      {PARTS.map(([part, label]) => {
        const rows = dueOn.filter((h) => (h.part ?? 'any') === part);
        if (!rows.length) return null;
        return (
          <Box key={part}>
            {PARTS.some(([p]) => p !== part && dueOn.some((h) => (h.part ?? 'any') === p)) && <Text class={s.h}>{t(label)}</Text>}
            <Stack gap={8}>
              {rows.map((h) => {
                const n = countOn(checkins, h, day, me.id);
                const goal = targetOf(h);
                return (
                  <Pressable key={h.id} class={s.habit} onPress={() => nav.push('Habit', { id: h.id })}>
                    <Ring h={h} n={n} size={46} onPress={hb.canEdit ? () => { if (hb.tick(h, day)) celebrate(h); } : undefined} />
                    <Stack grow>
                      <Text bold>{h.name}</Text>
                      <Text class={s.sub}>
                        {goal > 1 ? `${n} / ${goal}${h.unit ? ` ${h.unit}` : ''}` : t(GOALS.find(([g]) => g === (h.goal ?? 'daily'))?.[1] ?? 'Every day')}
                      </Text>
                    </Stack>
                    {(h.with ?? []).length > 0 && <Icon name="group" size={18} />}
                    <Text class={s.flame}>{`🔥 ${streak(checkins, h, me.id, today)}`}</Text>
                  </Pressable>
                );
              })}
            </Stack>
          </Box>
        );
      })}
    </>
  );
}

function ProgressTab({ hb }: { hb: ReturnType<typeof useHabits> }) {
  const nav = useNav();
  const { habits, checkins, me, today } = hb;
  const [span, setSpan] = useStore<string>('span', 'month');
  const rate = (from: Date, days: number) => {
    let asked = 0, done = 0;
    for (let i = 0; i < days; i++) {
      const d = addDays(from, i);
      if (d.getTime() > today.getTime()) break;
      for (const h of habits) {
        if (h.goal === 'weekly' || !due(h, d)) continue;
        asked++;
        if (countOn(checkins, h, iso(d), me.id) >= targetOf(h)) done++;
      }
    }
    return asked ? Math.round((done / asked) * 100) : 0;
  };
  const bars =
    span === 'week'
      ? [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const d = addDays(weekOf(today), i);
          return { label: t(DAYS[d.getDay()]).trim(), value: rate(d, 1) };
        })
      : span === 'month'
      ? [3, 2, 1, 0].map((i) => {
          const w = addDays(weekOf(today), -7 * i);
          return { label: `${w.getDate()}/${w.getMonth() + 1}`, value: rate(w, 7) };
        })
      : [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((i) => {
          const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const len = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
          return { label: String(m.getMonth() + 1), value: rate(m, len) };
        });
  const mineAll = checkins.filter((c) => (c._by ?? me.id) === me.id);
  const longest = Math.max(0, ...habits.map((h) => streak(checkins, h, me.id, today)));
  return (
    <>
      <Segmented value={span} onChange={setSpan}
                 options={[{ value: 'week', label: t('Week') }, { value: 'month', label: t('Month') }, { value: 'year', label: t('Year') }]} />
      <Box class={s.card}><Chart kind="bar" data={bars} height={130} /></Box>
      <Row gap={8}>
        <Stack grow class={s.stat}><Stat label={t('Done')} value={`${rate(addDays(today, -29), 30)}%`} /></Stack>
        <Stack grow class={s.stat}><Stat label={t('Ticks')} value={String(mineAll.length)} /></Stack>
        <Stack grow class={s.stat}><Stat label={t('Streak')} value={String(longest)} /></Stack>
      </Row>
      {habits.map((h) => (
        <Pressable key={h.id} class={s.card} onPress={() => nav.push('Habit', { id: h.id })}>
          <Row align="center" class={s.cardHead}>
            <Text bold grow>{`${h.emoji ?? ''} ${h.name}`.trim()}</Text>
            <Text class={s.sub}>{t('Best {p0}', { p0: best(checkins, h, me.id) })}</Text>
          </Row>
          <Heatmap weeks={16} days={Object.fromEntries(
            [...new Set(mineAll.filter((c) => c.habit === h.id).map((c) => c.day))].map((k) => [k, Math.min(1, countOn(checkins, h, k, me.id) / targetOf(h))]),
          )} />
        </Pressable>
      ))}
    </>
  );
}

/** Which awards [who] has. */
function awardsOf(hb: ReturnType<typeof useHabits>) {
  const { habits, checkins, me, today } = hb;
  const mine = checkins.filter((c) => (c._by ?? me.id) === me.id);
  const top = Math.max(0, ...habits.map((h) => best(checkins, h, me.id)), ...habits.map((h) => streak(checkins, h, me.id, today)));
  const inPart = (p: string) => mine.filter((c) => habits.find((h) => h.id === c.habit)?.part === p).length;
  return new Set([
    ...(mine.length ? ['first'] : []),
    ...(top >= 7 ? ['week'] : []),
    ...(top >= 30 ? ['month'] : []),
    ...(mine.length >= 100 ? ['hundred'] : []),
    ...(inPart('morning') >= 7 ? ['early'] : []),
    ...(inPart('evening') >= 7 ? ['owl'] : []),
    ...(habits.length >= 3 ? ['three'] : []),
    ...(habits.some((h) => (h.with ?? []).length > 0) ? ['together'] : []),
  ]);
}

function AwardsTab({ hb }: { hb: ReturnType<typeof useHabits> }) {
  const members = useChat() as { id: string; name: string }[];
  const got = awardsOf(hb);
  const shared = hb.habits.filter((h) => (h.with ?? []).length > 0);
  return (
    <>
      <Grid columns={4} gap={10} class={s.badges}>
        {AWARDS.map(([id, emoji, label]) => (
          <Stack key={id} align="center" gap={4}>
            <Box class={got.has(id) ? s.badge : [s.badge, s.locked]}><Text class={s.badgeEmoji}>{emoji}</Text></Box>
            <Text class={s.badgeName} align="center">{t(label)}</Text>
          </Stack>
        ))}
      </Grid>
      {shared.length > 0 && <Text class={s.h}>{t('Together')}</Text>}
      {shared.map((h) => {
        const people = [...new Set([h._by ?? hb.me.id, ...(h.with ?? [])])];
        return (
          <Box key={h.id} class={s.card}>
            <Text bold class={s.cardHead}>{`${h.emoji ?? ''} ${h.name}`.trim()}</Text>
            {people
              .map((p) => [p, streak(hb.checkins, h, p, hb.today)] as const)
              .sort((a, b) => b[1] - a[1])
              .map(([p, n]) => (
                <Row key={p} gap={10} align="center" class={s.person}>
                  <Avatar person={p} size={28} />
                  <Text grow>{p === hb.me.id ? t('You') : members.find((m) => m.id === p)?.name ?? ''}</Text>
                  <Text class={s.flame}>{`🔥 ${n}`}</Text>
                </Row>
              ))}
          </Box>
        );
      })}
    </>
  );
}

function Home() {
  const hb = useHabits();
  const nav = useNav();
  const share = useShare();
  const [tab, setTab] = useStore<string>('tab', 'today');
  const [party, setParty] = useLocal<{ title: string; text: string } | null>(null);
  /** A goal met: confetti for a streak worth it, or a new award. */
  const celebrate = (h: Habit) => {
    const n = streak(hb.checkins, h, hb.me.id, hb.today) + 1;
    if ([3, 7, 14, 30, 50, 100, 365].includes(n)) {
      setParty({ title: t('{p0} in a row of {p1}!', { p0: n, p1: h.name }), text: `🔥 ${n} × ${h.emoji ?? ''} ${h.name}` });
    }
  };
  return (
    <Screen
      title={t('Habits')}
      tabs={[
        { value: 'today', label: t('Today'), icon: 'check_circle' },
        { value: 'progress', label: t('Progress'), icon: 'insights' },
        { value: 'awards', label: t('Awards'), icon: 'emoji_events' },
      ]}
      tab={tab}
      onTab={setTab}
      fab={hb.canEdit && tab === 'today' && hb.habits.length > 0 ? <Fab icon="add" onPress={() => nav.push('Edit', {})} /> : undefined}
    >
      {tab === 'today' && <TodayTab hb={hb} celebrate={celebrate} />}
      {tab === 'progress' && <ProgressTab hb={hb} />}
      {tab === 'awards' && <AwardsTab hb={hb} />}
      {party && <Confetti />}
      <Sheet open={!!party} onClose={() => setParty(null)}>
        {party && (
          <Row gap={12} align="center">
            <Text class={s.bigEmoji}>🔥</Text>
            <Text bold grow>{party.title}</Text>
            <Button onPress={() => { share.share(party.text); setParty(null); }}>{t('Share')}</Button>
          </Row>
        )}
      </Sheet>
    </Screen>
  );
}

/** One habit: its numbers and every day it was done. Tap a day to tick it late. */
function HabitScreen() {
  const nav = useNav();
  const hb = useHabits();
  const { id } = nav.params as { id: string };
  const h = hb.all.find((x) => x.id === id);
  if (!h) return <Screen title={t('Habits')} />;
  const mine = hb.checkins.filter((c) => c.habit === id && (c._by ?? hb.me.id) === hb.me.id);
  const days = [...new Set(mine.map((c) => c.day))];
  const last30 = [...Array(30).keys()].map((i) => addDays(hb.today, -i)).filter((d) => due(h, d));
  const rate = last30.length ? Math.round((last30.filter((d) => countOn(hb.checkins, h, iso(d), hb.me.id) >= targetOf(h)).length / last30.length) * 100) : 0;
  return (
    <Screen title={h.name}
            actions={hb.canEdit ? <IconButton icon="edit" label={t('Edit')} onPress={() => nav.push('Edit', { id })} /> : undefined}>
      <Box class={s.hero} style={{ background: colorOf(h) + '26' }}><Text class={s.heroEmoji}>{h.emoji || '✅'}</Text></Box>
      <Row gap={8}>
        <Stack grow class={s.stat}><Stat label={t('Streak')} value={String(streak(hb.checkins, h, hb.me.id, hb.today))} /></Stack>
        <Stack grow class={s.stat}><Stat label={t('Best')} value={String(best(hb.checkins, h, hb.me.id))} /></Stack>
        <Stack grow class={s.stat}><Stat label={t('30 days')} value={`${rate}%`} /></Stack>
      </Row>
      <Box class={s.card}>
        <Heatmap weeks={20} days={Object.fromEntries(days.map((k) => [k, Math.min(1, countOn(hb.checkins, h, k, hb.me.id) / targetOf(h))]))} />
      </Box>
      <Text class={s.h}>{t('This week')}</Text>
      <Row justify="between" class={s.week}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const d = addDays(weekOf(hb.today), i);
          const k = iso(d);
          const future = d.getTime() > hb.today.getTime();
          return (
            <Stack key={k} align="center" gap={4}>
              <Text class={s.dayName}>{t(DAYS[d.getDay()]).trim()}</Text>
              <Ring h={h} n={countOn(hb.checkins, h, k, hb.me.id)} size={34}
                    onPress={hb.canEdit && !future ? () => hb.tick(h, k) : undefined} />
            </Stack>
          );
        })}
      </Row>
    </Screen>
  );
}

/** A new habit, or one being changed. */
function EditScreen() {
  const nav = useNav();
  const hb = useHabits();
  const dialog = useDialog();
  const members = (useChat() as { id: string; name: string }[]).filter((m) => m.id !== hb.me.id);
  const { id } = nav.params as { id?: string };
  const was = hb.all.find((x) => x.id === id);
  const [f, setF] = useLocal<Habit>(
    was ?? { id: '', name: '', emoji: EMOJIS[hb.all.length % EMOJIS.length], color: COLORS[hb.all.length % COLORS.length], goal: 'daily', part: 'any', target: 1, with: [] },
  );
  const set = (x: Partial<Habit>) => setF({ ...f, ...x });
  const save = async () => {
    const name = f.name.trim();
    if (!name) return;
    const fields = {
      name, emoji: f.emoji, color: f.color, goal: f.goal, part: f.part, target: Math.max(1, f.target ?? 1),
      unit: f.unit?.trim() || null, remind: f.remind || null, with: f.with ?? [],
    };
    const key = was ? was.id : hb.add('habits', { ...fields, pos: between(last(hb.all), '') });
    if (was) hb.edit('habits', was.id, fields);
    // Its reminder, every day (or weekday, or week) it's asked for.
    if (f.remind) {
      const [hh, mm] = f.remind.split(':').map(Number);
      let at = new Date(hb.today.getFullYear(), hb.today.getMonth(), hb.today.getDate(), hh, mm);
      if (at.getTime() < Date.now()) at = addDays(at, 1);
      try {
        await remind.set({ key, text: `${f.emoji ?? ''} ${name}`.trim(), at, repeat: f.goal === 'weekdays' ? 'weekdays' : f.goal === 'weekly' ? 'weekly' : 'daily' });
      } catch {
        // Not allowed: the habit is kept without it.
      }
    } else if (was?.remind) {
      remind.cancel(key);
    }
    nav.pop();
  };
  return (
    <Screen title={was ? t('Edit') : t('New habit')}
            actions={was && hb.canEdit ? (
              <IconButton icon="delete" label={t('Delete')} onPress={async () => {
                const ok = await dialog.confirm({ title: t('Delete this habit?'), ok: t('Delete'), danger: true });
                if (!ok) return;
                for (const c of hb.checkins.filter((c) => c.habit === was.id)) hb.remove('checkins', c.id);
                hb.remove('habits', was.id);
                if (was.remind) remind.cancel(was.id);
                nav.pop();
                nav.pop();
              }} />
            ) : undefined}>
      <Stack gap={12}>
        <TextField label={t('Name')} value={f.name} max={60} autofocus={!was} onChange={(name: string) => set({ name })} />
        <Grid columns={6} gap={6}>
          {EMOJIS.map((e) => (
            <Pressable key={e} class={f.emoji === e ? [s.pick, s.picked] : s.pick} onPress={() => set({ emoji: e })}>
              <Text class={s.pickEmoji}>{e}</Text>
            </Pressable>
          ))}
        </Grid>
        <Row gap={10} justify="center">
          {COLORS.map((c) => (
            <Pressable key={c} class={f.color === c ? [s.swatch, s.swatchOn] : s.swatch} style={{ background: c }} onPress={() => set({ color: c })} />
          ))}
        </Row>
        <Select label={t('How often')} value={f.goal ?? 'daily'} options={GOALS.map(([value, label]) => ({ value, label: t(label) }))}
                onChange={(goal: string) => set({ goal })} />
        <Row gap={8} align="end">
          <Stack grow>
            <Text class={s.label}>{t('Goal')}</Text>
            <Stepper value={f.target ?? 1} min={1} max={100} onChange={(target: number) => set({ target })} />
          </Stack>
          <Stack grow>
            <TextField label={t('Unit')} value={f.unit ?? ''} max={20} placeholder={t('glasses')} onChange={(unit: string) => set({ unit })} />
          </Stack>
        </Row>
        <Select label={t('When')} value={f.part ?? 'any'} options={PARTS.map(([value, label]) => ({ value, label: t(label) }))}
                onChange={(part: string) => set({ part })} />
        <Row gap={8} align="center">
          <Icon name="alarm" />
          <Text grow>{t('Remind')}</Text>
          <TimePicker value={f.remind} placeholder={t('Off')} onChange={(remind: string) => set({ remind })} />
          {f.remind && <IconButton icon="close" label={t('Off')} onPress={() => set({ remind: undefined })} />}
        </Row>
        {members.length > 0 && (
          <Box class={s.card}>
            <Text class={s.label}>{t('With')}</Text>
            {members.map((m) => (
              <Row key={m.id} gap={8} align="center">
                <Checkbox checked={(f.with ?? []).includes(m.id)}
                          onChange={(on: boolean) => set({ with: on ? [...(f.with ?? []), m.id] : (f.with ?? []).filter((x) => x !== m.id) })} />
                <Avatar person={m.id} size={26} />
                <Text>{m.name}</Text>
              </Row>
            ))}
          </Box>
        )}
        <Button expand disabled={!f.name.trim()} onPress={save}>{t('Save')}</Button>
      </Stack>
    </Screen>
  );
}

const habitNamed = (rows: Habit[], name: string) => {
  const want = String(name).toLowerCase();
  return rows.find((h) => h.name.toLowerCase() === want) ?? rows.find((h) => h.name.toLowerCase().includes(want));
};

export default defineApp({
  screens: { Home, Habit: HabitScreen, Edit: EditScreen },
  actions: {
    tick: {
      title: "Tick a habit for today",
      params: { habit: { type: 'string', title: "The habit's name" } },
      run: ({ habit }: { habit: string }, { data }: any) => {
        const h = habitNamed(data.query('habits', { limit: 200 }) as Habit[], habit);
        if (!h) throw new Error(`No habit called ${habit}`);
        data.add('checkins', { habit: h.id, day: iso(new Date()), count: 1 });
        return { ticked: h.name };
      },
    },
    add: {
      title: 'Start a new habit',
      params: {
        name: 'string',
        often: { type: 'string', optional: true, options: GOALS.map(([g]) => g) },
        emoji: { type: 'string', optional: true },
      },
      run: ({ name, often, emoji }: { name: string; often?: string; emoji?: string }, { data }: any) => {
        const rows = data.query('habits', { limit: 200 }) as Habit[];
        const id = data.add('habits', {
          name: String(name).slice(0, 60),
          goal: often && GOALS.some(([g]) => g === often) ? often : 'daily',
          emoji: emoji ? String(emoji).slice(0, 8) : EMOJIS[rows.length % EMOJIS.length],
          color: COLORS[rows.length % COLORS.length],
          part: 'any',
          target: 1,
          pos: between(last(rows), ''),
        });
        return { id };
      },
    },
  },
});
