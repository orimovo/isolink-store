import {
  defineApp, Screen, Stack, Row, Box, Pressable, Text, TextField, SearchField, Select, Button, IconButton, Icon, Fab, Grid,
  Chip, Filter, Image, Upload, Editor, Markdown, Checkbox, Stepper, TagInput, Timer, Segmented, Badge,
  useQuery, useData, useLocal, useStore, useMe, useNav, useNow, useDialog, useShare, useToast, useKeys, fetch, t,
} from 'isolink';
import s from './app.css';
import { between, last } from './pos';
import { linesOf, minutesIn, scaled } from './scale';
import { readRecipe } from './import';

type Recipe = {
  id: string; name: string; course?: string; minutes?: number; serves?: number; tags?: string[]; method?: string;
  link?: string; emoji?: string; photo?: unknown; ingredients?: string; fave?: boolean; cooked?: string; times?: number;
};
type Plan = { id: string; day: string; recipe: string; pos?: string };

const COURSES: [string, string][] = [['breakfast', /*t*/'Breakfast'], ['main', /*t*/'Main'], ['side', /*t*/'Side'], ['sweet', /*t*/'Sweet']];
const EMOJIS = ['🍝', '🍛', '🥘', '🍲', '🥗', '🍕', '🌮', '🍜', '🍳', '🥞', '🍰', '🍪', '🥧', '🍔', '🐟', '🍗', '🥦', '🍞'];
const WEEKDAYS = [/*t*/'Sunday', /*t*/'Monday', /*t*/'Tuesday', /*t*/'Wednesday', /*t*/'Thursday', /*t*/'Friday', /*t*/'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const emojiOf = (r: Recipe) => r.emoji || EMOJIS[(r.name.length + (r.course ?? '').length) % EMOJIS.length];

function useRecipes() {
  const recipes = (useQuery('recipes', { limit: 500 }) as Recipe[]).sort((a, b) => a.name.localeCompare(b.name));
  const plans = useQuery('plans', { limit: 500 }) as Plan[];
  const data = useData();
  const me = useMe();
  return { recipes, plans, ...data, canEdit: me.role !== 'view' };
}

/** "45 min", "1 h 30". */
const timeText = (m?: number) => (!m ? '' : m < 60 ? t('{p0} min', { p0: m }) : m % 60 ? t('{p0} h {p1}', { p0: Math.floor(m / 60), p1: m % 60 }) : t('{p0} h', { p0: m / 60 }));

function Card({ r, onPress, onHold }: { r: Recipe; onPress: () => void; onHold?: () => void }) {
  return (
    <Pressable class={s.card} onPress={onPress} onLongPress={onHold}>
      {r.photo ? <Image src={r.photo} ratio={4 / 3} class={s.cardPhoto} /> : (
        <Box class={s.cardArt}><Text class={s.cardEmoji}>{emojiOf(r)}</Text></Box>
      )}
      <Stack class={s.cardBody} gap={2}>
        <Text bold lines={2}>{r.name}</Text>
        <Row gap={6} align="center">
          {r.minutes ? <Text class={s.sub}>{timeText(r.minutes)}</Text> : null}
          {r.fave ? <Icon name="favorite" size={14} tone="danger" /> : null}
        </Row>
      </Stack>
    </Pressable>
  );
}

function RecipesTab({ rc }: { rc: ReturnType<typeof useRecipes> }) {
  const nav = useNav();
  const dialog = useDialog();
  // Held on a phone, right-clicked on a computer.
  const hold = async (r: Recipe) => {
    const picked = await dialog.menu([
      { id: 'fave', icon: 'favorite', label: r.fave ? t('Unfavourite') : t('Favourite') },
      { id: 'edit', icon: 'edit', label: t('Edit') },
      { divider: true },
      { id: 'delete', icon: 'delete', label: t('Delete'), danger: true },
    ]);
    if (picked === 'fave') rc.edit('recipes', r.id, { fave: !r.fave });
    if (picked === 'edit') nav.push('Edit', { id: r.id });
    if (picked === 'delete') {
      if (!(await dialog.confirm({ title: t('Delete this recipe?'), ok: t('Delete'), danger: true }))) return;
      for (const p of rc.plans.filter((p) => p.recipe === r.id)) rc.remove('plans', p.id);
      rc.remove('recipes', r.id);
    }
  };
  const [q, setQ] = useLocal('');
  const [course, setCourse] = useStore<string>('course', '');
  const [quick, setQuick] = useLocal(false);
  const [faves, setFaves] = useLocal(false);
  const want = q.trim().toLowerCase();
  const shown = rc.recipes.filter(
    (r) =>
      (!course || r.course === course) &&
      (!faves || r.fave) &&
      (!quick || (r.minutes ?? 999) <= 30) &&
      (!want || [r.name, r.ingredients ?? '', ...(r.tags ?? [])].some((x) => x.toLowerCase().includes(want))),
  );
  if (rc.recipes.length === 0) {
    return (
      <Stack align="center" gap={10} class={s.empty}>
        <Text class={s.bigEmoji}>🍲</Text>
        <Text tone="muted">{t('No recipes yet')}</Text>
      </Stack>
    );
  }
  return (
    <>
      <SearchField value={q} placeholder={t('Search')} onChange={setQ} />
      <Row gap={6} class={s.chips} wrap>
        <Chip label={t('Favourites')} icon="favorite" selected={faves} onPress={() => setFaves(!faves)} />
        <Chip label={t('Quick')} icon="bolt" selected={quick} onPress={() => setQuick(!quick)} />
      </Row>
      <Filter value={course} onChange={setCourse}
        options={[{ value: '', label: t('All') }, ...COURSES.map(([value, label]) => ({ value, label: t(label) }))]} />
      {shown.length === 0 ? <Text tone="muted" align="center" class={s.empty}>{t('Nothing here')}</Text> : (
        <Grid min={150} gap={10}>
          {shown.map((r) => <Card key={r.id} r={r} onPress={() => nav.push('Recipe', { id: r.id })} onHold={rc.canEdit ? () => hold(r) : undefined} />)}
        </Grid>
      )}
    </>
  );
}

/** The ingredients of [plans]' recipes, as lines for Shopping. */
const shoppingFor = (rc: ReturnType<typeof useRecipes>, plans: Plan[]) =>
  [...new Set(plans.flatMap((p) => linesOf(rc.recipes.find((r) => r.id === p.recipe)?.ingredients)))];

function PlanTab({ rc }: { rc: ReturnType<typeof useRecipes> }) {
  const nav = useNav();
  const dialog = useDialog();
  const share = useShare();
  const toast = useToast();
  const now = useNow(3600000);
  const [weeks, setWeeks] = useLocal(0);
  const start = addDays(weekOf(new Date(now)), weeks * 7);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
  const inWeek = rc.plans.filter((p) => p.day >= iso(days[0]) && p.day <= iso(days[6]));
  const pick = async (day: string) => {
    if (!rc.recipes.length) return;
    const id = await dialog.menu(rc.recipes.slice(0, 60).map((r) => ({ id: r.id, label: `${emojiOf(r)} ${r.name}` })));
    if (id) rc.add('plans', { day, recipe: id, pos: between(last(rc.plans.filter((p) => p.day === day)), '') });
  };
  const shop = async () => {
    const lines = shoppingFor(rc, inWeek);
    if (!lines.length) return;
    await share.share({ app: 'shopping', text: lines.join('\n') });
  };
  return (
    <>
      <Row align="center" class={s.weekBar}>
        <IconButton icon="chevron_left" label={t('Back')} onPress={() => setWeeks(weeks - 1)} />
        <Text bold grow align="center">
          {weeks === 0 ? t('This week') : weeks === 1 ? t('Next week') : `${days[0].getDate()}/${days[0].getMonth() + 1} – ${days[6].getDate()}/${days[6].getMonth() + 1}`}
        </Text>
        <IconButton icon="chevron_right" label={t('Next')} onPress={() => setWeeks(weeks + 1)} />
      </Row>
      <Stack gap={8}>
        {days.map((d) => {
          const k = iso(d);
          const meals = inWeek.filter((p) => p.day === k).sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? ''));
          const today = k === iso(new Date(now));
          return (
            <Box key={k} class={today ? [s.day, s.today] : s.day}>
              <Row align="center">
                <Text bold grow class={today ? s.dayOn : undefined}>{`${t(WEEKDAYS[d.getDay()])} ${d.getDate()}`}</Text>
                {rc.canEdit && <IconButton icon="add" label={t('Add')} onPress={() => pick(k)} />}
              </Row>
              {meals.map((p) => {
                const r = rc.recipes.find((x) => x.id === p.recipe);
                if (!r) return null;
                return (
                  <Row key={p.id} gap={10} align="center" class={s.meal}>
                    <Pressable onPress={() => nav.push('Recipe', { id: r.id })} class={s.mealTap}>
                      <Text class={s.mealEmoji}>{emojiOf(r)}</Text>
                      <Text grow>{r.name}</Text>
                    </Pressable>
                    {rc.canEdit && <IconButton icon="close" label={t('Remove')} onPress={() => rc.remove('plans', p.id)} />}
                  </Row>
                );
              })}
            </Box>
          );
        })}
      </Stack>
      {inWeek.length > 0 && (
        <Button expand icon="shopping_cart" onPress={() => shop().catch(() => toast(t('Shopping isn’t added')))}>{t('Add to Shopping')}</Button>
      )}
    </>
  );
}

