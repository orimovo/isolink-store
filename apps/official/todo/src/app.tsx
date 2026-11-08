import {
  defineApp, Screen, Stack, Row, Box, Pressable, Checkbox, Text, TextField, Editor, Select, Button, Card, Grid,
  Icon, IconButton, Avatar, AvatarStack, Toggle, DatePicker, TimePicker, PersonPicker, ProgressRing, Board,
  Upload, Timer, Section, Progress, useQuery, useData, useLocal, useStore, useMe, useChat, useDialog, useNow, useNav,
  useRef, useEffect, format, t,
} from 'isolink';
import { between, last } from './pos';
import s from './app.css';
import { useAddBar } from './addbar';
import { siteOf } from './smart';

type Task = {
  id: string; title: string; done?: boolean; due?: number; list?: string; who?: string; flag?: boolean;
  notes?: string; pos?: string; doneAt?: number; status?: string; repeat?: string; link?: string; _at?: number;
};
type List_ = { id: string; name: string; pos?: string };
type Step = { id: string; task: string; title: string; done?: boolean; pos?: string };
type Comment = { id: string; task: string; text: string; _by?: string; _at?: number };
type Attachment = { id: string; task: string; file: unknown };

const DAY = 86400000;
const endOfToday = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};
const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const timeOf = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const at = (day: string, time: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = (time || '09:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
};
const MONTHS = [/*t*/'Jan', /*t*/'Feb', /*t*/'Mar', /*t*/'Apr', /*t*/'May', /*t*/'Jun', /*t*/'Jul', /*t*/'Aug',
  /*t*/'Sep', /*t*/'Oct', /*t*/'Nov', /*t*/'Dec'];
const DAYS = [/*t*/'Sunday', /*t*/'Monday', /*t*/'Tuesday', /*t*/'Wednesday', /*t*/'Thursday', /*t*/'Friday', /*t*/'Saturday'];
const SHORT_DAYS = [/*t*/'Sun', /*t*/'Mon', /*t*/'Tue', /*t*/'Wed', /*t*/'Thu', /*t*/'Fri', /*t*/'Sat'];
const REPEATS: [string, string][] = [
  ['never', /*t*/'Never'], ['daily', /*t*/'Every day'], ['weekdays', /*t*/'Weekdays'], ['weekly', /*t*/'Every week'],
  ['monthly', /*t*/'Every month'],
];
const STATUSES: [string, string][] = [['todo', /*t*/'To do'], ['doing', /*t*/'Doing'], ['done', /*t*/'Done']];
/** A list's colour, the same on every device. */
const HUES = ['#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#ec4899'];
const hueOf = (id?: string) => {
  let h = 0;
  for (const c of id ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
};

/** When it's due, in a few words: the time today, else the day. */
function when(ms: number, now: number) {
  const end = endOfToday(now);
  if (ms < end && ms >= end - DAY) return timeOf(ms);
  if (ms >= end && ms < end + DAY) return t('Tomorrow');
  if (ms < end - DAY && ms >= end - 2 * DAY) return t('Yesterday');
  const d = new Date(ms);
  return `${d.getDate()} ${t(MONTHS[d.getMonth()])}`;
}

/** The next time a repeating task is due after [ms]. */
function next(ms: number, repeat: string) {
  const d = new Date(ms);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (repeat === 'weekdays') {
    do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
  }
  return d.getTime();
}

function useTodo() {
  const lists = (useQuery('lists', { limit: 500 }) as List_[]).sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? ''));
  const all = useQuery('tasks', { limit: 500 }) as Task[];
  const steps = useQuery('steps', { limit: 500 }) as Step[];
  const data = useData();
  const me = useMe();
  const members = useChat() as { id: string; name: string }[];
  /** Ticked, or unticked. A repeating one comes back for next time. */
  const toggle = (r: Task) => {
    const done = !r.done;
    data.edit('tasks', r.id, { done, doneAt: done ? Date.now() : null, status: done ? 'done' : r.status === 'done' ? 'todo' : r.status });
    if (done && r.repeat && r.repeat !== 'never' && typeof r.due === 'number') {
      data.add('tasks', { title: r.title, due: next(r.due, r.repeat), repeat: r.repeat, list: r.list, who: r.who, flag: r.flag, notes: r.notes });
    }
  };
  return { lists, all, steps, ...data, me, members, canAdd: me.role !== 'view', toggle };
}

