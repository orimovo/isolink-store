import {
  defineApp, Screen, Stack, Row, List, ListItem, Checkbox, Text, TextField, Editor, Select, Button, Chip,
  Scroll, Icon, Avatar, Toggle, DatePicker, TimePicker, PersonPicker, Sheet, useQuery, useData, useLocal,
  useMe, useChat, useDialog, useNow, useRef, useEffect, t,
} from 'isolink';
import { between, last } from './pos';

type Task = {
  id: string; title: string; done?: boolean; due?: number; list?: string; who?: string; flag?: boolean;
  notes?: string; pos?: string; doneAt?: number; _at?: number;
};
type List_ = { id: string; name: string; pos?: string };

/** Which tasks show: Today, Upcoming, Done, or a list by its id. */
const TODAY = '_today', UPCOMING = '_upcoming', DONE = '_done';

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

/** When it's due, in a few words: the time today, else the day. */
function when(ms: number, now: number) {
  const end = endOfToday(now);
  if (ms < end && ms >= end - 86400000) return timeOf(ms);
  if (ms >= end && ms < end + 86400000) return t('Tomorrow');
  if (ms < end - 86400000 && ms >= end - 2 * 86400000) return t('Yesterday');
  const d = new Date(ms);
  return `${d.getDate()} ${t(MONTHS[d.getMonth()])}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Home() {
  const lists = (useQuery('lists', { limit: 500 }) as List_[]).sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? ''));
  const all = useQuery('tasks', { limit: 500 }) as Task[];
  const { add, edit, remove } = useData();
  const me = useMe();
  const members = useChat() as { id: string }[];
  const dialog = useDialog();
  const now = useNow(60000);
  const [view, setView] = useLocal<string>(TODAY);
  const [draft, setDraft] = useLocal<string>('');
  const [open, setOpen] = useLocal<string | null>(null);
  const canAdd = me.role !== 'view';
  const shown = !view.startsWith('_') && !lists.some((l) => l.id === view) ? TODAY : view;

  const end = endOfToday(now);
  const isOpen = (r: Task) => !r.done;
  const tasks = all.filter((r) =>
    shown === TODAY ? isOpen(r) && typeof r.due === 'number' && r.due < end
    : shown === UPCOMING ? isOpen(r) && typeof r.due === 'number' && r.due >= end
    : shown === DONE ? !isOpen(r)
    : isOpen(r) && r.list === shown,
  );
  tasks.sort((a, b) => {
    if (shown === DONE) return (b.doneAt ?? 0) - (a.doneAt ?? 0);
    const da = a.due ?? 2 ** 52, db = b.due ?? 2 ** 52;
    if (da !== db) return da - db;
    return (a._at ?? 0) - (b._at ?? 0);
  });

  const toggle = (r: Task) => {
    const done = !r.done;
    edit('tasks', r.id, { done, doneAt: done ? Date.now() : null });
  };

  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    add('tasks', {
      title,
      list: shown.startsWith('_') ? undefined : shown,
      // Added to Today: due today.
      due: shown === TODAY ? end - 60000 : undefined,
    });
  };

  const newList = async () => {
    const name = ((await dialog.prompt({ title: t('New list'), placeholder: t('Name') })) ?? '').trim();
    if (!name) return;
    const id = add('lists', { name, pos: between(last(lists), '') });
    setView(id);
  };

  const chips: [string, string][] = [
    [TODAY, t('Today')],
    [UPCOMING, t('Upcoming')],
    ...lists.map((l) => [l.id, l.name] as [string, string]),
    [DONE, t('Done')],
  ];
  const task = all.find((r) => r.id === open);

  return (
    <Screen
      title={t('Todo')}
      footer={
        canAdd && shown !== DONE ? (
          <TextField value={draft} onChange={setDraft} placeholder={t('New task')} onSubmit={submit} />
        ) : undefined
      }
    >
      <Scroll direction="horizontal">
        <Row gap={6}>
          {chips.map(([id, label]) => (
            <Chip key={id} selected={shown === id} onPress={() => setView(id)}>{label}</Chip>
          ))}
          {canAdd && <Chip icon="add" onPress={newList}>{t('List')}</Chip>}
        </Row>
      </Scroll>
      {tasks.length === 0 ? (
        <Stack align="center" gap={8} pad={48}>
          <Icon name={shown === DONE ? 'check_circle' : 'checklist'} size={40} />
          <Text tone="muted">{shown === DONE ? t('Nothing done yet') : t('All clear')}</Text>
        </Stack>
      ) : (
        <List>
          {tasks.map((r) => {
            const list = shown.startsWith('_') ? lists.find((l) => l.id === r.list) : undefined;
            const parts = [r.due !== undefined ? when(r.due, now) : null, list?.name].filter(Boolean);
            const late = r.due !== undefined && !r.done && r.due < now;
            return (
              <ListItem
                key={r.id}
                leading={<Checkbox round checked={!!r.done} onChange={() => toggle(r)} />}
                trailing={
                  <Row gap={4} align="center">
                    {r.flag && <Icon name="flag" tone="warning" size={18} />}
                    {r.who && members.length > 1 && <Avatar person={r.who} size={24} />}
                  </Row>
                }
                title={r.title}
                subtitle={parts.length > 0 ? parts.join(' · ') : undefined}
                subtitleTone={late ? 'danger' : undefined}
                onPress={() => setOpen(r.id)}
                onSwipe={{
                  start: { icon: 'check', tone: 'success', do: () => toggle(r), keep: true },
                  end: { icon: 'delete', tone: 'danger', do: () => remove('tasks', r.id) },
                }}
              />
            );
          })}
        </List>
      )}
      <Sheet open={!!task} onClose={() => setOpen(null)}>
        {task && <TaskSheet key={task.id} task={task} lists={lists} shared={members.length > 1} canEdit={canAdd}
                            onDone={() => setOpen(null)} />}
      </Sheet>
    </Screen>
  );
}

function TaskSheet({ task, lists, shared, canEdit, onDone }:
  { task: Task; lists: List_[]; shared: boolean; canEdit: boolean; onDone: () => void }) {
  const { edit, remove } = useData();
  const [title, setTitle] = useLocal<string>(task.title);
  const [notes, setNotes] = useLocal<string>(task.notes ?? '');
  // Kept when the sheet goes, however it goes.
  const latest = useRef({ title, notes, task });
  latest.current = { title, notes, task };
  useEffect(() => () => {
    if (!canEdit) return;
    const { title, notes, task } = latest.current;
    const next = title.trim();
    const changes: Record<string, unknown> = {};
    if (next && next !== task.title) changes.title = next;
    if (notes !== (task.notes ?? '')) changes.notes = notes || null;
    if (Object.keys(changes).length) edit('tasks', task.id, changes);
  }, []);
  const set = (fields: Record<string, unknown>) => canEdit && edit('tasks', task.id, fields);
  return (
    <Stack gap={12}>
      <TextField label={t('Title')} value={title} max={200} onChange={setTitle} />
      <Row gap={8} align="center">
        <DatePicker value={task.due !== undefined ? dayOf(task.due) : undefined} placeholder={t('Due')}
                    onChange={(day: string) => set({ due: day ? at(day, task.due !== undefined ? timeOf(task.due) : '09:00') : null })} />
        {task.due !== undefined && (
          <TimePicker value={timeOf(task.due)} onChange={(time: string) => set({ due: at(dayOf(task.due!), time) })} />
        )}
        {task.due !== undefined && <Button variant="plain" onPress={() => set({ due: null })}>{t('Clear')}</Button>}
      </Row>
      <Select label={t('List')} value={task.list ?? null}
              options={lists.map((l) => ({ value: l.id, label: l.name }))}
              onChange={(list: string) => set({ list })} />
      {shared && <PersonPicker label={t('Who')} value={task.who ?? null} onChange={(who: string) => set({ who })} />}
      <Toggle label={t('Flag')} checked={!!task.flag} onChange={(flag: boolean) => set({ flag })} />
      <Editor value={notes} onChange={setNotes} placeholder={t('Notes')} lines={8} />
      <Row gap={8} justify="end">
        {canEdit && <Button variant="danger" onPress={() => { remove('tasks', task.id); onDone(); }}>{t('Delete')}</Button>}
        <Button onPress={onDone}>{t('Done')}</Button>
      </Row>
    </Stack>
  );
}

export default defineApp({ screens: { Home } });
