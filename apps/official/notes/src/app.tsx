import {
  defineApp, Screen, Stack, Box, Text, SearchField, Editor, Markdown, Icon, IconButton, Fab, Chip, Masonry,
  StickyNote, Corkboard, Sticker, ChatCard, PersonCard, ChatChip, Filter, Pressable, Split, Row, TagInput, Image, Audio, Recorder, Upload, ListItem, FormatBar,
  Grid, Glass, Button, useLayout, useQuery, useRecord, useData, useLocal, useStore, useMe, useNav, useDialog, useRef, useEffect, delay, t, has,
} from 'isolink';
import s from './app.css';
import { between } from './pos';
import { useAddBar } from './addbar';
import { dayWords, isoDay, siteOf } from './smart';

type Note = {
  id: string; title?: string; body?: string; pinned?: boolean; color?: string; pos?: string; folder?: string;
  tags?: string[]; x?: number; y?: number; tilt?: number; kind?: string; photo?: unknown; voice?: unknown;
  sketch?: unknown; links?: string[]; due?: number; link?: string; w?: number; h?: number; _by?: string; _edited?: number;
  pin?: string; ref?: Ref; stickers?: Stuck[]; refs?: Ref[];
};
/** A chat, message or link picked with dialog.chat(), a person from
 *  dialog.person(), or a sticker's emoji: what a board item is of. */
type Ref = { kind?: string; chat?: string; message?: string; title?: string; text?: string; url?: string;
  id?: string; name?: string; emoji?: string };
/** A sticker stuck on a note, where on it. */
type Stuck = { emoji: string; x: number; y: number };
type Folder = { id: string; name: string };

export const COLORS: [string, string][] = [
  ['yellow', '#fde68a'], ['pink', '#fbcfe8'], ['blue', '#bfdbfe'],
  ['green', '#bbf7d0'], ['orange', '#fed7aa'], ['purple', '#ddd6fe'],
];
const NAMES: Record<string, string> = {
  yellow: /*t*/'Yellow', pink: /*t*/'Pink', blue: /*t*/'Blue', green: /*t*/'Green', orange: /*t*/'Orange',
  purple: /*t*/'Purple',
};
const TILTS = [-1.2, 0.9, -0.5, 1.4, -0.8, 0.6];
/** A note's paper, in points: the same shape on the board and opened. */
const sizeOf = (r: Note): [number, number] => [r.w ?? 190, r.h ?? 160];
const KINDS: [string, string, string][] = [
  ['note', /*t*/'Note', 'sticky_note_2'], ['list', /*t*/'List', 'checklist'], ['photo', /*t*/'Photo', 'photo_camera'],
  ['voice', /*t*/'Voice', 'mic'], ['sketch', /*t*/'Sketch', 'brush'],
];

/** Things on the board that aren't notes: a sticker, a person's card, a chat's. */
const ITEMS = ['sticker', 'person', 'chat'];
const isItem = (r: Note) => ITEMS.includes(r.kind ?? '');
/** Strings, pin colours, stickers and cards: Isolinks that draw them. */
const pins = () => has('corkboard.pins');