function TaskRow({ r, todo, now, showList }: { r: Task; todo: ReturnType<typeof useTodo>; now: number; showList: boolean }) {
  const nav = useNav();
  const list = showList ? todo.lists.find((l) => l.id === r.list) : undefined;
  const late = r.due !== undefined && !r.done && r.due < now;
  const mine = todo.steps.filter((x) => x.task === r.id);
  const stepsDone = mine.filter((x) => x.done).length;
  const extra = !r.done && (r.due !== undefined || list || mine.length > 0 || (r.repeat && r.repeat !== 'never') || r.link);
  return (
    <Pressable class={s.task} onPress={() => nav.push('Task', { id: r.id })}>
      <Checkbox round checked={!!r.done} onChange={() => todo.toggle(r)} />
      <Stack grow gap={3}>
        <Text class={r.done ? s.done : s.title}>{r.title}</Text>
        {extra ? (
          <Row gap={10} align="center" wrap>
            {r.due !== undefined && (
              <Row gap={4} align="center">
                <Icon name={late ? 'alarm' : 'schedule'} size={14} tone={late ? 'danger' : 'muted'} />
                <Text class={late ? s.late : s.meta}>{when(r.due, now)}</Text>
              </Row>
            )}
            {list && (
              <Row gap={6} align="center">
                <Box class={s.dot} style={{ background: hueOf(list.id) }} />
                <Text class={s.tag} style={{ color: hueOf(list.id) }}>{list.name}</Text>
              </Row>
            )}
            {mine.length > 0 && <Text class={s.meta}>{`☑ ${stepsDone}/${mine.length}`}</Text>}
            {r.repeat && r.repeat !== 'never' && <Icon name="autorenew" size={14} />}
            {r.link && (
              <Row gap={4} align="center"><Icon name="link" size={14} /><Text class={s.meta} lines={1}>{siteOf(r.link)}</Text></Row>
            )}
          </Row>
        ) : null}
      </Stack>
      {r.flag && !r.done && <Icon name="flag" tone="warning" size={18} />}
      {r.who && todo.members.length > 1 && <Avatar person={r.who} size={24} />}
    </Pressable>
  );
}

function Rows({ title, rows, todo, now }: { title: string; rows: Task[]; todo: ReturnType<typeof useTodo>; now: number }) {
  if (rows.length === 0) return null;
  return (
    <Box class={s.group}>
      <Text class={s.h}>{title}</Text>
      <Box class={s.card}>
        <Box class={s.rows}>{rows.map((r) => <TaskRow key={r.id} r={r} todo={todo} now={now} showList />)}</Box>
      </Box>
    </Box>
  );
}

function Empty({ emoji, words }: { emoji: string; words: string }) {
  return (
    <Stack align="center" gap={12} class={s.empty}>
      <Box class={s.emptyArt}><Text class={s.emptyEmoji}>{emoji}</Text></Box>
      <Text class={s.emptyText}>{words}</Text>
    </Stack>
  );
}

function Hero({ big, line, children }: { big: string; line?: string; children?: unknown }) {
  return (
    <Row gap={16} align="center" class={s.hero}>
      <Stack grow gap={4}>
        <Text class={s.big}>{big}</Text>
        {line ? <Text class={s.line}>{line}</Text> : null}
      </Stack>
      {children}
    </Row>
  );
}

