import { defineCard, Stack, Text, Checkbox, useCard, t } from 'isolink';

type State = { items: { name: string; got: boolean }[] };

/** A shopping list sent into a chat: anyone there ticks things off as they're got. */
function View() {
  const { state, act } = useCard() as { state: State; act: { tick: (a: { i: number }) => void } };
  return (
    <Stack gap={2}>
      <Text variant="headline">{t('Shopping')}</Text>
      {state.items.map((x, i) => (
        <Checkbox key={String(i)} round checked={x.got} onChange={() => act.tick({ i })} label={x.name} />
      ))}
    </Stack>
  );
}

export default defineCard({
  name: 'Shopping',
  init: (ctx: { params?: { items?: unknown } }) => ({
    items: (Array.isArray(ctx.params?.items) ? ctx.params!.items as unknown[] : [])
      .filter((x) => typeof x === 'string' && x).slice(0, 60).map((x) => ({ name: (x as string).slice(0, 80), got: false })),
  }),
  actions: {
    tick: (state: State, args: { i?: unknown }) => {
      const i = typeof args?.i === 'number' ? args.i : -1;
      if (!state.items[i]) throw 'No such item';
      state.items[i].got = !state.items[i].got;
    },
  },
  View,
});
