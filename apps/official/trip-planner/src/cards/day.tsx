import { defineCard, Stack, Row, Text, Icon, useCard, t } from 'isolink';

type Plan = { time: string; what: string; kind: string };
type State = { trip: string; day: string; plans: Plan[] };

const KINDS: [string, string, string][] = [
  ['travel', /*t*/'Travel', 'flight'], ['stay', /*t*/'Stay', 'home'], ['eat', /*t*/'Eat', 'restaurant'], ['do', /*t*/'Do', 'confirmation_number'],
];
const WEEKDAYS = [/*t*/'Sun', /*t*/'Mon', /*t*/'Tue', /*t*/'Wed', /*t*/'Thu', /*t*/'Fri', /*t*/'Sat'];
const MONTHS = [/*t*/'Jan', /*t*/'Feb', /*t*/'Mar', /*t*/'Apr', /*t*/'May', /*t*/'Jun', /*t*/'Jul', /*t*/'Aug',
  /*t*/'Sep', /*t*/'Oct', /*t*/'Nov', /*t*/'Dec'];

const dayWords = (k: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${t(WEEKDAYS[d.getDay()])} ${d.getDate()} ${t(MONTHS[d.getMonth()])}`;
};

/** One day of a trip sent into a chat: what's on, in order. */
function View() {
  const { state } = useCard() as { state: State };
  return (
    <Stack gap={2}>
      <Text variant="headline">{[dayWords(state.day), state.trip].filter(Boolean).join(' · ')}</Text>
      {state.plans.map((p, i) => {
        const kind = KINDS.find(([k]) => k === p.kind);
        return (
          <Row key={String(i)} gap={2} align="center">
            <Icon name={kind?.[2] ?? 'event'} size={16} />
            {p.time ? <Text tone="muted">{p.time}</Text> : null}
            <Text grow lines={2}>{p.what}</Text>
          </Row>
        );
      })}
    </Stack>
  );
}

const list = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => (typeof x === 'string' ? x : ''));

export default defineCard({
  name: 'Trip day',
  init: (ctx: { params?: Record<string, unknown> }) => {
    const p = ctx.params ?? {};
    const whats = list(p.whats).slice(0, 30);
    const times = list(p.times);
    const kinds = list(p.kinds);
    return {
      trip: typeof p.trip === 'string' ? p.trip.slice(0, 80) : '',
      day: typeof p.day === 'string' ? p.day.slice(0, 10) : '',
      plans: whats.map((what, i) => ({ what: what.slice(0, 120), time: (times[i] ?? '').slice(0, 5), kind: kinds[i] ?? 'do' })).filter((x) => x.what),
    };
  },
  actions: {},
  View,
});