function TodayTab({ todo }: { todo: ReturnType<typeof useTodo> }) {
  const now = useNow(60000);
  const end = endOfToday(now);
  const start = end - DAY;
  const open = todo.all.filter((r) => !r.done && typeof r.due === 'number' && r.due < end).sort((a, b) => a.due! - b.due!);
  const doneToday = todo.all.filter((r) => r.done && (r.doneAt ?? 0) >= start).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const late = open.filter((r) => r.due! < start).length;
  const total = open.length + doneToday.length;
  const hour = (r: Task) => new Date(r.due!).getHours();
  const d = new Date(now);
  return (
    <>
      <Hero big={`${t(DAYS[d.getDay()])} ${d.getDate()} ${t(MONTHS[d.getMonth()])}`}
            line={open.length === 0 ? t('All clear') : late ? t('{p0} to go · {p1} late', { p0: open.length, p1: late }) : t('{p0} to go', { p0: open.length })}>
        {total > 0 ? <ProgressRing value={doneToday.length / total} size={60} stroke={6} label={`${doneToday.length}/${total}`} /> : null}
      </Hero>
      {total === 0 && <Empty emoji="☀️" words={t('All clear')} />}
      <Rows title={t('Late')} rows={open.filter((r) => r.due! < start)} todo={todo} now={now} />
      <Rows title={t('Morning')} rows={open.filter((r) => r.due! >= start && hour(r) < 12)} todo={todo} now={now} />
      <Rows title={t('Afternoon')} rows={open.filter((r) => r.due! >= start && hour(r) >= 12 && hour(r) < 17)} todo={todo} now={now} />
      <Rows title={t('Evening')} rows={open.filter((r) => r.due! >= start && hour(r) >= 17)} todo={todo} now={now} />
      <Rows title={t('Done today')} rows={doneToday} todo={todo} now={now} />
    </>
  );
}

function ProjectsTab({ todo, project, setProject, newList }: {
  todo: ReturnType<typeof useTodo>; project: string | null; setProject: (id: string) => void; newList: () => Promise<string | null>;
}) {
  const nav = useNav();
  const shown = todo.lists.find((l) => l.id === project) ?? todo.lists[0];
  const items = shown
    ? todo.all
        .filter((r) => r.list === shown.id)
        .map((r) => ({ ...r, status: r.done ? 'done' : r.status || 'todo' }))
        .sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? '') || (a._at ?? 0) - (b._at ?? 0))
    : [];
  const openCount = todo.all.filter((r) => !r.done && r.list).length;
  return (
    <>
      <Hero big={t('Projects')}
            line={todo.lists.length ? `${todo.lists.length === 1 ? t('1 project') : t('{p0} projects', { p0: todo.lists.length })} · ${t('{p0} open', { p0: openCount })}` : undefined}>
        {todo.canAdd ? <Button variant="tonal" icon="add" onPress={newList}>{t('New')}</Button> : null}
      </Hero>
      {!shown ? (
        <Empty emoji="🗂️" words={t('No projects yet')} />
      ) : (
        <>
          <Grid min={200} gap={16}>
            {todo.lists.map((l) => {
              const rows = todo.all.filter((r) => r.list === l.id);
              const done = rows.filter((r) => r.done).length;
              const people = [...new Set(rows.map((r) => r.who).filter(Boolean))] as string[];
              return (
                <Pressable key={l.id} class={l.id === shown.id ? [s.project, s.projectOn] : s.project} onPress={() => setProject(l.id)}>
                  <Row align="start" justify="between">
                    <Box class={s.projectArt} style={{ background: `${hueOf(l.id)}2e` }}>
                      <Text class={s.projectLetter} style={{ color: hueOf(l.id) }}>{(l.name.trim()[0] ?? '·').toUpperCase()}</Text>
                    </Box>
                    {people.length > 0 && todo.members.length > 1 ? <AvatarStack people={people} max={3} size={24} /> : null}
                  </Row>
                  <Text class={s.projectName} lines={1}>{l.name}</Text>
                  <Text class={s.meta}>{rows.length === 0 ? t('Empty') : done === rows.length ? t('All done') : t('{p0} open', { p0: rows.length - done })}</Text>
                  <Progress value={rows.length ? done / rows.length : 0} />
                </Pressable>
              );
            })}
          </Grid>
          <Box class={s.boardGap} />
          <Board
            items={items}
            by="status"
            columns={STATUSES.map(([value, label]) => ({ value, label: t(label) }))}
            height={460}
            onMove={todo.canAdd ? (id: string, status: string) => {
              const r = todo.all.find((x) => x.id === id);
              if (!r) return;
              if (status === 'done' && !r.done) todo.toggle({ ...r, status });
              else todo.edit('tasks', id, { status, ...(status !== 'done' && r.done ? { done: false, doneAt: null } : {}) });
            } : undefined}
          >
            {items.map((r) => {
              const mine = todo.steps.filter((x) => x.task === r.id);
              return (
                <Card key={r.id} pad={12} onPress={() => nav.push('Task', { id: r.id })}>
                  <Stack gap={8}>
                    <Text bold strike={r.status === 'done'}>{r.title}</Text>
                    <Row gap={8} align="center">
                      {r.who && <Avatar person={r.who} size={20} />}
                      {r.due !== undefined && <Text class={s.meta}>{when(r.due, Date.now())}</Text>}
                      {mine.length > 0 && <Text class={s.meta}>{`☑ ${mine.filter((x) => x.done).length}/${mine.length}`}</Text>}
                      {r.link && <Icon name="link" size={14} />}
                      {r.flag && <Icon name="flag" tone="warning" size={14} />}
                    </Row>
                  </Stack>
                </Card>
              );
            })}
          </Board>
        </>
      )}
    </>
  );
}