/** A number the same for the same id: a note's colour or tilt before it has one. */
function hash(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
const colorOf = (r: Note) => r.color || COLORS[hash(r.id) % COLORS.length][0];
const tiltOf = (r: Note) => (typeof r.tilt === 'number' ? r.tilt : ((hash(r.id) % 50) - 25) / 10);
const pad = (n: number) => String(n).padStart(2, '0');
/** [day] (`YYYY-MM-DD`) at [time] (`HH:MM`), here. */
const at = (day: string, time: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
};
const clean = (line: string) =>
  line.replace(/^[#>*\-\s]+/, '').replace(/^\[[ xX]\]\s*/, '').replace(/\*\*|__|~~|`/g, '').trim();
/** A code block's opening line: not a title. */
const fence = (line: string) => /^\s*(`{3,}|~{3,})/.test(line);

/** A note's title: its own, or its first line. */
function noteTitle(r: Note) {
  if (r.kind === 'sticker') return r.ref?.emoji ?? t('Sticker');
  if (r.kind === 'person') return r.ref?.name ?? t('Contact');
  if (r.kind === 'chat') return r.ref?.title || t('Chat');
  const own = (r.title ?? '').trim();
  if (own) return own;
  const line = (r.body ?? '').split('\n').find((l) => l.trim()) ?? '';
  const first = fence(line) ? '' : clean(line);
  if (first) return first;
  return t(KINDS.find(([k]) => k === r.kind)?.[1] ?? 'New note');
}

/** What's under the title, as it's written. */
function rest(r: Note) {
  const lines = (r.body ?? '').split('\n');
  if ((r.title ?? '').trim()) return lines.join('\n').trim();
  const i = lines.findIndex((l) => l.trim());
  const first = lines[i] ?? '';
  // A list's first line is one of its boxes: it stays.
  if (/^\s*[-*+]\s+\[[ xX]\]/.test(first)) return lines.join('\n').trim();
  // Nor does a code block's opening line, or the code would break.
  if (fence(first)) return lines.join('\n').trim();
  return lines.slice(i + 1).join('\n').trim();
}

/** Its body with [shown] (what's under the title) changed to [now]. */
function changedBody(r: Note, shown: string, now: string) {
  const whole = r.body ?? '';
  const at = whole.lastIndexOf(shown);
  return at < 0 ? whole : whole.slice(0, at) + now + whole.slice(at + shown.length);
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

/** When a note reminds you: "Tomorrow 17:00". */
function dueWords(ms: number) {
  const d = new Date(ms);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${dayWords(isoDay(d), Date.now())}${time === '09:00' ? '' : ` ${time}`}`;
}

/** A note as it is on the board and in the grid. */
function Paper({ r, tilt, onPress, onTick }: { r: Note; tilt: number; onPress: () => void; onTick?: (body: string) => void }) {
  const more = rest(r);
  return (
    <StickyNote id={r.id} x={r.x} y={r.y} color={colorOf(r)} tilt={tilt} pinned={!!r.pinned} sketch={r.sketch}
                size={sizeOf(r)} onPress={onPress} pin={r.pin} stickers={pins() ? r.stickers : undefined}>
      <Text class={s.title}>{noteTitle(r)}</Text>
      {r.photo ? <Image src={r.photo} ratio={4 / 3} class={s.thumb} /> : null}
      {more ? (
        <Markdown class={s.body} onChange={onTick ? (text: string) => onTick(changedBody(r, more, text)) : undefined}>{more}</Markdown>
      ) : null}
      {r.voice ? (
        <Row gap={1} align="center"><Icon name="mic" size={16} /><Text class={s.small}>{t('Voice')}</Text></Row>
      ) : null}
      {pins() && r.refs?.length ? <Chips refs={r.refs} /> : null}
      {typeof r.due === 'number' || r.link ? (
        <Row gap={10} align="center" wrap class={s.paperMeta}>
          {typeof r.due === 'number' ? (
            <Row gap={1} align="center"><Icon name="alarm" size={14} /><Text class={s.small}>{dueWords(r.due)}</Text></Row>
          ) : null}
          {r.link ? <Row gap={1} align="center"><Icon name="link" size={14} /><Text class={s.small} lines={1}>{siteOf(r.link)}</Text></Row> : null}
        </Row>
      ) : null}
    </StickyNote>
  );
}

/** Chats and messages put in a note, each a small pill; held, [onRemove]. */
function Chips({ refs, onRemove }: { refs: Ref[]; onRemove?: (i: number) => void }) {
  return (
    <Row gap={1} wrap class={s.refs}>
      {refs.map((ref, i) => (
        <ChatChip key={`${ref.chat}/${ref.message ?? ''}/${i}`} ref={ref}
                  onRemove={onRemove ? () => onRemove(i) : undefined} />
      ))}
    </Row>
  );
}

/** A board item: a sticker, a person's card or a chat's. */
function Item({ r, tilt }: { r: Note; tilt: number }) {
  if (r.kind === 'sticker') {
    return <Sticker key={r.id} id={r.id} x={r.x} y={r.y} tilt={tilt * 3} emoji={r.ref?.emoji ?? '⭐'} size={[84, 70]} />;
  }
  if (r.kind === 'person') {
    return <PersonCard key={r.id} id={r.id} x={r.x} y={r.y} tilt={tilt} pin={r.pin} person={r.ref?.id} name={r.ref?.name}
                       size={[210, 76]} />;
  }
  return <ChatCard key={r.id} id={r.id} x={r.x} y={r.y} tilt={tilt} pin={r.pin} ref={r.ref ?? {}} size={[220, 120]} />;
}

/** A sticker, picked, stuck on note [r] near its bottom corner. */
async function stickOn(r: Note, edit: (t: string, id: string, f: object) => void, pick: () => Promise<string | null>) {
  const emoji = await pick();
  if (!emoji) return;
  const [w, h] = sizeOf(r);
  const n = (r.stickers ?? []).length;
  edit('notes', r.id, { stickers: [...(r.stickers ?? []), { emoji, x: Math.max(4, w - 56 - n * 34), y: Math.max(24, h - 64) }] });
}

/** A note's format bar, with its photo, voice and sketch after the words' buttons. */
function NoteTools({ row, editor, mode, setMode }: {
  row: Note; editor: string; mode: string | null; setMode: (m: string | null) => void;
}) {
  const { edit } = useData();
  const dialog = useDialog();
  const id = row.id;
  return (
    <FormatBar for={editor}>
      {pins() ? (
        <>
          <IconButton icon="add_reaction" label={t('Sticker')} onPress={() => stickOn(row, edit, dialog.sticker)} />
          <IconButton icon="forum" label={t('Chat')} onPress={async () => {
            const ref = await dialog.chat();
            if (ref) edit('notes', id, { refs: [...(row.refs ?? []), ref] });
          }} />
        </>
      ) : null}
      {row.photo ? (
        <IconButton icon="hide_image" label={t('Remove photo')} onPress={() => edit('notes', id, { photo: null })} />
      ) : (
        <Upload variant="icon" icon="photo_camera" label={t('Photo')} accept="png,jpg,jpeg,heic,webp"
                onUpload={(f: unknown) => edit('notes', id, { photo: f })} />
      )}
      {row.voice ? (
        <IconButton icon="mic_off" label={t('Remove voice')} onPress={() => edit('notes', id, { voice: null })} />
      ) : (
        <IconButton icon="mic" label={t('Voice')} variant={mode === 'voice' ? 'filled' : undefined}
                    onPress={() => setMode(mode === 'voice' ? null : 'voice')} />
      )}
      <IconButton icon="brush" label={t('Sketch')} variant={mode === 'sketch' ? 'filled' : undefined}
                  onPress={() => setMode(mode === 'sketch' ? null : 'sketch')} />
      {row.sketch && (
        <IconButton icon="layers_clear" label={t('Remove sketch')} onPress={() => edit('notes', id, { sketch: null })} />
      )}
    </FormatBar>
  );
}

/** What's on a note under its words: its photo, voice clip, and the recorder while recording. */
function NoteMedia({ row, mode, setMode }: { row: Note; mode: string | null; setMode: (m: string | null) => void }) {
  const { edit } = useData();
  return (
    <>
      {pins() && row.refs?.length ? (
        <Chips refs={row.refs}
               onRemove={(i) => edit('notes', row.id, { refs: (row.refs ?? []).filter((_, j) => j !== i) })} />
      ) : null}
      {row.photo ? <Image src={row.photo} class={s.photo} /> : null}
      {row.voice ? <Box class={s.block}><Audio src={row.voice} /></Box> : null}
      {mode === 'voice' && !row.voice ? (
        <Box class={s.block}>
          <Recorder onDone={(f: unknown) => { edit('notes', row.id, { voice: f }); setMode(null); }} />
        </Box>
      ) : null}
    </>
  );
}

const blankNote = (body: string, r?: Note | null) =>
  !body.replace(/- \[ \]\s*/g, '').trim() && !r?.photo && !r?.voice && !r?.sketch;

/** Writing on one note right there on the board: what's typed is saved as
 *  it goes; put down empty, a new one goes. */
function useInPlace(all: Note[]) {
  const { add, edit, remove } = useData();
  const [editing, setEditing] = useLocal<string | null>(null);
  const [fresh, setFresh] = useLocal<string | null>(null);
  const [draft, setDraft] = useLocal<string | null>(null);
  const [mode, setMode] = useLocal<string | null>(null);
  const saved = useRef({ id: '', text: '', turn: 0 });
  const row = editing ? all.find((r) => r.id === editing) ?? null : null;
  const body = draft ?? row?.body ?? '';
  const latest = useRef({ editing, fresh, body, row });
  latest.current = { editing, fresh, body, row };

  const flush = (id: string, text: string) => {
    if (saved.current.id === id && text === saved.current.text) return;
    saved.current = { ...saved.current, id, text };
    edit('notes', id, { body: text });
  };
  /** Puts the note down: kept, or gone if it was new and is still empty. */
  const finish = () => {
    const { editing: id, fresh: isNew, body: text, row: r } = latest.current;
    if (!id) return;
    if (id === isNew && blankNote(text, r)) remove('notes', id);
    else if (r && text !== (r.body ?? '')) flush(id, text);
    setEditing(null);
    setFresh(null);
    setDraft(null);
    setMode(null);
  };
  // Leaving the app keeps what was typed; a new note still empty goes.
  useEffect(() => () => {
    const { editing: id, fresh: isNew, body: text, row: r } = latest.current;
    if (!id) return;
    if (id === isNew && blankNote(text, r)) remove('notes', id);
    else if (r && text !== (r.body ?? '')) edit('notes', id, { body: text });
  }, []);

  const start = (id: string, isNew = false) => {
    if (latest.current.editing === id) return;
    finish();
    saved.current = { id, text: all.find((r) => r.id === id)?.body ?? '', turn: 0 };
    setEditing(id);
    setFresh(isNew ? id : null);
  };
  const create = (folder: string | null) => {
    const id = add('notes', {
      body: '',
      kind: 'note',
      folder: folder ?? undefined,
      color: COLORS[all.length % 6][0],
    });
    start(id, true);
  };
  const type = (text: string) => {
    setDraft(text);
    const id = latest.current.editing;
    if (!id) return;
    const turn = ++saved.current.turn;
    delay(800).then(() => {
      if (saved.current.turn === turn && latest.current.editing === id) flush(id, text);
    });
  };
  return { editing, row, body, mode, setMode, start, finish, create, type, fresh };
}

function useNotes() {
  const all = useQuery('notes', { limit: 500 }) as Note[];
  const folders = useQuery('folders', { limit: 100 }) as Folder[];
  const { add, edit, remove } = useData();
  const me = useMe();
  const nav = useNav();
  const dialog = useDialog();
  const canEdit = me.role !== 'view';

  const create = async (folder: string | null, kind?: string) => {
    const k =
      kind ??
      (await dialog.menu(KINDS.map(([id, label, icon]) => ({ id, icon, label: t(label) }))));
    if (!k) return;
    const id = add('notes', {
      body: k === 'list' ? '- [ ] ' : '',
      kind: k,
      folder: folder ?? undefined,
      color: COLORS[all.length % 6][0],
    });
    nav.push('Note', { id, fresh: true });
  };

  const hold = async (id: string) => {
    const r = all.find((x) => x.id === id);
    if (!r || !canEdit) return;
    const others = all.filter((x) => x.id !== id && (x.folder ?? '') === (r.folder ?? '') && (pins() || !isItem(x))
      && x.kind !== 'sticker');
    const item = isItem(r);
    const strung = r.links?.length || all.some((o) => (o.links ?? []).includes(id));
    const picked = await dialog.menu([
      ...(item ? [] : [
        { id: 'pin', icon: 'push_pin', label: r.pinned ? t('Unpin') : t('Pin') },
        { id: 'color', icon: 'palette', label: t('Colour') },
      ]),
      ...(others.length && r.kind !== 'sticker' ? [{ id: 'link', icon: 'linear_scale', label: t('String to') }] : []),
      ...(strung ? [{ id: 'unlink', icon: 'link_off', label: t('Cut string') }] : []),
      ...(folders.length ? [{ id: 'move', icon: 'folder', label: t('Move to') }] : []),
      { divider: true },
      { id: 'delete', icon: 'delete', label: t('Delete'), danger: true },
    ]);
    if (picked === 'pin') edit('notes', id, { pinned: !r.pinned });
    if (picked === 'color') {
      const c = await dialog.menu(COLORS.map(([c]) => ({ id: c, icon: 'circle', label: t(NAMES[c]) })));
      if (c) edit('notes', id, { color: c });
    }
    if (picked === 'link') {
      const to = await dialog.menu(others.slice(0, 20).map((o) => ({ id: o.id, icon: 'sticky_note_2', label: noteTitle(o) })));
      if (to) edit('notes', id, { links: [...new Set([...(r.links ?? []), to])] });
    }
    if (picked === 'unlink') {
      edit('notes', id, { links: [] });
      for (const o of all) if ((o.links ?? []).includes(id)) edit('notes', o.id, { links: (o.links ?? []).filter((l) => l !== id) });
    }
    if (picked === 'move') {
      const f = await dialog.menu([
        { id: '', icon: 'sticky_note_2', label: t('All') },
        ...folders.map((f) => ({ id: f.id, icon: 'folder', label: f.name })),
      ]);
      if (f !== null && f !== undefined) edit('notes', id, { folder: f || null });
    }
    if (picked === 'delete' && item) remove('notes', id);
    if (picked === 'delete' && !item) {
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
    return name ? add('folders', { name }) : null;
  };

  // A folder's menu. Its notes stay, under All.
  const holdFolder = async (id: string) => {
    const f = folders.find((x) => x.id === id);
    if (!f || !canEdit) return;
    const picked = await dialog.menu([
      { id: 'rename', icon: 'edit', label: t('Rename') },
      { divider: true },
      { id: 'delete', icon: 'delete', label: t('Delete'), danger: true },
    ]);
    if (picked === 'rename') {
      const name = ((await dialog.prompt({ title: t('Rename'), placeholder: t('Name'), value: f.name })) ?? '').trim();
      if (name && name !== f.name) edit('folders', f.id, { name });
    }
    if (picked === 'delete') {
      for (const r of all.filter((r) => r.folder === f.id)) edit('notes', r.id, { folder: null });
      remove('folders', f.id);
    }
  };

  /** String from [a]'s pin to [b]'s. */
  const tie = (a: string, b: string) => {
    const r = all.find((x) => x.id === a);
    const o = all.find((x) => x.id === b);
    if (!r || !o || (r.links ?? []).includes(b) || (o.links ?? []).includes(a)) return;
    edit('notes', a, { links: [...(r.links ?? []), b] });
  };
  /** The string between [a] and [b], whichever end it was tied from. */
  const cut = (a: string, b: string) => {
    for (const [x, y] of [[a, b], [b, a]]) {
      const r = all.find((o) => o.id === x);
      if (r && (r.links ?? []).includes(y)) edit('notes', x, { links: (r.links ?? []).filter((l) => l !== y) });
    }
  };
  /** A sticker let go on a note: stuck on it there. */
  const drop = (id: string, onto: string, x: number, y: number) => {
    const r = all.find((o) => o.id === id);
    const note = all.find((o) => o.id === onto);
    if (!r || r.kind !== 'sticker' || !note || isItem(note)) return;
    const [w, h] = sizeOf(note);
    const at = { x: Math.max(0, Math.min(w - 40, x + 18)), y: Math.max(0, Math.min(h - 40, y + 14)) };
    edit('notes', onto, { stickers: [...(note.stickers ?? []), { emoji: r.ref?.emoji ?? '⭐', ...at }] });
    remove('notes', id);
  };

  return { all, folders, add, edit, remove, nav, dialog, canEdit, create, hold, holdFolder, newFolder, tie, cut, drop };
}

function Folders({ folders, folder, setFolder, canEdit, newFolder, onHold, onDrop }: {
  folders: Folder[]; folder: string | null; setFolder: (f: string | null) => void; canEdit: boolean;
  newFolder: () => Promise<string | null>; onHold?: (id: string) => void;
  onDrop?: (folder: string, note: string) => void;
}) {
  if (folders.length === 0 && !canEdit) return null;
  return (
    <Filter
      value={folder ?? ''}
      options={[{ value: '', label: t('All') }, ...folders.map((f) => ({ value: f.id, label: f.name }))]}
      onChange={(v: string) => setFolder(v || null)}
      onAdd={canEdit ? async () => { const id = await newFolder(); if (id) setFolder(id); } : undefined}
      addLabel={t('Folder')}
      onHold={canEdit && onHold ? (v: string) => v && onHold(v) : undefined}
      onDrop={canEdit ? onDrop : undefined}
    />
  );
}

function Empty({ emoji = '🗒️', words = t('No notes yet') }: { emoji?: string; words?: string }) {
  return (
    <Stack align="center" gap={12} class={s.empty}>
      <Box class={s.emptyArt}><Text class={s.emptyEmoji}>{emoji}</Text></Box>
      <Text class={s.emptyText}>{words}</Text>
    </Stack>
  );
}

function Hero({ big, line }: { big: string; line?: string }) {
  return (
    <Stack gap={1} class={s.hero}>
      <Text class={s.big}>{big}</Text>
      {line ? <Text class={s.line}>{line}</Text> : null}
    </Stack>
  );
}

/** A tag's colour, the same on every device. */
const TAG_HUES = ['#f87171', '#38bdf8', '#a78bfa', '#4ade80', '#f472b6', '#fbbf24', '#2dd4bf'];
const hueOfTag = (tag: string) => TAG_HUES[hash(tag) % TAG_HUES.length];

function Home() {
  const n = useNotes();
  const { all, folders, edit, nav, canEdit } = n;
  const [tab, setTab] = useStore<string>('tab', 'board');
  // Isolink draws the database's name big, with the count under it.
  const bigTitle = has('screen.title');
  const [folder, setFolder] = useLocal<string | null>(null);
  const [tag, setTag] = useLocal<string | null>(null);
  const [searching, setSearching] = useLocal<boolean>(false);
  const [search, setSearch] = useLocal<string>('');
  const q = search.trim().toLowerCase();
  const notes = all.filter((r) => !isItem(r));
  const inFolder = notes.filter((r) => !folder || r.folder === folder);
  // On the board, its stickers and cards too.
  const onBoard = (pins() ? all : notes).filter((r) => !folder || r.folder === folder);
  const [placing, setPlacing] = useLocal<string | null>(null);
  /** Something new on the board: a note, a sticker, a person or a chat. */
  const addTo = async () => {
    if (!pins()) return inPlace ? w.create(folder) : n.create(folder);
    const k = await n.dialog.menu([
      { id: 'note', icon: 'sticky_note_2', label: t('Note') },
      { id: 'sticker', icon: 'add_reaction', label: t('Sticker') },
      { id: 'person', icon: 'contact_page', label: t('Contact') },
      { id: 'chat', icon: 'forum', label: t('Chat') },
    ]);
    if (k === 'note') return inPlace ? w.create(folder) : n.create(folder);
    let ref: Ref | null = null;
    if (k === 'sticker') {
      const emoji = await n.dialog.sticker();
      ref = emoji ? { emoji } : null;
    }
    if (k === 'person') ref = await n.dialog.person();
    if (k === 'chat') ref = await n.dialog.chat();
    if (!k || !ref) return;
    const id = n.add('notes', {
      kind: k,
      ref,
      title: k === 'person' ? ref.name : k === 'chat' ? ref.title : undefined,
      folder: folder ?? undefined,
      tilt: Math.round((Math.random() * 6 - 3) * 10) / 10,
    });
    setPlacing(id);
  };
  const shown = order(inFolder).filter(
    (r) =>
      (!tag || (r.tags ?? []).includes(tag)) &&
      (!q || `${r.title ?? ''}\n${r.body ?? ''}\n${(r.tags ?? []).join(' ')}`.toLowerCase().includes(q)),
  );
  const open = (r: Note) => nav.push('Note', { id: r.id });
  // On the board a note is written on where it is, on Isolinks that can.
  const inPlace = has('corkboard.editing') && canEdit;
  const w = useInPlace(all);
  const phone = useLayout().width < 600;
  const writing = inPlace && tab === 'board' && w.row ? w.row : null;
  const tools = writing ? (
    <Glass padding={1}>
      <NoteTools row={writing} editor="board-note" mode={w.mode} setMode={w.setMode} />
    </Glass>
  ) : undefined;
  const pickTag = async (r: Note) => {
    const picked = await n.dialog.menu([
      ...tagNames.map((g) => ({ id: g, icon: (r.tags ?? []).includes(g) ? 'check' : 'sell', label: g })),
      ...(tagNames.length ? [{ divider: true }] : []),
      { id: '+', icon: 'add', label: t('New tag') },
    ]);
    if (!picked) return;
    const g = picked === '+'
      ? ((await n.dialog.prompt({ title: t('New tag'), placeholder: t('Name') })) ?? '').trim()
      : picked;
    if (!g) return;
    const now = r.tags ?? [];
    edit('notes', r.id, { tags: now.includes(g) ? now.filter((x) => x !== g) : [...now, g] });
  };
  const under = writing ? (
    <Glass padding={1}>
      <Row gap={1} align="center">
        {COLORS.map(([c, hex]) => (
          <Pressable key={c} class={[s.dot, colorOf(writing) === c && s.on]} style={{ background: hex }}
                     onPress={() => edit('notes', writing.id, { color: c })} />
        ))}
        <IconButton icon="sell" label={(writing.tags ?? []).length ? (writing.tags ?? []).join(', ') : t('Tags')}
                    onPress={() => pickTag(writing)} />
        <Button label={t('Done')} onPress={w.finish} />
      </Row>
    </Glass>
  ) : undefined;
  const board = (r: Note) =>
    writing && r.id === writing.id ? (
      <StickyNote key={r.id} id={r.id} x={r.x} y={r.y} color={colorOf(r)} tilt={0} sketch={r.sketch} size={sizeOf(r)}
                  pin={r.pin} stickers={pins() ? r.stickers : undefined} sketching={w.mode === 'sketch'}
                  onSketch={(f: unknown) => { edit('notes', r.id, { sketch: f }); w.setMode(null); }}>
        {(r.title ?? '').trim() ? <Text class={s.title}>{r.title}</Text> : null}
        <Editor id="board-note" rich plain value={w.body} onChange={w.type} autofocus={w.mode === null}
                placeholder={t('New note')} />
        <NoteMedia row={r} mode={w.mode} setMode={w.setMode} />
      </StickyNote>
    ) : (
      <Paper key={r.id} r={r} tilt={tiltOf(r)} onPress={() => (inPlace ? w.start(r.id) : open(r))} onTick={tick(r)} />
    );
  const tick = (r: Note) => (canEdit ? (body: string) => edit('notes', r.id, { body }) : undefined);

  /** Dropped on another note in the grid: it takes that one's place. */
  const move = (id: string, to: number) => {
    const list = shown.filter((r) => r.id !== id);
    const moving = shown.find((r) => r.id === id);
    if (!moving) return;
    const at = Math.min(to, list.length);
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

  // A tag's menu: rename it, or take it off every note.
  // A note dropped on a folder's tab: into that folder ('' is All: out of any).
  const into = (f: string, id: string) => edit('notes', id, { folder: f || null });
  const holdTag = async (g: string) => {
    const picked = await n.dialog.menu([
      { id: 'rename', icon: 'edit', label: t('Rename') },
      { divider: true },
      { id: 'delete', icon: 'delete', label: t('Delete'), danger: true },
    ]);
    const tagged = all.filter((r) => (r.tags ?? []).includes(g));
    if (picked === 'rename') {
      const name = ((await n.dialog.prompt({ title: t('Rename'), placeholder: t('Name'), value: g })) ?? '').trim();
      if (!name || name === g) return;
      for (const r of tagged) edit('notes', r.id, { tags: [...new Set((r.tags ?? []).map((x) => (x === g ? name : x)))] });
      if (tag === g) setTag(name);
    }
    if (picked === 'delete') {
      for (const r of tagged) edit('notes', r.id, { tags: (r.tags ?? []).filter((x) => x !== g) });
      if (tag === g) setTag(null);
    }
  };

  const tags = new Map<string, number>();
  for (const r of notes) for (const g of r.tags ?? []) tags.set(g, (tags.get(g) ?? 0) + 1);
  const tagNames = [...tags.keys()].sort((a, b) => a.localeCompare(b));

  const adder = useAddBar({
    placeholder: t('New note'),
    time: true,
    pick: {
      icon: 'sell',
      label: t('Tag'),
      options: tagNames.map((g) => ({ id: g, label: g, icon: 'sell' })),
      onNew: async () => ((await n.dialog.prompt({ title: t('New tag'), placeholder: t('Name') })) ?? '').trim() || null,
    },
    sources: ['link', 'photo'],
    onAdd: (said) => {
      const noteTags = [...new Set([said.pick, said.tag].filter(Boolean) as string[])];
      n.add('notes', {
        body: said.text,
        kind: said.photo ? 'photo' : 'note',
        photo: said.photo,
        folder: folder ?? undefined,
        tags: noteTags.length ? noteTags : undefined,
        color: COLORS[all.length % 6][0],
        due: said.day ? at(said.day, said.time ?? '09:00') : undefined,
        link: said.link,
      });
    },
  });

  const links: [string, string][] = [];
  for (const r of onBoard) for (const l of r.links ?? []) if (onBoard.some((o) => o.id === l)) links.push([r.id, l]);

  const noteCount = inFolder.length === 1 ? t('1 note') : t('{p0} notes', { p0: inFolder.length });
  const tagCount = tags.size === 0 ? undefined : tags.size === 1 ? t('1 tag') : t('{p0} tags', { p0: tags.size });
  return (
    <Screen
      title={t('Notes')}
      subtitle={tab === 'notes' ? noteCount : tab === 'tags' ? tagCount : undefined}
      immersive={tab === 'board'}
      tabs={[
        { value: 'board', label: t('Board'), icon: 'space_dashboard' },
        { value: 'notes', label: t('Notes'), icon: 'sticky_note_2' },
        { value: 'tags', label: t('Tags'), icon: 'sell' },
      ]}
      tab={tab}
      onTab={setTab}
      actions={
        tab === 'notes' ? (
          <IconButton icon="search" label={t('Search')} onPress={() => { setSearching(!searching); setSearch(''); }} />
        ) : undefined
      }
      fab={canEdit && tab === 'board' && !writing
        ? <Fab icon="add" onPress={addTo} />
        : undefined}
      footer={canEdit && tab === 'notes' ? adder.bar : writing && phone ? tools : undefined}
      onBack={writing && has('screen.onBack') ? w.finish : undefined}
    >
      {tab === 'board' && (
        <>
          <Folders folders={folders} folder={folder} setFolder={setFolder} canEdit={canEdit} newFolder={n.newFolder} onHold={n.holdFolder} onDrop={into} />
          {/* Empty, it's still the board: the folders stay where they are. */}
          <Corkboard
            width={1000}
            item={190}
            links={links}
            onMove={canEdit ? (id: string, x: number, y: number) => edit('notes', id, { x, y }) : undefined}
            onHold={n.hold}
            onResize={canEdit ? (id: string, w: number, h: number) => edit('notes', id, { w, h }) : undefined}
            editing={writing ? writing.id : undefined}
            placing={placing ?? undefined}
            onPin={canEdit ? (id: string, pin: string) => edit('notes', id, { pin }) : undefined}
            onTie={canEdit ? n.tie : undefined}
            onCut={canEdit ? n.cut : undefined}
            onDrop={canEdit ? n.drop : undefined}
            onDone={inPlace ? w.finish : undefined}
            tools={phone ? undefined : tools}
            under={under}
          >
            {onBoard.map((r) => (isItem(r) ? <Item key={r.id} r={r} tilt={tiltOf(r)} /> : board(r)))}
          </Corkboard>
        </>
      )}
      {tab === 'notes' && (
        <Box class={s.center}>
          <Box class={s.column}>
            {!bigTitle && <Hero big={t('Notes')} line={noteCount} />}
            {searching && <SearchField value={search} onChange={setSearch} placeholder={t('Search')} />}
            <Folders folders={folders} folder={folder} setFolder={setFolder} canEdit={canEdit} newFolder={n.newFolder} onHold={n.holdFolder} onDrop={into} />
            {tag && (
              <Box class={s.chips}>
                <Chip icon="close" selected onPress={() => setTag(null)}>{`# ${tag}`}</Chip>
              </Box>
            )}
            {shown.length === 0 ? (
              <Empty />
            ) : (
              <Masonry min={200} gap={16} onReorder={canEdit ? move : undefined} onHold={n.hold}>
                {shown.map((r, i) => (
                  <Paper key={r.id} r={r} tilt={TILTS[i % TILTS.length]} onPress={() => open(r)} onTick={tick(r)} />
                ))}
              </Masonry>
            )}
          </Box>
        </Box>
      )}
      {tab === 'tags' && (
        <Box class={s.center}>
          <Box class={s.column}>
            {!bigTitle && <Hero big={t('Tags')} line={tagCount} />}
            {tags.size === 0 ? (
              <Empty emoji="🏷️" words={t('No tags yet')} />
            ) : (
              <Grid min={200} gap={12}>
                {[...tags.entries()].sort((a, b) => b[1] - a[1]).map(([g, count]) => (
                  <Pressable key={g} class={s.tagCard} onPress={() => { setTag(g); setTab('notes'); }}
                             onLongPress={canEdit ? () => holdTag(g) : undefined}>
                    <Box class={s.tagArt} style={{ background: `${hueOfTag(g)}2e` }}>
                      <Icon name="sell" size={18} />
                    </Box>
                    <Stack grow gap="2px">
                      <Text class={s.tagName} lines={1}>{g}</Text>
                      <Text class={s.small}>{count === 1 ? t('1 note') : t('{p0} notes', { p0: count })}</Text>
                    </Stack>
                  </Pressable>
                ))}
              </Grid>
            )}
          </Box>
        </Box>
      )}
      {tab === 'notes' && adder.sheet}
    </Screen>
  );
}

/** One note, written on as it reads: formatting as you type, and a photo,
 *  a voice clip and a sketch on the paper itself. Saves as you go; two
 *  devices editing apart merge by paragraph. */
function NoteScreen() {
  const nav = useNav();
  const { id, fresh } = nav.params as { id: string; fresh?: boolean };
  const row = useRecord('notes', id) as Note | null;
  const all = useQuery('notes', { limit: 500 }) as Note[];
  const { edit, remove } = useData();
  const me = useMe();
  const dialog = useDialog();
  const wide = useLayout().width >= 760;
  const kind = row?.kind ?? 'note';
  // Drawing on the note, or recording onto it.
  const [mode, setMode] = useLocal<string | null>(fresh && (kind === 'sketch' || kind === 'voice') ? kind : null);
  const [draft, setDraft] = useLocal<string | null>(null);
  const saved = useRef({ text: row?.body ?? '', turn: 0 });

  const body = draft ?? row?.body ?? '';
  const canEdit = me.role !== 'view' && !(me.role === 'add' && row?._by !== me.id);

  const flush = (text: string) => {
    if (text === saved.current.text) return;
    saved.current.text = text;
    edit('notes', id, { body: text });
  };
  // Leaving keeps what was typed; a new note left with nothing in it goes.
  const latest = useRef({ body, row });
  latest.current = { body, row };
  useEffect(() => () => {
    if (!canEdit) return;
    const r = latest.current.row;
    if (fresh && blankNote(latest.current.body, r)) remove('notes', id);
    else flush(latest.current.body);
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
      <IconButton icon="delete" label={t('Delete')}
                  onPress={async () => {
                    const ok = await dialog.confirm({
                      title: t('Delete this note?'),
                      body: t('It goes for everyone in this database.'),
                      ok: t('Delete'),
                      danger: true,
                    });
                    if (!ok) return;
                    saved.current.text = latest.current.body;
                    remove('notes', id);
                    nav.pop();
                  }} />
    </Row>
  ) : undefined;
  const strung = all.filter((o) => (row.links ?? []).includes(o.id) || (o.links ?? []).includes(id));

  const bar = canEdit ? <NoteTools row={row} editor="note" mode={mode} setMode={setMode} /> : undefined;

  const note = (
    <StickyNote color={colorOf(row)} sketch={row.sketch} sketching={mode === 'sketch'} size={sizeOf(row)}
                stickers={pins() ? row.stickers : undefined}
                onSketch={(f: unknown) => { edit('notes', id, { sketch: f }); setMode(null); }}>
      {canEdit ? (
        <Editor id="note" rich plain value={body} onChange={type} autofocus={!!fresh && mode === null}
                placeholder={t('New note')} />
      ) : body.trim() ? (
        <Markdown>{body}</Markdown>
      ) : !row.photo && !row.voice && !row.sketch ? (
        <Text>{t('Empty note')}</Text>
      ) : null}
      <NoteMedia row={row} mode={mode} setMode={setMode} />
    </StickyNote>
  );

  return (
    <Screen title={noteTitle({ ...row, body })} actions={actions} footer={wide ? undefined : bar}>
      {/* Wide: the note, and beside it its colour and tags. Narrow: one under the other. */}
      <Split first={0.62} gap={24}>
      <Box>
        {wide && bar ? <Box class={s.bar}>{bar}</Box> : null}
        {note}
      </Box>
      <Box class={s.panel}>
      {canEdit && (
        <Box class={s.swatches}>
          {COLORS.map(([c, hex]) => (
            <Pressable key={c} class={[s.swatch, colorOf(row) === c && s.on]} style={{ background: hex }}
                       onPress={() => edit('notes', id, { color: c })} />
          ))}
        </Box>
      )}
      <Box class={s.block}>
        <TagInput value={row.tags ?? []} placeholder={t('Tags')}
                  onChange={canEdit ? (tags: string[]) => edit('notes', id, { tags }) : undefined} />
      </Box>
      {strung.length > 0 && (
        <Box class={s.card}>
          {strung.map((o) => (
            <ListItem key={o.id} title={noteTitle(o)} leading={<Icon name="linear_scale" />}
                      onPress={() => nav.push('Note', { id: o.id })} />
          ))}
        </Box>
      )}
      </Box>
      </Split>
    </Screen>
  );
}

export default defineApp({
  screens: { Home, Note: NoteScreen },
  // On a computer a note opens beside the list (not the board, which keeps the
  // window). A function, so Isolinks before 0.26.53 don't split at all.
  split: () => ['Home'],
  actions: {
    add: {
      title: 'Add a note',
      params: {
        text: { type: 'string', title: 'What it says (Markdown; - [ ] for a list)' },
        title: { type: 'string', optional: true },
        color: { type: 'string', optional: true, options: COLORS.map(([c]) => c) },
      },
      run: ({ text, title, color }: { text: string; title?: string; color?: string }, { data }: any) => {
        const id = data.add('notes', {
          title: title || undefined,
          body: String(text ?? ''),
          kind: /^\s*- \[[ xX]\]/m.test(String(text ?? '')) ? 'list' : 'note',
          color: color && COLORS.some(([c]) => c === color) ? color : undefined,
        });
        return { id };
      },
    },
    tick: {
      title: 'Tick or untick an item on a list note',
      params: { note: { type: 'string', title: "The note's title" }, item: 'string' },
      run: ({ note, item }: { note: string; item: string }, { data }: any) => {
        const all = data.query('notes', { limit: 500 }) as Note[];
        const r = all.find((x) => noteTitle(x).toLowerCase() === String(note).toLowerCase());
        if (!r) throw new Error(`No note called ${note}`);
        const want = String(item).toLowerCase();
        let found = false;
        const body = (r.body ?? '').replace(/^(\s*[-*+]\s+)\[([ xX])\]\s*(.*)$/gm, (all, lead, box, words) => {
          if (found || !words.toLowerCase().includes(want)) return all;
          found = true;
          return `${lead}[${box === ' ' ? 'x' : ' '}] ${words}`;
        });
        if (!found) throw new Error(`No ${item} on ${note}`);
        data.edit('notes', r.id, { body });
        return { ok: true };
      },
    },
  },
});
