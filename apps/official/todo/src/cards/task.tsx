import { defineCard, Stack, Row, Text, Checkbox, useCard, t } from 'isolink';

type Step = { title: string; done: boolean };
type State = { title: string; due: number; list: string; steps: Step[] };

const MONTHS = [/*t*/'Jan', /*t*/'Feb', /*t*/'Mar', /*t*/'Apr', /*t*/'May', /*t*/'Jun', /*t*/'Jul', /*t*/'Aug',
  /*t*/'Sep', /*t*/'Oct', /*t*/'Nov', /*t*/'Dec'];
const DAYS = [/*t*/'Sun', /*t*/'Mon', /*t*/'Tue', /*t*/'Wed', /*t*/'Thu', /*t*/'Fri', /*t*/'Sat'];

/** A task sent into a chat: its title, when it's due, its project and steps anyone there can tick. */
function View() {
  const { state, act } = useCard() as { state: State; act: { tick: (a: { i: number }) => void } };
  const d = state.due ? new Date(state.due) : null;
  const facts = [
    d ? t('Due {p0}', { p0: `${t(DAYS[d.getDay()])} ${d.getDate()} ${t(MONTHS[d.getMonth()])}` }) : '',
    state.list,
  ].filter(Boolean).join(' · ');
  return (
    <Stack gap={2}>
      <Text variant="headline">{state.title}</Text>
      {facts ? <Text tone="muted">{facts}</Text> : null}
      {state.steps.map((x, i) => (
        <Row key={String(i)} gap={2} align="center">
          <Checkbox round checked={x.done} onChange={() => act.tick({ i })} label={x.title} />
        </Row>
      ))}
    </Stack>
  );
}

const text = (v: unknown, most: number) => (typeof v === 'string' ? v.slice(0, most) : '');

export default defineCard({
  name: 'Task',
  init: (ctx: { params?: { title?: unknown; due?: unknown; list?: unknown; steps?: unknown } }) => ({
    title: text(ctx.params?.title, 200),
    due: typeof ctx.params?.due === 'number' ? ctx.params.due : 0,
    list: text(ctx.params?.list, 80),
    steps: (Array.isArray(ctx.params?.steps) ? ctx.params!.steps as unknown[] : [])
      .slice(0, 30).map((s) => ({ title: text(s, 200), done: false })),
  }),
  actions: {
    tick: (state: State, args: { i?: unknown }) => {
      const i = typeof args?.i === 'number' ? args.i : -1;
      if (!state.steps[i]) throw 'No such step';
      state.steps[i].done = !state.steps[i].done;
    },
  },
  View,
});