function UpcomingTab({ todo }: { todo: ReturnType<typeof useTodo> }) {
  const now = useNow(60000);
  const end = endOfToday(now);
  const [picked, setPicked] = useLocal<string | null>(null);
  const later = todo.all.filter((r) => !r.done && typeof r.due === 'number' && r.due >= end).sort((a, b) => a.due! - b.due!);
  const someday = todo.all.filter((r) => !r.done && r.due === undefined && !r.list);
  const done = todo.all.filter((r) => r.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 30);
  const days = new Map<string, Task[]>();
  for (const r of later) {
    const k = dayOf(r.due!);
    days.set(k, [...(days.get(k) ?? []), r]);
  }
  const week = Array.from({ length: 7 }, (_, i) => dayOf(end + i * DAY + DAY / 2));
  const title = (k: string) => {
    const ms = at(k, '12:00');
    if (ms < end + DAY) return t('Tomorrow');
    const d = new Date(ms);
    return ms < end + 6 * DAY ? t(DAYS[d.getDay()]) : `${t(DAYS[d.getDay()])} ${d.getDate()} ${t(MONTHS[d.getMonth()])}`;
  };
  const first = new Date(at(week[0], '12:00'));
  const lastDay = new Date(at(week[6], '12:00'));
  const range = first.getMonth() === lastDay.getMonth()
    ? `${first.getDate()} – ${lastDay.getDate()} ${t(MONTHS[first.getMonth()])}`
    : `${first.getDate()} ${t(MONTHS[first.getMonth()])} – ${lastDay.getDate()} ${t(MONTHS[lastDay.getMonth()])}`;
  const shown = [...days.entries()].filter(([k]) => !picked || k === picked);
  return (
    <>
      <Hero big={t('Next 7 days')} line={range} />
      <Grid columns={7} gap={8}>
        {week.map((k) => {
          const d = new Date(at(k, '12:00'));
          const rows = days.get(k) ?? [];
          const hues = [...new Set(rows.map((r) => (r.list ? hueOf(r.list) : '#9ca3af')))].slice(0, 3);
          return (
            <Pressable key={k} class={picked === k ? [s.day, s.dayOn] : s.day} onPress={() => setPicked(picked === k ? null : k)}>
              <Text class={s.dayName}>{t(SHORT_DAYS[d.getDay()])}</Text>
              <Text class={s.dayNumber}>{String(d.getDate())}</Text>
              <Row gap={3} justify="center" class={s.dots}>
                {hues.map((h) => <Box key={h} class={s.dot} style={{ background: h }} />)}
              </Row>
            </Pressable>
          );
        })}
      </Grid>
      <Box class={s.boardGap} />
      {later.length === 0 && someday.length === 0 && <Empty emoji="📅" words={t('Nothing coming up')} />}
      {picked && shown.length === 0 && <Empty emoji="🌤️" words={t('Nothing that day')} />}
      {shown.map(([k, rows]) => <Rows key={k} title={title(k)} rows={rows} todo={todo} now={now} />)}
      {!picked && <Rows title={t('Someday')} rows={someday} todo={todo} now={now} />}
      {!picked && done.length > 0 && (
        <Section title={t('Done · {p0}', { p0: done.length })} folded>
          <Box class={s.card}>
            <Box class={s.rows}>{done.map((r) => <TaskRow key={r.id} r={r} todo={todo} now={now} showList />)}</Box>
          </Box>
        </Section>
      )}
    </>
  );
}

