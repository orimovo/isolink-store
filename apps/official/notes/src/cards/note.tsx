import { defineCard, Stack, Text, Markdown, useCard } from 'isolink';

/** A note sent into a chat: its title and words, for everyone there, with Notes or without. */
function View() {
  const { state } = useCard() as { state: { title: string; body: string } };
  return (
    <Stack gap={2}>
      {state.title ? <Text variant="headline">{state.title}</Text> : null}
      {state.body ? <Markdown compact text={state.body} /> : null}
    </Stack>
  );
}

export default defineCard({
  name: 'Note',
  init: (ctx: { params?: { title?: unknown; body?: unknown } }) => ({
    title: typeof ctx.params?.title === 'string' ? ctx.params.title : '',
    body: typeof ctx.params?.body === 'string' ? ctx.params.body : '',
  }),
  actions: {},
  View,
});
