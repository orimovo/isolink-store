import { defineApp, Screen, Stack, Box, Text, Button, t } from 'isolink';
import { open } from 'isolink/system';
import s from './app.css';

const APP = 'https://app.fridgeo.orimovo.co.uk';
const SITE = 'https://fridgeo.orimovo.co.uk/';

/** Fridgeo lives on its own: this opens it. */
function Home() {
  return (
    <Screen title="Fridgeo">
      <Stack align="center" gap={14} class={s.page}>
        <Box class={s.art}><Text class={s.emoji}>🥕</Text></Box>
        <Text class={s.name}>Fridgeo</Text>
        <Stack gap={8} class={s.buttons}>
          <Button expand icon="open_in_new" onPress={() => open.link(APP)}>{t('Open Fridgeo')}</Button>
          <Button expand variant="plain" onPress={() => open.link(SITE)}>{t('Website')}</Button>
        </Stack>
      </Stack>
    </Screen>
  );
}

export default defineApp({ screens: { Home } });