function Home() {
  const todo = useTodo();
  const dialog = useDialog();
  const [tab, setTab] = useStore<string>('tab', 'today');
  const [project, setProject] = useStore<string | null>('project', null);
  const now = useNow(60000);
  const newList = async () => {
    const name = ((await dialog.prompt({ title: t('New project'), placeholder: t('Name') })) ?? '').trim();
    if (!name) return null;
    const id = todo.add('lists', { name, pos: between(last(todo.lists), '') });
    setProject(id);
    return id;
  };
  const shownProject = tab === 'projects' ? (todo.lists.find((l) => l.id === project) ?? todo.lists[0])?.id : undefined;
  const adder = useAddBar({
    placeholder: t('New task'),
    time: true,
    pick: {
      icon: 'view_kanban',
      label: t('Project'),
      options: todo.lists.map((l) => ({ id: l.id, label: l.name, icon: 'circle' })),
      onNew: newList,
    },
    sources: ['link', 'file'],
    onAdd: (said) => {
      const end = endOfToday(now);
      const today = dayOf(now);
      let due: number | undefined;
      if (said.day && (said.time || said.day !== today)) due = at(said.day, said.time ?? '09:00');
      // Added to Today, or for today without a time: due today.
      else if (said.day || tab === 'today') due = end - 60000;
      const list = said.pick ?? shownProject;
      const id = todo.add('tasks', {
        // A #tag that isn't a project stays in the words.
        title: (said.tag ? `${said.text} #${said.tag}` : said.text).slice(0, 200),
        list,
        status: list ? 'todo' : undefined,
        due,
        link: said.link,
      });
      if (said.file && id) todo.add('attachments', { task: id, file: said.file });
    },
  });
  return (
    <Screen
      title={t('Todo')}
      tabs={[
        { value: 'today', label: t('Today'), icon: 'wb_sunny' },
        { value: 'projects', label: t('Projects'), icon: 'view_kanban' },
        { value: 'upcoming', label: t('Upcoming'), icon: 'calendar_month' },
      ]}
      tab={tab}
      onTab={setTab}
      footer={todo.canAdd ? adder.bar : undefined}
    >
      <Box class={s.center}>
        <Box class={tab === 'projects' ? [s.column, s.wide] : s.column}>
          {tab === 'today' && <TodayTab todo={todo} />}
          {tab === 'projects' && <ProjectsTab todo={todo} project={project} setProject={setProject} newList={newList} />}
          {tab === 'upcoming' && <UpcomingTab todo={todo} />}
        </Box>
      </Box>
      {adder.sheet}
    </Screen>
  );
}

