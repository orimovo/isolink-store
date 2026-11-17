import { defineCard, Stack, Row, Box, Text, useCard } from 'isolink';

type State = { title: string; year: number; kind: string; length: string; genre: string; director: string; rating: number };

const SKIES: [string, string, string][] = [
  ['#1e3a5f', '#0b1422', '#f59e0b'], ['#3b1f5c', '#140a22', '#f9a8d4'], ['#0f2e2a', '#06120f', '#34d399'],
  ['#1f2937', '#0a0d12', '#60a5fa'], ['#4c0519', '#1a0208', '#fb7185'], ['#78350f', '#200d03', '#fde047'],
  ['#082f49', '#03111c', '#a7f3d0'], ['#3f1d0b', '#120704', '#fdba74'],
];
const skyOf = (title: string) => SKIES[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % SKIES.length];

/** A film sent into a chat: a drawn poster, its year and length, who made it and how it was rated. */
function View() {
  const { state } = useCard() as { state: State };
  const [top, bottom, glow] = skyOf(state.title);
  return (
    <Row gap={12} align="start">
      <Box style={{ width: 64, height: 96, borderRadius: 5, overflow: 'hidden', padding: 6, display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-between', background: `linear-gradient(170deg, ${top} 0%, ${bottom} 100%)` }}>
        <Box style={{ width: 18, height: 18, borderRadius: 999, background: glow, opacity: 0.9 }} />
        <Text lines={3} style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1.1 }}>{state.title}</Text>
      </Box>
      <Stack grow gap={1}>
        <Text bold lines={3}>{state.title}</Text>
        <Text tone="muted" lines={1}>{[state.year || '', state.length, state.genre].filter(Boolean).join(' · ')}</Text>
        {state.director ? <Text tone="muted" lines={1}>{state.director}</Text> : null}
        {state.rating ? (
          <Row gap={0}>
            <Text style={{ color: '#e5a00d', letterSpacing: 1 }}>{'★'.repeat(state.rating)}</Text>
            <Text style={{ color: '#e5a00d', opacity: 0.25, letterSpacing: 1 }}>{'★'.repeat(5 - state.rating)}</Text>
          </Row>
        ) : null}
      </Stack>
    </Row>
  );
}

const text = (v: unknown, most: number) => (typeof v === 'string' ? v.slice(0, most) : '');
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && v >= lo && v <= hi ? Math.round(v) : 0);

export default defineCard({
  name: 'Film',
  init: (ctx: { params?: Record<string, unknown> }) => ({
    title: text(ctx.params?.title, 200),
    year: num(ctx.params?.year, 1880, 2200),
    kind: ctx.params?.kind === 'show' ? 'show' : 'film',
    length: text(ctx.params?.length, 40),
    genre: text(ctx.params?.genre, 80),
    director: text(ctx.params?.director, 120),
    rating: num(ctx.params?.rating, 1, 5),
  }),
  actions: {},
  View,
});