function Home() {
  const rc = useRecipes();
  const nav = useNav();
  const dialog = useDialog();
  const [tab, setTab] = useStore<string>('tab', 'recipes');
  const add = async () => {
    const how = await dialog.menu([
      { id: 'new', label: t('New recipe'), icon: 'edit' },
      { id: 'link', label: t('From a link'), icon: 'link' },
    ]);
    if (how === 'new') nav.push('Edit', {});
    if (how === 'link') nav.push('Import', {});
  };
  useKeys(rc.canEdit ? { 'mod+n': { run: () => nav.push('Edit', {}), label: t('New recipe') } } : {});
  return (
    <Screen
      title={t('Recipes')}
      tabs={[
        { value: 'recipes', label: t('Recipes'), icon: 'menu_book' },
        { value: 'plan', label: t('Plan'), icon: 'calendar_month' },
      ]}
      tab={tab}
      onTab={setTab}
      fab={rc.canEdit && tab === 'recipes' ? <Fab icon="add" onPress={add} /> : undefined}
    >
      {tab === 'recipes' ? <RecipesTab rc={rc} /> : <PlanTab rc={rc} />}
    </Screen>
  );
}

function RecipeScreen() {
  const nav = useNav();
  const rc = useRecipes();
  const share = useShare();
  const toast = useToast();
  const { id } = nav.params as { id: string };
  const r = rc.recipes.find((x) => x.id === id);
  const [serves, setServes] = useLocal<number | null>(null);
  const [ticked, setTicked] = useLocal<number[]>([]);
  if (!r) return <Screen title={t('Recipes')} />;
  const base = r.serves ?? 2;
  const n = serves ?? base;
  const k = n / base;
  const lines = linesOf(r.ingredients).map((l) => scaled(l, k));
  const steps = linesOf(r.method);
  return (
    <Screen
      title={r.name}
      actions={
        <>
          <IconButton icon={r.fave ? 'favorite' : 'favorite_border'} label={t('Favourite')}
                      onPress={rc.canEdit ? () => rc.edit('recipes', r.id, { fave: !r.fave }) : undefined} />
          {rc.canEdit && <IconButton icon="edit" label={t('Edit')} onPress={() => nav.push('Edit', { id })} />}
        </>
      }
      footer={steps.length > 0 ? <Button expand icon="restaurant" onPress={() => nav.push('Cook', { id, serves: n })}>{t('Cook')}</Button> : undefined}
    >
      {r.photo ? <Image src={r.photo} ratio="16:9" class={s.hero} /> : (
        <Box class={s.heroArt}><Text class={s.heroEmoji}>{emojiOf(r)}</Text></Box>
      )}
      <Row gap={8} wrap class={s.facts}>
        {r.minutes ? <Badge label={timeText(r.minutes)} /> : null}
        {r.course ? <Badge label={t(COURSES.find(([c]) => c === r.course)?.[1] ?? '')} /> : null}
        {(r.tags ?? []).map((g) => <Badge key={g} label={g} tone="muted" />)}
        {r.times ? <Badge label={t('Made {p0}×', { p0: r.times })} /> : null}
      </Row>
      {lines.length > 0 && (
        <Box class={s.panel}>
          <Row align="center" class={s.panelHead}>
            <Text class={s.h} grow>{t('Ingredients')}</Text>
            <Text class={s.sub}>{t('Serves')}</Text>
            <Stepper value={n} min={1} max={50} onChange={setServes} />
          </Row>
          {lines.map((l, i) => (
            <Checkbox key={i} checked={ticked.includes(i)} label={l}
                      onChange={(on: boolean) => setTicked(on ? [...ticked, i] : ticked.filter((x) => x !== i))} />
          ))}
          <Button icon="shopping_cart" variant="tonal" onPress={async () => {
            try {
              await share.share({ app: 'shopping', text: lines.filter((_, i) => !ticked.includes(i)).join('\n') });
            } catch {
              toast(t('Shopping isn’t added'));
            }
          }}>{t('Add to Shopping')}</Button>
        </Box>
      )}
      {r.method ? (
        <Box class={s.panel}>
          <Text class={s.h}>{t('Method')}</Text>
          <Markdown>{r.method}</Markdown>
        </Box>
      ) : null}
      {r.link ? <Button variant="plain" icon="link" onPress={() => share.share(r.link)}>{t('Source')}</Button> : null}
    </Screen>
  );
}