/** One task: its steps, when, who, files, what people said, and a focus timer. */
function TaskScreen() {
  const nav = useNav();
  const { id } = nav.params as { id: string };
  const todo = useTodo();
  const task = todo.all.find((r) => r.id === id);
  const comments = (useQuery('comments', { limit: 500 }) as Comment[]).filter((c) => c.task === id).sort((a, b) => (a._at ?? 0) - (b._at ?? 0));
  const files = (useQuery('attachments', { limit: 200 }) as Attachment[]).filter((f) => f.task === id);
  const dialog = useDialog();
  const [title, setTitle] = useLocal<string>(task?.title ?? '');
  const [notes, setNotes] = useLocal<string>(task?.notes ?? '');
  const [link, setLink] = useLocal<string>(task?.link ?? '');
  const [step, setStep] = useLocal<string>('');
  const [said, setSaid] = useLocal<string>('');
  const [focus, setFocus] = useLocal<boolean>(false);
  // Kept when leaving, however you leave.
  const latest = useRef({ title, notes, link, task });
  latest.current = { title, notes, link, task };
  useEffect(() => () => {
    const { title, notes, link, task } = latest.current;
    if (!task || !todo.canAdd) return;
    const changes: Record<string, unknown> = {};
    if (title.trim() && title.trim() !== task.title) changes.title = title.trim();
    if (notes !== (task.notes ?? '')) changes.notes = notes || null;
    const typed = link.trim();
    const url = typed && !/^https?:\/\//i.test(typed) ? `https://${typed}` : typed;
    if (url !== (task.link ?? '')) changes.link = url || null;
    if (Object.keys(changes).length) todo.edit('tasks', task.id, changes);
  }, []);
  if (!task) return <Screen title={t('Todo')} />;
  const set = (fields: Record<string, unknown>) => todo.canAdd && todo.edit('tasks', task.id, fields);
  const mine = todo.steps.filter((x) => x.task === id).sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? ''));
  const addStep = () => {
    const words = step.trim();
    if (!words) return;
    setStep('');
    todo.add('steps', { task: id, title: words, pos: between(last(mine), '') });
  };
  const say = () => {
    const words = said.trim();
    if (!words) return;
    setSaid('');
    todo.add('comments', { task: id, text: words });
  };
  const nameOf = (who?: string) => todo.members.find((m) => m.id === who)?.name ?? '';
  return (
    <Screen
      title={task.title}
      actions={
        todo.canAdd ? (
          <IconButton icon="delete" label={t('Delete')} onPress={async () => {
            const ok = await dialog.confirm({ title: t('Delete this task?'), ok: t('Delete'), danger: true });
            if (!ok) return;
            for (const x of mine) todo.remove('steps', x.id);
            todo.remove('tasks', task.id);
            nav.pop();
          }} />
        ) : undefined
      }
    >
      <Row gap={8} align="center">
        <Checkbox round checked={!!task.done} onChange={() => todo.toggle(task)} />
        <Stack grow><TextField value={title} max={200} onChange={setTitle} /></Stack>
      </Row>
      <Box class={s.card}>
        {mine.map((x) => (
          <Row key={x.id} gap={4} align="center">
            <Checkbox checked={!!x.done} onChange={() => todo.edit('steps', x.id, { done: !x.done })} />
            <Text grow class={x.done ? s.done : s.title}>{x.title}</Text>
            {todo.canAdd && <IconButton icon="close" label={t('Delete')} onPress={() => todo.remove('steps', x.id)} />}
          </Row>
        ))}
        {todo.canAdd && (
          <Row gap={8} align="center" class={s.addStep}>
            <Icon name="add" size={18} />
            <Stack grow><TextField value={step} onChange={setStep} placeholder={t('Add a step')} onSubmit={addStep} /></Stack>
          </Row>
        )}
      </Box>
      <Box class={s.card}>
        <Stack gap={10} pad={[8, 4]}>
          <Row gap={8} align="center" wrap>
            <Icon name="alarm" />
            <DatePicker value={task.due !== undefined ? dayOf(task.due) : undefined} placeholder={t('Due')}
                        late={task.due !== undefined && !task.done && task.due < Date.now()}
                        onChange={(day: string) => set({ due: day ? at(day, task.due !== undefined ? timeOf(task.due) : '09:00') : null })} />
            {task.due !== undefined && (
              <TimePicker value={timeOf(task.due)} onChange={(time: string) => set({ due: at(dayOf(task.due!), time) })} />
            )}
            {task.due !== undefined && <IconButton icon="close" label={t('Clear')} onPress={() => set({ due: null })} />}
          </Row>
          <Select label={t('Repeat')} value={task.repeat ?? 'never'}
                  options={REPEATS.map(([value, label]) => ({ value, label: t(label) }))}
                  onChange={(repeat: string) => set({ repeat })} />
          <Select label={t('Project')} value={task.list ?? null}
                  options={todo.lists.map((l) => ({ value: l.id, label: l.name }))}
                  onChange={(list: string) => set({ list, status: task.status ?? 'todo' })} />
          {todo.members.length > 1 && (
            <PersonPicker label={t('Who')} value={task.who ?? null} onChange={(who: string) => set({ who })} />
          )}
          <TextField label={t('Link')} type="url" value={link} placeholder="https://" onChange={setLink} />
          <Toggle label={t('Flag')} checked={!!task.flag} onChange={(flag: boolean) => set({ flag })} />
        </Stack>
      </Box>
      <Editor value={notes} onChange={setNotes} placeholder={t('Notes')} lines={6} />
      <Box class={s.block}>
        <Upload value={files.map((f) => f.file)} label={t('Add a file')}
                onUpload={todo.canAdd ? (file: unknown) => todo.add('attachments', { task: id, file }) : undefined}
                onRemove={todo.canAdd ? (file: any) => {
                  const f = files.find((x) => (x.file as any)?.id === file?.id || x.file === file);
                  if (f) todo.remove('attachments', f.id);
                } : undefined} />
      </Box>
      {focus ? (
        <Box class={s.focus}>
          <Timer seconds={25 * 60} label={t('Focus')} onDone={() => setFocus(false)} />
          <Button variant="plain" onPress={() => setFocus(false)}>{t('Stop')}</Button>
        </Box>
      ) : (
        <Button variant="tonal" icon="timer" expand onPress={() => setFocus(true)}>{t('Focus')}</Button>
      )}
      {(comments.length > 0 || todo.members.length > 1) && (
        <Box class={s.card}>
          <Stack gap={10} pad={[8, 4]}>
            {comments.map((c) => (
              <Row key={c.id} gap={8} align="start">
                {c._by && <Avatar person={c._by} size={26} />}
                <Stack grow>
                  <Text bold>{nameOf(c._by)}</Text>
                  <Text>{c.text}</Text>
                </Stack>
                {c._at ? <Text class={s.when}>{format.relative(c._at)}</Text> : null}
              </Row>
            ))}
            {todo.canAdd && (
              <Row gap={8} align="center">
                <Stack grow><TextField value={said} onChange={setSaid} placeholder={t('Comment')} onSubmit={say} /></Stack>
                <IconButton icon="send" label={t('Send')} onPress={say} />
              </Row>
            )}
          </Stack>
        </Box>
      )}
    </Screen>
  );
}

