import {
  defineApp, Screen, Stack, Box, Text, SearchField, Editor, Markdown, Icon, IconButton, Fab, Chip, Masonry,
  StickyNote, Pressable, Row, useQuery, useRecord, useData, useLocal, useMe, useNav, useDialog, useRef, useEffect,
  delay, t,
} from 'isolink';
import s from './app.css';
import { between } from './pos';

type Note = {
  id: string; title?: string; body?: string; pinned?: boolean; color?: string; pos?: string; folder?: string;
  _by?: string; _edited?: number;
};
type Folder = { id: string; name: string };

export const COLORS: [string, string][] = [
  ['yellow', '#fde68a'], ['pink', '#fbcfe8'], ['blue', '#bfdbfe'],
  ['green', '#bbf7d0'], ['orange', '#fed7aa'], ['purple', '#ddd6fe'],
];
const NAMES: Record<string, string> = {
  yellow: 'Yellow', pink: 'Pink', blue: 'Blue', green: 'Green', orange: 'Orange', purple: 'Purple',
};
const TILTS = [-1.2, 0.9, -0.5, 1.4, -0.8, 0.6];

/** Its colour, or for a note from before colours, one that stays the same. */
function colorOf(r: Note) {
  if (r.color) return r.color;
  let h = 0;
  for (const c of r.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length][0];
}
const clean = (line: string) => line.replace(/^[#>*\-\s]+/, '').trim();

/** A note's title: its own, or its first line. */
function noteTitle(r: Note) {
  const own = (r.title ?? '').trim();
  if (own) return own;
  const first = clean((r.body ?? '').split('\n').find((l) => l.trim()) ?? '');
  return first || t('New note');
}

/** What's under the title, as it's written. */
function rest(r: Note) {
  const lines = (r.body ?? '').split('\n');
  if ((r.title ?? '').trim()) return lines.join('\n').trim();
  const i = lines.findIndex((l) => l.trim());
  return lines.slice(i + 1).join('\n').trim();
}

/** Pinned first, then the order they were put in, then the newest. */
function order(notes: Note[]) {
  return [...notes].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if ((a.pos ?? '') !== (b.pos ?? '')) {
      if (!a.pos) return 1;
      if (!b.pos) return -1;
      return a.pos < b.pos ? -1 : 1;
    }
    return (b._edited ?? 0) - (a._edited ?? 0);
  });
}

