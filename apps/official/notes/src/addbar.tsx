// The add bar along the bottom of Shopping, Todo and Notes (keep the copies the same).
// It reads when, how many, a #tag and a link out of what's typed, and offers a
// date, the app's own pick (an aisle, a project, a tag) and a source.
import {
  Box, Row, Stack, Scroll, Text, TextField, Icon, Menu, Sheet, Calendar, Chip, TimePicker, Upload,
  Button, IconButton, Glass, Composer, Divider, useLocal, useDialog, useNow, usePlatform, has, t,
} from 'isolink';
import a from './addbar.css';
import { read, dayFrom, nextWeekday, dayWords, siteOf, Said } from './smart';

export type Added = Said & { file?: unknown; photo?: unknown; pick?: string; title?: string };
type Option = { id: string; label: string; icon?: string };
type Source = 'link' | 'file' | 'photo';

export type AddBarOptions = {
  placeholder: string;
  onAdd: (added: Added) => void;
  /** "2 milk" and "milk x2" are amounts. */
  qty?: boolean;
  /** Offer times as well as days. */
  time?: boolean;
  /** The app's own pick, such as an aisle: what it's called, and what's picked when nothing is. */
  pick?: { icon: string; label: string; options: Option[]; guess?: (said: Said) => string | undefined; onNew?: () => Promise<string | null> };
  sources?: Source[];
  /** A title over what's typed, once the bar's clicked; + adds even with nothing typed (a note). */
  titled?: boolean;
};

const TIMES = ['09:00', '12:00', '17:30', '20:00'];
const PHOTOS = 'jpg,jpeg,png,heic,webp,gif';

/** At most [n] characters, for a token. */
const short = (words: string, n = 24) => (words.length > n ? `${words.slice(0, n - 1).trimEnd()}…` : words);

const nameOf = (file: unknown) => {
  const f = file as { name?: string } | null;
  return f?.name ? String(f.name) : t('File');
};