const findTask = (rows: Task[], title: string) => {
  const want = String(title).toLowerCase();
  return rows.find((r) => !r.done && r.title.toLowerCase() === want) ?? rows.find((r) => !r.done && r.title.toLowerCase().includes(want));
};

export default defineApp({
  screens: { Home, Task: TaskScreen },
  // A task opens beside the list on a wide window.
  split: ['Home'],
  actions: {
    add: {
      title: 'Add a task',
      params: {
        title: 'string',
        due: { type: 'string', optional: true, title: 'When it is due, as an ISO date and time' },
        project: { type: 'string', optional: true, title: "A project's name" },
        repeat: { type: 'string', optional: true, options: REPEATS.map(([v]) => v) },
      },
      run: ({ title, due, project, repeat }: { title: string; due?: string; project?: string; repeat?: string }, { data }: any) => {
        const lists = data.query('lists', { limit: 500 }) as List_[];
        const list = project ? lists.find((l) => l.name.toLowerCase() === String(project).toLowerCase()) : undefined;
        if (project && !list) throw new Error(`No project called ${project}`);
        const ms = due ? Date.parse(String(due)) : NaN;
        const id = data.add('tasks', {
          title: String(title).slice(0, 200),
          due: Number.isFinite(ms) ? ms : undefined,
          list: list?.id,
          status: list ? 'todo' : undefined,
          repeat: repeat && REPEATS.some(([v]) => v === repeat) ? repeat : undefined,
        });
        return { id };
      },
    },
    done: {
      title: 'Tick off a task',
      params: { title: 'string' },
      run: ({ title }: { title: string }, { data }: any) => {
        const rows = data.query('tasks', { limit: 500 }) as Task[];
        const r = findTask(rows, title);
        if (!r) throw new Error(`No open task called ${title}`);
        data.edit('tasks', r.id, { done: true, doneAt: Date.now(), status: 'done' });
        if (r.repeat && r.repeat !== 'never' && typeof r.due === 'number') {
          data.add('tasks', { title: r.title, due: next(r.due, r.repeat), repeat: r.repeat, list: r.list, who: r.who });
        }
        return { done: r.title };
      },
    },
  },
});