function Home() {
  const all = useQuery('notes', { limit: 500 }) as Note[];
  const folders = useQuery('folders', { limit: 100 }) as Folder[];
  const { add, edit, remove } = useData();
  const me = useMe();
  const nav = useNav();
  const dialog = useDialog();
  const [folder, setFolder] = useLocal<string | null>(null);
  const [searching, setSearching] = useLocal<boolean>(false);
  const [search, setSearch] = useLocal<string>('');
  const canEdit = me.role !== 'view';
  const q = search.trim().toLowerCase();
  const shown = order(all).filter(
    (r) =>
      (!folder || r.folder === folder) &&
      (!q || `${r.title ?? ''}\n${r.body ?? ''}`.toLowerCase().includes(q)),
  );

  const create = () => {
    const id = add('notes', { body: '', folder: folder ?? undefined, color: COLORS[all.length % 6][0] });
    nav.push('Note', { id, fresh: true });
  };

  /** Dropped on another note: it takes that one's place. */
  const move = (id: string, to: number) => {
    const list = shown.filter((r) => r.id !== id);
    const moving = shown.find((r) => r.id === id);
    if (!moving) return;
    const at = Math.min(to, list.length);
    // Every note gets a place once one is moved, so the order holds.
    const keyed = list.map((r) => r.pos ?? '');
    if (keyed.some((p) => !p) || new Set(keyed).size !== keyed.length) {
      let prev = '';
      [...list.slice(0, at), moving, ...list.slice(at)].forEach((r) => {
        prev = between(prev, '');
        edit('notes', r.id, { pos: prev });
      });
      return;
    }
    const before = at > 0 ? keyed[at - 1] : '';
    const after = at < keyed.length ? keyed[at] : '';
    edit('notes', id, { pos: between(before, after), pinned: at < list.length ? !!list[at].pinned : moving.pinned });
  };

  const hold = async (id: string) => {
    const r = all.find((x) => x.id === id);
    if (!r || !canEdit) return;
    const picked = await dialog.menu([
      { id: 'pin', icon: 'push_pin', label: r.pinned ? t('Unpin') : t('Pin') },
      { id: 'color', icon: 'palette', label: t('Colour') },
      ...(folders.length ? [{ id: 'move', icon: 'folder', label: t('Move to') }] : []),
      { divider: true },
      { id: 'delete', icon: 'delete', label: t('Delete'), danger: true },
    ]);
    if (picked === 'pin') edit('notes', id, { pinned: !r.pinned });
    if (picked === 'color') {
      const c = await dialog.menu(COLORS.map(([c]) => ({ id: c, icon: 'circle', label: t(NAMES[c]) })));
      if (c) edit('notes', id, { color: c });
    }
    if (picked === 'move') {
      const f = await dialog.menu([
        { id: '', icon: 'sticky_note_2', label: t('All') },
        ...folders.map((f) => ({ id: f.id, icon: 'folder', label: f.name })),
      ]);
      if (f !== null && f !== undefined) edit('notes', id, { folder: f || null });
    }
    if (picked === 'delete') {
      const ok = await dialog.confirm({
        title: t('Delete this note?'),
        body: t('It goes for everyone in this database.'),
        ok: t('Delete'),
        danger: true,
      });
      if (ok) remove('notes', id);
    }
  };

  const newFolder = async () => {
    const name = ((await dialog.prompt({ title: t('New folder'), placeholder: t('Name') })) ?? '').trim();
    if (name) setFolder(add('folders', { name }));
  };

  return (
    <Screen
      title={t('Notes')}
      actions={<IconButton icon="search" label={t('Search')} onPress={() => { setSearching(!searching); setSearch(''); }} />}
      fab={canEdit ? <Fab icon="add" onPress={create} /> : undefined}
    >
      {searching && <SearchField value={search} onChange={setSearch} placeholder={t('Search')} />}
      {(folders.length > 0 || canEdit) && (
        <Box class={s.chips}>
          <Chip selected={!folder} onPress={() => setFolder(null)}>{t('All')}</Chip>
          {folders.map((f) => (
            <Chip key={f.id} selected={folder === f.id} onPress={() => setFolder(f.id)}>{f.name}</Chip>
          ))}
          {canEdit && <Chip icon="add" onPress={newFolder}>{folders.length ? '' : t('Folder')}</Chip>}
        </Box>
      )}
      {shown.length === 0 ? (
        <Stack align="center" gap={8} class={s.empty}>
          <Icon name="sticky_note_2" size={40} />
          <Text tone="muted">{t('No notes yet')}</Text>
        </Stack>
      ) : (
        <Masonry columns={2} gap={14} onReorder={canEdit ? move : undefined} onHold={hold}>
          {shown.map((r, i) => (
            <StickyNote key={r.id} id={r.id} color={colorOf(r)} tilt={TILTS[i % TILTS.length]}
                        pinned={!!r.pinned} onPress={() => nav.push('Note', { id: r.id })}>
              <Text class={s.title}>{noteTitle(r)}</Text>
              {rest(r) ? <Markdown class={s.body}>{rest(r)}</Markdown> : null}
            </StickyNote>
          ))}
        </Masonry>
      )}
    </Screen>
  );
}

/** One note, big: drawn when you're not typing, words when you are. Saves as
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
    edit('notes', id, { body: text });
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
      <StickyNote color={colorOf(row)} fold={36} onDoubleTap={canEdit ? () => setEditing(true) : undefined}>
        {editing ? (
          <Editor value={body} onChange={type} plain autofocus toolbar placeholder={t('New note')} />
        ) : body.trim() ? (
          <Pressable onDoubleTap={canEdit ? () => setEditing(true) : undefined}>
            <Markdown>{body}</Markdown>
          </Pressable>
        ) : (
          <Text>{t('Empty note')}</Text>
        )}
      </StickyNote>
      {canEdit && (
        <Box class={s.swatches}>
          {COLORS.map(([c, hex]) => (
            <Pressable key={c} class={[s.swatch, colorOf(row) === c && s.on]} style={{ background: hex }}
                       onPress={() => edit('notes', id, { color: c })} />
          ))}
        </Box>
      )}
    </Screen>
  );
}

export default defineApp({ screens: { Home, Note } });
