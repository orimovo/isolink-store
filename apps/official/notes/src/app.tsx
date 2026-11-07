import {
  defineApp, Screen, Stack, Row, List, ListItem, Text, SearchField, Editor, Markdown, Icon, IconButton, Fab,
  Pressable, useQuery, useRecord, useData, useLocal, useMe, useNav, useDialog, useRef, useEffect, delay, t,
} from 'isolink';

type Note = { id: string; title?: string; body?: string; pinned?: boolean; _by?: string; _edited?: number };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const clean = (line: string) => line.replace(/^[#>*\-\s]+/, '').trim();

/** A note's title: its own, or its first line. */
export function noteTitle(r: Note) {
  const own = (r.title ?? '').trim();
  if (own) return own;
  const first = clean((r.body ?? '').split('\n').find((l) => l.trim()) ?? '');
  return first || t('New note');
}

function preview(r: Note) {
  const lines = (r.body ?? '').split('\n').filter((l) => l.trim());
  const rest = (r.title ?? '').trim() ? lines : lines.slice(1);
  return rest.length ? clean(rest[0]) : '';
}

/** When it changed: the time today, Yesterday, the weekday, then the date. */
function changed(ms: number) {
  const d = new Date(ms);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(d)) / 86400000);
  if (days === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days === 1) return t('Yesterday');
  if (days < 7) return t(WEEKDAYS[d.getDay()]);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() % 100}`;
}

function Home() {
  const all = useQuery('notes', { limit: 500 }) as Note[];
  const { add } = useData();
  const me = useMe();
  const nav = useNav();
  const [search, setSearch] = useLocal<string>('');
  const q = search.trim().toLowerCase();
  const notes = all
    .filter((r) => !q || `${r.title ?? ''}\n${r.body ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => (a.pinned === b.pinned ? (b._edited ?? 0) - (a._edited ?? 0) : a.pinned ? -1 : 1));

  const create = () => {
    const id = add('notes', { body: '' });
    nav.push('Note', { id, fresh: true });
  };

  return (
    <Screen
      title={t('Notes')}
      fab={me.role !== 'view' ? <Fab icon="edit" onPress={create} /> : undefined}
    >
      <SearchField value={search} onChange={setSearch} placeholder={t('Search')} />
      {notes.length === 0 ? (
        <Stack align="center" gap={8} pad={48}>
          <Icon name="sticky_note_2" size={40} />
          <Text tone="muted">{t('No notes yet')}</Text>
        </Stack>
      ) : (
        <List>
          {notes.map((r) => (
            <ListItem
              key={r.id}
              leading={<Icon name={r.pinned ? 'push_pin' : 'sticky_note_2'} tone={r.pinned ? 'accent' : 'muted'} />}
              title={noteTitle(r)}
              subtitle={[r._edited ? changed(r._edited) : '', preview(r)].filter(Boolean).join(' · ')}
              onPress={() => nav.push('Note', { id: r.id })}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}

/** One note: drawn when you're not typing, markdown when you are. Saves as
 *  you go; two devices editing apart merge by paragraph. */
function Note() {
  const nav = useNav();
  const { id, fresh } = nav.params as { id: string; fresh?: boolean };
  const row = useRecord('notes', id) as Note | null;
  const { edit, remove } = useData();
  const me = useMe();
  const dialog = useDialog();
  const [editing, setEditing] = useLocal<boolean>(!!fresh);
  const [draft, setDraft] = useLocal<string | null>(null);
  const saved = useRef({ text: row?.body ?? '', turn: 0 });

  const body = draft ?? row?.body ?? '';
  const canEdit = me.role !== 'view' && !(me.role === 'add' && row?._by !== me.id);

  const flush = (text: string) => {
    if (text === saved.current.text) return;
    saved.current.text = text;
    if (!text.trim() && fresh) remove('notes', id);
    else edit('notes', id, { body: text });
  };
  // Leaving keeps what was typed; a new note left empty goes.
  const latest = useRef(body);
  latest.current = body;
  useEffect(() => () => {
    if (!canEdit) return;
    if (fresh && !latest.current.trim()) remove('notes', id);
    else flush(latest.current);
  }, []);

  const type = (text: string) => {
    setDraft(text);
    const turn = ++saved.current.turn;
    delay(800).then(() => {
      if (saved.current.turn === turn) flush(text);
    });
  };

  if (!row) return <Screen title={t('Notes')} />;

  const actions = canEdit ? (
    <Row>
      <IconButton icon="push_pin" label={row.pinned ? t('Unpin') : t('Pin')}
                  onPress={() => edit('notes', id, { pinned: !row.pinned })} />
      <IconButton icon={editing ? 'check' : 'edit'} label={editing ? t('Done') : t('Edit')}
                  onPress={() => {
                    if (editing) {
                      flush(body);
                      setDraft(null);
                    }
                    setEditing(!editing);
                  }} />
      <IconButton icon="delete" label={t('Delete')}
                  onPress={async () => {
                    const ok = await dialog.confirm({
                      title: t('Delete this note?'),
                      body: t('It goes for everyone in this database.'),
                      ok: t('Delete'),
                      danger: true,
                    });
                    if (!ok) return;
                    saved.current.text = latest.current;
                    remove('notes', id);
                    nav.pop();
                  }} />
    </Row>
  ) : undefined;

  return (
    <Screen title={noteTitle({ ...row, body })} actions={actions}>
      {editing ? (
        <Editor value={body} onChange={type} lines={24} toolbar />
      ) : (
        <Pressable onDoubleTap={canEdit ? () => setEditing(true) : undefined}>
          {body.trim() ? (
            <Markdown>{body}</Markdown>
          ) : (
            <Stack align="center" gap={8} pad={48}>
              <Icon name="sticky_note_2" size={40} />
              <Text tone="muted">{t('Empty note')}</Text>
            </Stack>
          )}
        </Pressable>
      )}
    </Screen>
  );
}

export default defineApp({ screens: { Home, Note } });