/** One step at a time, big, with the screen kept on and a timer when a step says how long. */
function CookScreen() {
  const nav = useNav();
  const rc = useRecipes();
  const { id, serves } = nav.params as { id: string; serves?: number };
  const r = rc.recipes.find((x) => x.id === id);
  const [at, setAt] = useLocal(0);
  const [timing, setTiming] = useLocal<number | null>(null);
  if (!r) return <Screen title={t('Cook')} />;
  const steps = linesOf(r.method);
  const k = (serves ?? r.serves ?? 2) / (r.serves ?? 2);
  const step = steps[Math.min(at, steps.length - 1)] ?? '';
  const mins = minutesIn(step);
  const lastStep = at >= steps.length - 1;
  const done = () => {
    rc.edit('recipes', r.id, { times: (r.times ?? 0) + 1, cooked: iso(new Date()) });
    nav.pop();
  };
  return (
    <Screen
      title={t('Step {p0} of {p1}', { p0: at + 1, p1: steps.length })}
      awake
      footer={
        <Row gap={8}>
          <Button variant="tonal" disabled={at === 0} onPress={() => { setAt(at - 1); setTiming(null); }}>{t('Back')}</Button>
          <Stack grow />
          {lastStep ? <Button icon="check" onPress={done}>{t('Done')}</Button>
            : <Button icon="arrow_forward" onPress={() => { setAt(at + 1); setTiming(null); }}>{t('Next')}</Button>}
        </Row>
      }
    >
      <Row gap={4} class={s.dots}>
        {steps.map((_, i) => <Box key={i} class={i <= at ? [s.dot, s.dotOn] : s.dot} />)}
      </Row>
      <Text class={s.step}>{step}</Text>
      {mins ? (
        timing === at ? <Box class={s.panel}><Timer seconds={mins * 60} label={t('{p0} min', { p0: mins })} /></Box>
          : <Button icon="timer" variant="tonal" onPress={() => setTiming(at)}>{t('{p0} min', { p0: mins })}</Button>
      ) : null}
      {at === 0 && r.ingredients ? (
        <Box class={s.panel}>
          <Text class={s.h}>{t('Ingredients')}</Text>
          {linesOf(r.ingredients).map((l, i) => <Text key={i}>{`• ${scaled(l, k)}`}</Text>)}
        </Box>
      ) : null}
    </Screen>
  );
}

