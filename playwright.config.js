// Tests de bout en bout (P0-7) : le vrai parcours, dans un vrai navigateur, contre le vrai serveur.
//
// Ce que la suite `node --test` ne peut pas dire : qu'un écran s'affiche, qu'un bouton existe, que
// le clavier ne se ferme pas, que la navigation revient au bon endroit. Ces tests-là passent par
// le navigateur ; ils sont donc lents et peu nombreux, et couvrent les chemins qui coûteraient
// cher à casser, pas chaque cas limite — celui-là reste le travail des tests unitaires.
//
// Le serveur est lancé en mode développement : `?dev_user=` remplace Telegram (ALLOW_DEV_AUTH),
// les selfies sont validés seuls (AUTO_APPROVE) et les profils de démonstration peuplent la
// découverte (SEED_DEMO). Aucun de ces trois réglages ne survit à la production, par construction.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 3210);
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Les écrans s'enchaînent par des appels réseau : on laisse le temps d'un réseau lent.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // Un test qui passe une fois sur deux ne dit rien : en intégration continue, aucun rattrapage.
  retries: 0,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    // La cible tient dans la main : un Android d'entrée de gamme, pas un écran de bureau.
    ...devices['Pixel 5'],
    // Fixés pour que les tests ne dépendent pas de la machine : le fuseau décide du pays proposé
    // au premier lancement, et la langue décide de celle de l'interface.
    timezoneId: 'Africa/Douala',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'android', use: { ...devices['Pixel 5'], timezoneId: 'Africa/Douala', locale: 'fr-FR' } }],
  webServer: {
    command: 'node server/index.js',
    url: `${BASE_URL}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      // Une base neuve à chaque exécution : les tests ne doivent rien devoir à l'exécution d'avant.
      DATA_DIR: process.env.E2E_DATA_DIR || './.e2e-data',
      NODE_ENV: 'development',
      BOT_TOKEN: '123456:E2E_TOKEN',
      WEBAPP_URL: BASE_URL,
      ALLOW_DEV_AUTH: 'true',
      AUTO_APPROVE: 'true',
      SEED_DEMO: 'true',
      USE_WEBHOOK: 'false',
      ADMIN_CHAT_ID: '',
      // Le fichier JSON suffit : ce qu'on teste ici est l'interface, pas le stockage.
      DATABASE_URL: '',
      // Les tests enchaînent les actions bien plus vite qu'une personne : sans cela, la
      // limitation de débit refuserait des gestes parfaitement légitimes.
      RATE_LIMIT: 'false',
      DEMO_REPLY_DELAY_MS: '400',
      DEMO_LIKE_DELAY_MS: '400',
    },
  },
});
