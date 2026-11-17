import { defineCard, Stack, Row, Box, Text, Rating, useCard } from 'isolink';

type State = { title: string; author: string; pages: number; rating: number; quote: string };

const TINTS = ['#7c3aed', '#0ea5e9', '#f97316', '#16a34a', '#e11d48', '#0f766e', '#a16207', '#475569'];
const tintOf = (title: string) => TINTS[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];

/** A book sent into a chat: its cover, who wrote it, how it was rated and a quote from it. */
function View() {
  const { state } = useCard() as { state: State };
  return (
    <Stack gap={3}>
      <Row gap={3} align="start">
        <Box style={{ width: 58, height: 86, borderRadius: 5, padding: 6, background: tintOf(state.title) }}>
          <Text lines={4} style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>{state.title}</Text>
        </Box>
        <Stack grow gap={1}>
          <Text bold lines={3}>{state.title}</Text>
          {state.author ? <Text tone="muted">{state.author}</Text> : null}
          {state.rating ? <Rating value={state.rating} /> : null}
        </Stack>
      </Row>
      {state.quote ? <Text>{`“${state.quote}”`}</Text> : null}
    </Stack>
  );
}

const text = (v: unknown, most: number) => (typeof v === 'string' ? v.slice(0, most) : '');
const num = (v: unknown, most: number) => (typeof v === 'number' && v > 0 ? Math.min(most, Math.round(v)) : 0);

export default defineCard({
  name: 'Book',
  init: (ctx: { params?: Record<string, unknown> }) => ({
    title: text(ctx.params?.title, 200),
    author: text(ctx.params?.author, 120),
    pages: num(ctx.params?.pages, 20000),
    rating: num(ctx.params?.rating, 5),
    quote: text(ctx.params?.quote, 2000),
  }),
  actions: {},
  View,
});
