import { defineCard, Stack, Row, Text, Badge, useCard, t } from 'isolink';

type State = { name: string; minutes: number; serves: number; ingredients: string[]; method: string[] };

const timeText = (m: number) => (m < 60 ? t('{p0} min', { p0: m }) : m % 60 ? t('{p0} h {p1}', { p0: Math.floor(m / 60), p1: m % 60 }) : t('{p0} h', { p0: m / 60 }));

/** A recipe sent into a chat: everything it takes to cook it, for everyone there. */
function View() {
  const { state } = useCard() as { state: State };
  return (
    <Stack gap={3}>
      <Text variant="headline">{state.name}</Text>
      {state.minutes || state.serves ? (
        <Row gap={6} wrap>
          {state.minutes ? <Badge label={timeText(state.minutes)} /> : null}
          {state.serves ? <Badge label={t('Serves {p0}', { p0: state.serves })} /> : null}
        </Row>
      ) : null}
      {state.ingredients.length ? (
        <Stack gap={1}>
          <Text bold>{t('Ingredients')}</Text>
          {state.ingredients.map((l, i) => <Text key={String(i)}>{`• ${l}`}</Text>)}
        </Stack>
      ) : null}
      {state.method.length ? (
        <Stack gap={1}>
          <Text bold>{t('Method')}</Text>
          {state.method.map((l, i) => <Text key={String(i)}>{`${i + 1}. ${l}`}</Text>)}
        </Stack>
      ) : null}
    </Stack>
  );
}

const lines = (v: unknown, most: number) =>
  (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x).slice(0, most).map((x) => (x as string).slice(0, 400));
const num = (v: unknown, most: number) => (typeof v === 'number' && v > 0 ? Math.min(most, Math.round(v)) : 0);

export default defineCard({
  name: 'Recipe',
  init: (ctx: { params?: Record<string, unknown> }) => ({
    name: typeof ctx.params?.name === 'string' ? ctx.params.name.slice(0, 120) : '',
    minutes: num(ctx.params?.minutes, 1440),
    serves: num(ctx.params?.serves, 50),
    ingredients: lines(ctx.params?.ingredients, 60),
    method: lines(ctx.params?.method, 40),
  }),
  actions: {},
  View,
});
