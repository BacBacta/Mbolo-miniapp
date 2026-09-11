import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export const config = {
  root,
  // Nom affiché partout (app, bot, notifications). Modifiable sans toucher au code.
  appName: (process.env.APP_NAME || 'Mbolo').trim(),
  // DATA_DIR permet de placer les données sur un volume persistant (hébergeur) ou dans un dossier de test
  dataDir: process.env.DATA_DIR || path.join(root, 'data'),
  uploadsDir: path.join(process.env.DATA_DIR || path.join(root, 'data'), 'uploads'),
  publicDir: path.join(root, 'public'),
  port: Number(process.env.PORT || 3000),
  botToken: process.env.BOT_TOKEN || '',
  // Adresse HTTPS publique. Chez Render, RENDER_EXTERNAL_URL est fournie par l'hébergeur : inutile de la recopier.
  webAppUrl: (process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''),
  adminChatId: process.env.ADMIN_CHAT_ID || '',
  adminKey: process.env.ADMIN_KEY || '',
  autoApprove: bool(process.env.AUTO_APPROVE, false),
  seedDemo: bool(process.env.SEED_DEMO, false),
  allowDevAuth: bool(process.env.ALLOW_DEV_AUTH, false) && process.env.NODE_ENV !== 'production',
  useWebhook: bool(process.env.USE_WEBHOOK, false),
  matchPolicy: process.env.MATCH_POLICY || 'romance_opposite',
  // Durée de validité des données d'authentification Telegram (initData)
  initDataMaxAgeSec: 24 * 60 * 60,
  // Nombre de messages avant d'autoriser liens et numéros dans une discussion
  contactUnlockAfter: 10,
  dailyProfiles: 20,
  // Délai de réponse des profils de démo : laisse le temps de fermer l'app pour recevoir la notification
  demoReplyDelayMs: Number(process.env.DEMO_REPLY_DELAY_MS || 15000),
  demoLikeDelayMs: Number(process.env.DEMO_LIKE_DELAY_MS || 60000),
};

// Lieux publics partenaires. Le champ code est le contenu du QR code posé sur les tables.
// En production : codes stockés en base et renouvelés régulièrement.
// Informations connues seulement au démarrage (nom d'utilisateur du bot)
export const runtime = { botUsername: '' };

export const venues = [
  { id: 'palmier', name: 'Le Palmier', area: 'Bastos', city: 'Yaoundé', perk: `-10 % avec ${config.appName}`, code: 'rdv:lieu:palmier' },
  { id: 'etudiants', name: 'Café des étudiants', area: 'Ngoa-Ekellé', city: 'Yaoundé', perk: 'Boisson offerte dès 2 consommations', code: 'rdv:lieu:etudiants' },
  { id: 'lac', name: 'Terrasse du lac', area: 'Centre-ville', city: 'Yaoundé', perk: `-10 % avec ${config.appName}`, code: 'rdv:lieu:lac' },
  { id: 'wouri', name: 'Le Wouri Lounge', area: 'Bonapriso', city: 'Douala', perk: `-10 % avec ${config.appName}`, code: 'rdv:lieu:wouri' },
];

export const INTENTS = { amitie: 'Amitié', serieux: 'Relation sérieuse', duo: 'Sortie en duo' };
export const GENDERS = { femme: 'Femme', homme: 'Homme' };
export const CITIES = ['Yaoundé', 'Douala', 'Bafoussam', 'Buea', 'Garoua'];
