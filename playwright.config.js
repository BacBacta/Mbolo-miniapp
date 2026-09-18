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
// La production tourne sous VERIFICATION_POLICY=badge depuis le 15 septembre 2026, et la suite
// tournait sous `gate`, le défaut du dépôt : le parcours d'entrée réellement servi n'était vu par
// aucun test de navigateur (audit 16, lot A). Un second serveur tourne donc sous « badge », sur le
// port suivant, et un projet à part ne lit que `e2e/badge.spec.js` contre lui.
const PORT_BADGE = PORT + 1;
export const BASE_URL_BADGE = `http://127.0.0.1:${PORT_BADGE}`;
const DATA_DIR = process.env.E2E_DATA_DIR || './.e2e-data';

const serveur = (port, url, dataDir, extra = {}) => ({
  command: 'node server/index.js',
  url: `${url}/health`,
  reuseExistingServer: false,
  timeout: 60_000,
  stdout: 'pipe',
  stderr: 'pipe',
  env: {
    PORT: String(port),
    // Une base neuve à chaque exécution : les tests ne doivent rien devoir à l'exécution d'avant.
    DATA_DIR: dataDir,
    NODE_ENV: 'development',
    BOT_TOKEN: '123456:E2E_TOKEN',
    WEBAPP_URL: url,
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
    ...extra,
  },
});

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
  projects: [
    { name: 'android', testIgnore: /badge\.spec\.js/, use: { ...devices['Pixel 5'], timezoneId: 'Africa/Douala', locale: 'fr-FR' } },
    { name: 'android-badge', testMatch: /badge\.spec\.js/, use: { ...devices['Pixel 5'], timezoneId: 'Africa/Douala', locale: 'fr-FR', baseURL: BASE_URL_BADGE } },
  ],
  // La jauge : le serveur « gate » est lancé depuis longtemps (la fraction « n sur 2 » se voit sur
  // les cartes), le serveur « badge » depuis dix jours, comme la production aujourd'hui (« Vérifié »
  // seul). Les deux états ont leurs tests, quel que soit le jour où la suite tourne.
  webServer: [
    serveur(PORT, BASE_URL, DATA_DIR, { LANCEMENT_LE: '2020-01-01' }),
    serveur(PORT_BADGE, BASE_URL_BADGE, `${DATA_DIR}-badge`, { VERIFICATION_POLICY: 'badge', MATCH_POLICY: 'open', LANCEMENT_LE: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10) }),
  ],
});