/** The bar, for a Screen's `footer`, and its sheet, for the Screen's children. */
export function useAddBar(o: AddBarOptions) {
  const now = useNow(60000);
  // As the chat's message box: thumb-sized on a phone, a size smaller with a mouse.
  const desk = !!usePlatform().desktop;
  const h = desk ? 40 : 48;
  const dialog = useDialog();
  const [draft, setDraft] = useLocal<string>('');
  const [day, setDay] = useLocal<string | null>(null);
  const [time, setTime] = useLocal<string | null>(null);
  const [pick, setPick] = useLocal<string | null>(null);
  const [link, setLink] = useLocal<string | null>(null);
  const [file, setFile] = useLocal<unknown>(null);
  const [photo, setPhoto] = useLocal<unknown>(null);
  const [sheet, setSheet] = useLocal<'date' | 'file' | 'photo' | null>(null);
  // Cleared: what was typed for a date stays as words.
  const [plain, setPlain] = useLocal<boolean>(false);
  const [title, setTitle] = useLocal<string>('');
  const [open, setOpen] = useLocal<boolean>(false);
  // A title over the words, on Isolinks whose message box can have one.
  const titled = !!o.titled && has('composer.top');

  const said = read(draft, now, !!o.qty, !!o.time, !plain);
  const whenDay = day ?? said.day ?? null;
  const whenTime = o.time ? time ?? said.time ?? null : null;
  const picked = pick ?? (said.tag && o.pick?.options.find((x) => x.label.toLowerCase() === said.tag!.toLowerCase())?.id) ?? (said.text ? o.pick?.guess?.(said) : undefined) ?? null;
  const pickLabel = picked ? o.pick?.options.find((x) => x.id === picked)?.label ?? picked : undefined;
  const linkNow = link ?? said.link ?? null;
  const ready = titled || !!said.text;

  const reset = () => {
    setDraft('');
    setDay(null);
    setTime(null);
    setPick(null);
    setLink(null);
    setFile(null);
    setPhoto(null);
    setPlain(false);
    setTitle('');
    setOpen(false);
  };
  const submit = () => {
    if (!ready) return;
    o.onAdd({
      ...said,
      day: whenDay ?? (whenTime ? dayFrom(now, 0) : undefined),
      time: whenTime ?? undefined,
      // A tag that named the pick isn't a tag as well.
      tag: said.tag && pickLabel && said.tag.toLowerCase() === pickLabel.toLowerCase() ? undefined : said.tag,
      link: linkNow ?? undefined,
      pick: picked ?? undefined,
      file: file ?? undefined,
      photo: photo ?? undefined,
      title: title.trim() || undefined,
    });
    reset();
  };

  const dated = !!(whenDay || whenTime);
  const dateWords = dated ? [whenDay ? dayWords(whenDay, now) : t('Today'), whenTime].filter(Boolean).join(' ') : t('Date');
  const onDate = (id: string) => {
    if (id === 'today') setDay(dayFrom(now, 0));
    if (id === 'tomorrow') setDay(dayFrom(now, 1));
    if (id === 'weekend') setDay(new Date(now).getDay() === 6 ? dayFrom(now, 0) : nextWeekday(now, 6));
    if (id === 'next') setDay(nextWeekday(now, 1));
    if (id === 'pick') setSheet('date');
    if (id === 'clear') {
      setDay(null);
      setTime(null);
      setPlain(true);
    }
  };

  const sources = o.sources ?? [];
  const sourced = linkNow ? siteOf(linkNow) : photo ? t('Photo') : file ? nameOf(file) : null;
  const onSource = async (id: string) => {
    if (id === 'link') {
      const typed = ((await dialog.prompt({ title: t('Link'), placeholder: 'https://', value: linkNow ?? '' })) ?? '').trim();
      if (typed) setLink(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`);
    }
    if (id === 'file') setSheet('file');
    if (id === 'photo') setSheet('photo');
    if (id === 'remove') {
      setLink(null);
      setFile(null);
      setPhoto(null);
      if (said.link) setDraft(draft.replace(said.link, '').replace(/\s+/g, ' ').trim());
    }
  };

  // Only an icon until it's set; then what it's set to, beside it.
  // In the chat's message box (Isolink 0.26.52 on), the same size as its attach and camera.
  const composer = has('composer');
  const glyph = composer ? (desk ? 20 : 24) : desk ? 17 : 20;
  // On a phone, set is only the icon on the accent: its words would push the rest off the bar.
  const token = (on: boolean, icon: string, words: string) => (
    <Box class={on && desk ? [a.abToken, a.abOn] : on ? [a.abToken, a.abIcon, a.abOn] : [a.abToken, desk ? a.abIconD : a.abIcon]}>
      <Icon name={icon} size={on && desk ? 17 : glyph} tone={on ? 'accent' : 'muted'} />
      {on && desk && <Text class={a.abTokenOnText} lines={1}>{short(words)}</Text>}
    </Box>
  );

  const menus = (
    <Row gap={composer ? 0 : 1} align="center">
      <Menu
        items={[
          { id: 'today', label: t('Today'), icon: 'event' },
          { id: 'tomorrow', label: t('Tomorrow'), icon: 'wb_sunny' },
          { id: 'weekend', label: t('Weekend'), icon: 'beach_access' },
          { id: 'next', label: t('Next week'), icon: 'arrow_forward' },
          { divider: true },
          { id: 'pick', label: o.time ? t('Date and time') : t('Pick a date'), icon: 'calendar_month' },
          ...(dated ? [{ id: 'clear', label: t('Clear'), icon: 'close' }] : []),
        ]}
        onPick={onDate}
      >
        {token(dated, 'event', dateWords)}
      </Menu>
      {o.pick && (
        <Menu
          items={[
            ...o.pick.options.map((x) => ({ id: x.id, label: x.label, icon: x.icon, checked: x.id === picked })),
            ...(o.pick.onNew ? [{ divider: true }, { id: '+new', label: t('New'), icon: 'add' }] : []),
            ...(picked ? [{ id: '', label: t('None'), icon: 'close' }] : []),
          ]}
          onPick={async (id: string) => {
            if (id === '+new') {
              const made = await o.pick!.onNew!();
              if (made) setPick(made);
              return;
            }
            setPick(id || null);
          }}
        >
          {token(!!picked, o.pick.icon, pickLabel ?? o.pick.label)}
        </Menu>
      )}
      {sources.length > 0 && (
        <Menu
          items={[
            ...(sources.includes('link') ? [{ id: 'link', label: t('Link'), icon: 'link' }] : []),
            ...(sources.includes('file') ? [{ id: 'file', label: t('File'), icon: 'attach_file' }] : []),
            ...(sources.includes('photo') ? [{ id: 'photo', label: t('Photo'), icon: 'image' }] : []),
            ...(sourced ? [{ divider: true }, { id: 'remove', label: t('Remove'), icon: 'close' }] : []),
          ]}
          onPick={onSource}
        >
          {token(!!sourced, linkNow ? 'link' : photo ? 'image' : 'attach_file', sourced ?? t('Source'))}
        </Menu>
      )}
      {said.qty && token(true, 'tag', `× ${said.qty}`)}
      {said.tag && said.tag.toLowerCase() !== (pickLabel ?? '').toLowerCase() && token(true, 'sell', `# ${said.tag}`)}
    </Row>
  );

  // The chat's own message box: what's typed, then a date, the app's pick
  // and a source, then send on a round of the accent to add it.
  const bar = titled ? (
    // Clicked, it opens: Title, with the cursor in it, a line, then the words.
    <Composer value={draft} onChange={setDraft} onSubmit={submit} placeholder={open ? t('Body') : o.placeholder}
              sendLabel={t('Add')} sendIcon="add" ready multiline={open}
              onFocus={() => setOpen(true)}
              onBlur={() => { if (!draft.trim() && !title.trim()) setOpen(false); }}
              top={open ? (
                <Stack gap={6} class={a.abTop}>
                  <Box class={a.abTitle}><TextField plain autofocus value={title} onChange={setTitle} placeholder={t('Title')} /></Box>
                  <Divider />
                </Stack>
              ) : undefined}>
      <Box class={desk ? a.abMenusD : a.abMenusC}>
        <Scroll direction="horizontal">{menus}</Scroll>
      </Box>
    </Composer>
  ) : composer ? (
    <Composer value={draft} onChange={setDraft} onSubmit={submit} placeholder={o.placeholder} sendLabel={t('Add')} ready={ready}>
      <Box class={desk ? a.abMenusD : a.abMenusC}>
        <Scroll direction="horizontal">{menus}</Scroll>
      </Box>
    </Composer>
  ) : (
    <Box class={a.abWrap}>
      <Box class={a.abBar}>
        <Glass radius={h / 2} padding={0}>
          <Row gap={1} align="center" class={desk ? a.abLineD : a.abLine}>
            <Stack grow>
              {/* Older Isolink makes a plain field multiline, so Enter wouldn't add. */}
              <TextField plain={has('field.submit')} value={draft} onChange={setDraft} placeholder={o.placeholder} onSubmit={submit} />
            </Stack>
            {/* As many as fit: the rest scroll. */}
            <Box class={a.abMenus}>
              <Scroll direction="horizontal">{menus}</Scroll>
            </Box>
            <IconButton icon="add" label={t('Add')} variant="filled" size={desk ? 34 : 40} onPress={submit} />
          </Row>
        </Glass>
      </Box>
    </Box>
  );

  const sheetView = (
    <Sheet open={!!sheet} onClose={() => setSheet(null)} detents={['medium', 'large']}>
      {sheet === 'date' && (
        <Stack gap={16}>
          <Text class={a.abSheetTitle}>{whenDay ? dayWords(whenDay, now) : t('Pick a date')}</Text>
          <Calendar month={whenDay ?? undefined} onPick={(d: string) => setDay(d)} />
          {o.time && (
            <Row gap={8} align="center" wrap>
              {TIMES.map((x) => (
                <Chip key={x} label={x} selected={whenTime === x} onPress={() => { setTime(x); if (!whenDay) setDay(dayFrom(now, 0)); }} />
              ))}
              <TimePicker value={whenTime && !TIMES.includes(whenTime) ? whenTime : undefined} placeholder={t('Other')}
                          onChange={(x: string) => { setTime(x); if (!whenDay) setDay(dayFrom(now, 0)); }} />
            </Row>
          )}
          <Row justify="end"><Button onPress={() => setSheet(null)}>{t('Done')}</Button></Row>
        </Stack>
      )}
      {(sheet === 'file' || sheet === 'photo') && (
        <Stack gap={16}>
          <Text class={a.abSheetTitle}>{sheet === 'photo' ? t('Photo') : t('File')}</Text>
          <Upload label={sheet === 'photo' ? t('Add a photo') : t('Add a file')} accept={sheet === 'photo' ? PHOTOS : undefined}
                  onUpload={(f: unknown) => {
                    if (sheet === 'photo') { setPhoto(f); setFile(null); } else { setFile(f); setPhoto(null); }
                    setLink(null);
                    setSheet(null);
                  }} />
        </Stack>
      )}
    </Sheet>
  );

  return { bar, sheet: sheetView, draft, clear: reset };
}