/** A recipe from a recipe site's link. */
function ImportScreen() {
  const nav = useNav();
  const rc = useRecipes();
  const [url, setUrl] = useLocal('');
  const [busy, setBusy] = useLocal(false);
  const [error, setError] = useLocal('');
  const go = async () => {
    let u = url.trim();
    if (!/^https?:\/\//.test(u)) u = `https://${u}`;
    u = u.replace(/^http:/, 'https:').replace(/^https:\/\/(?!www\.|cooking\.)([^/]+\.(?:com|co\.uk))\//, 'https://www.$1/');
    setBusy(true);
    setError('');
    try {
      const res = await fetch(u, { headers: { accept: 'text/html' } });
      const found = res.ok ? readRecipe(await res.text(), u) : null;
      if (!found) throw new Error('none');
      const id = rc.add('recipes', { ...found, course: 'main' });
      nav.pop();
      nav.push('Recipe', { id });
    } catch (e) {
      setError(String(e).includes('needs.web') ? t('That site isn’t supported yet') : t('No recipe found there'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title={t('From a link')}>
      <Stack gap={12}>
        <TextField type="url" value={url} placeholder="https://www.bbcgoodfood.com/recipes/…" autofocus error={error || undefined}
                   onChange={setUrl} onSubmit={go} />
        <Button expand disabled={!url.trim() || busy} onPress={go}>{busy ? t('Reading…') : t('Add')}</Button>
      </Stack>
    </Screen>
  );
}

function EditScreen() {
  const nav = useNav();
  const rc = useRecipes();
  const dialog = useDialog();
  const { id } = nav.params as { id?: string };
  const was = rc.recipes.find((x) => x.id === id);
  const [f, setF] = useLocal<Recipe>(was ?? { id: '', name: '', course: 'main', serves: 2, emoji: EMOJIS[rc.recipes.length % EMOJIS.length] });
  const set = (x: Partial<Recipe>) => setF({ ...f, ...x });
  const save = () => {
    const name = f.name.trim();
    if (!name) return;
    const fields = {
      name, course: f.course, minutes: f.minutes || null, serves: f.serves || null, tags: f.tags ?? [], emoji: f.emoji,
      ingredients: f.ingredients ?? '', method: f.method ?? '', link: f.link?.trim() || null, photo: f.photo ?? null,
    };
    if (was) {
      rc.edit('recipes', was.id, fields);
      nav.pop();
    } else {
      const id = rc.add('recipes', fields);
      nav.pop();
      nav.push('Recipe', { id });
    }
  };
  return (
    <Screen title={was ? t('Edit') : t('New recipe')}
            actions={was ? (
              <IconButton icon="delete" label={t('Delete')} onPress={async () => {
                if (!(await dialog.confirm({ title: t('Delete this recipe?'), ok: t('Delete'), danger: true }))) return;
                for (const p of rc.plans.filter((p) => p.recipe === was.id)) rc.remove('plans', p.id);
                rc.remove('recipes', was.id);
                nav.pop();
                nav.pop();
              }} />
            ) : undefined}
            footer={<Button expand disabled={!f.name.trim()} onPress={save}>{t('Save')}</Button>}>
      <Stack gap={12}>
        <TextField label={t('Name')} value={f.name} max={120} autofocus={!was} onChange={(name: string) => set({ name })} />
        {f.photo ? (
          <Stack gap={6}>
            <Image src={f.photo} ratio="16:9" class={s.hero} />
            <Button variant="plain" icon="close" onPress={() => set({ photo: null })}>{t('Remove photo')}</Button>
          </Stack>
        ) : (
          <>
            <Grid columns={6} gap={6}>
              {EMOJIS.map((e) => (
                <Pressable key={e} class={f.emoji === e ? [s.pick, s.picked] : s.pick} onPress={() => set({ emoji: e })}>
                  <Text class={s.pickEmoji}>{e}</Text>
                </Pressable>
              ))}
            </Grid>
            <Upload accept="png,jpg,jpeg,heic,webp" label={t('Add a photo')} onUpload={(photo: unknown) => set({ photo })} />
          </>
        )}
        <Segmented value={f.course ?? 'main'} onChange={(course: string) => set({ course })}
                   options={COURSES.map(([value, label]) => ({ value, label: t(label) }))} />
        <Row gap={8}>
          <Stack grow>
            <TextField type="number" label={t('Minutes')} value={f.minutes ? String(f.minutes) : ''}
                       onChange={(v: string | number) => set({ minutes: Math.max(0, Math.min(1440, Math.round(Number(v) || 0))) })} />
          </Stack>
          <Stack grow>
            <Text class={s.label}>{t('Serves')}</Text>
            <Stepper value={f.serves ?? 2} min={1} max={50} onChange={(serves: number) => set({ serves })} />
          </Stack>
        </Row>
        <TextField label={t('Ingredients')} multiline lines={10} max={8000} value={f.ingredients ?? ''}
                   placeholder={t('One per line')} onChange={(ingredients: string) => set({ ingredients })} />
        <Text class={s.label}>{t('Method')}</Text>
        <Editor value={f.method ?? ''} lines={10} onChange={(method: string) => set({ method })} />
        <TagInput value={f.tags ?? []} placeholder={t('Tags')} onChange={(tags: string[]) => set({ tags: tags.slice(0, 8) })} />
        <TextField type="url" label={t('Link')} value={f.link ?? ''} onChange={(link: string) => set({ link })} />
      </Stack>
    </Screen>
  );
}

const named = (rows: Recipe[], name: string) => {
  const want = String(name).toLowerCase();
  return rows.find((r) => r.name.toLowerCase() === want) ?? rows.find((r) => r.name.toLowerCase().includes(want));
};

export default defineApp({
  screens: { Home, Recipe: RecipeScreen, Cook: CookScreen, Import: ImportScreen, Edit: EditScreen },
  // A recipe opens beside the list on a wide window.
  split: ['Home'],
  actions: {
    add: {
      title: 'Add a recipe',
      params: {
        name: 'string',
        ingredients: { type: 'string', optional: true, title: 'One per line' },
        method: { type: 'string', optional: true, title: 'Steps, one per line' },
        minutes: { type: 'number', optional: true },
        serves: { type: 'number', optional: true },
      },
      run: (p: { name: string; ingredients?: string; method?: string; minutes?: number; serves?: number }, { data }: any) => {
        const id = data.add('recipes', {
          name: String(p.name).slice(0, 120),
          course: 'main',
          ingredients: p.ingredients ? String(p.ingredients).slice(0, 8000) : '',
          method: p.method ? String(p.method).slice(0, 32000) : '',
          minutes: p.minutes ? Math.max(0, Math.min(1440, Math.round(p.minutes))) : null,
          serves: p.serves ? Math.max(1, Math.min(50, Math.round(p.serves))) : null,
        });
        return { id };
      },
    },
    plan: {
      title: 'Plan a recipe for a day',
      params: { recipe: { type: 'string', title: "The recipe's name" }, day: { type: 'string', title: 'YYYY-MM-DD' } },
      run: ({ recipe, day }: { recipe: string; day: string }, { data }: any) => {
        const r = named(data.query('recipes', { limit: 500 }) as Recipe[], recipe);
        if (!r) throw new Error(`No recipe called ${recipe}`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) throw new Error('day is YYYY-MM-DD');
        data.add('plans', { day, recipe: r.id });
        return { planned: r.name, day };
      },
    },
    ingredients: {
      title: "A recipe's ingredients",
      params: { recipe: { type: 'string', title: "The recipe's name" } },
      run: ({ recipe }: { recipe: string }, { data }: any) => {
        const r = named(data.query('recipes', { limit: 500 }) as Recipe[], recipe);
        if (!r) throw new Error(`No recipe called ${recipe}`);
        return { name: r.name, serves: r.serves ?? null, ingredients: linesOf(r.ingredients) };
      },
    },
  },
});
