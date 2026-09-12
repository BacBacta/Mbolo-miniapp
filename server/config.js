import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

// Adresse publique fournie par l'hébergeur, quand il y en a une : évite de la recopier à la main.
// Render donne l'adresse complète ; Fly donne le nom de l'app, dont l'adresse se déduit.
const urlHebergeur = () =>
  process.env.RENDER_EXTERNAL_URL || (process.env.FLY_APP_NAME ? `https://${process.env.FLY_APP_NAME}.fly.dev` : '');

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
  // Adresse HTTPS publique. WEBAPP_URL l'emporte ; sinon on prend celle de l'hébergeur.
  webAppUrl: (process.env.WEBAPP_URL || urlHebergeur()).replace(/\/$/, ''),
  adminChatId: process.env.ADMIN_CHAT_ID || '',
  adminKey: process.env.ADMIN_KEY || '',
  // Vrai quand l'app tourne pour de vraies personnes. Deux réglages de confort s'éteignent seuls
  // ici : ils sont utiles pour développer et dangereux en ligne.
  isProd: process.env.NODE_ENV === 'production',
  // Validation automatique des selfies et des photos. Elle marque « vérifié » quelqu'un que
  // personne n'a regardé — exactement ce que l'app promet à ses membres de ne jamais faire.
  // Donc jamais en production, quoi que dise la variable : même garde qu'allowDevAuth, et pour
  // la même raison. Un environnement de recette qui en a besoin ne se déclare pas production.
  autoApprove: bool(process.env.AUTO_APPROVE, false) && process.env.NODE_ENV !== 'production',
  seedDemo: bool(process.env.SEED_DEMO, false),
  allowDevAuth: bool(process.env.ALLOW_DEV_AUTH, false) && process.env.NODE_ENV !== 'production',
  useWebhook: bool(process.env.USE_WEBHOOK, false),
  matchPolicy: process.env.MATCH_POLICY || 'romance_opposite',
  // Pays proposé par défaut à l'inscription. L'app est ouverte à tous les pays : ce réglage
  // ne fait que pré-remplir le menu, il n'en exclut aucun.
  defaultCountry: (process.env.DEFAULT_COUNTRY || 'CM').toUpperCase(),
  // Vide : stockage dans un fichier JSON. Renseigné : PostgreSQL, avec migrations au démarrage.
  databaseUrl: process.env.DATABASE_URL || '',
  // Schéma PostgreSQL à utiliser. Vide : « public ». Sert à loger plusieurs installations dans
  // la même base (un schéma par environnement), et aux tests, qui en prennent un par fichier.
  // Seules les lettres, les chiffres et le tiret bas sont acceptés : ce nom entre dans du SQL.
  databaseSchema: /^[a-z_][a-z0-9_]*$/i.test(process.env.DATABASE_SCHEMA || '') ? process.env.DATABASE_SCHEMA : '',
  // Durée de validité des données d'authentification Telegram (initData)
  initDataMaxAgeSec: 24 * 60 * 60,
  // Nombre de messages avant d'autoriser liens et numéros dans une discussion
  contactUnlockAfter: 10,
  dailyProfiles: 20,
  // Limitation de débit par compte. Désactivable pour les tests de charge, jamais en production.
  rateLimit: bool(process.env.RATE_LIMIT, true),
  // Au-delà de ce délai sans décision de modération, le selfie est supprimé et la personne
  // doit recommencer. Sept jours par défaut.
  verificationTtlMs: Number(process.env.VERIFICATION_TTL_DAYS || 7) * 86400 * 1000,
  // Délai de réponse des profils de démo : laisse le temps de fermer l'app pour recevoir la notification
  demoReplyDelayMs: Number(process.env.DEMO_REPLY_DELAY_MS || 15000),
  demoLikeDelayMs: Number(process.env.DEMO_LIKE_DELAY_MS || 60000),
};

// Lieux publics partenaires. Le champ code est le contenu du QR code posé sur les tables.
// En production : codes stockés en base et renouvelés régulièrement.
// Informations connues seulement au démarrage (nom d'utilisateur du bot)
export const runtime = { botUsername: '' };

export const venues = [
  { id: 'palmier', name: 'Le Palmier', area: 'Bastos', city: 'Yaoundé', country: 'CM', perk: `-10 % avec ${config.appName}`, code: 'rdv:lieu:palmier' },
  { id: 'etudiants', name: 'Café des étudiants', area: 'Ngoa-Ekellé', city: 'Yaoundé', country: 'CM', perk: 'Boisson offerte dès 2 consommations', code: 'rdv:lieu:etudiants' },
  { id: 'lac', name: 'Terrasse du lac', area: 'Centre-ville', city: 'Yaoundé', country: 'CM', perk: `-10 % avec ${config.appName}`, code: 'rdv:lieu:lac' },
  { id: 'wouri', name: 'Le Wouri Lounge', area: 'Bonapriso', city: 'Douala', country: 'CM', perk: `-10 % avec ${config.appName}`, code: 'rdv:lieu:wouri' },
];

export const INTENTS = { amitie: 'Amitié', serieux: 'Relation sérieuse', duo: 'Sortie en duo' };
export const GENDERS = { femme: 'Femme', homme: 'Homme' };
// La ville n'est plus une liste fermée : elle se saisit librement et se compare par clé
// normalisée. Voir server/geo.js.
