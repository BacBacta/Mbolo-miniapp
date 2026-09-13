import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

// Un nombre de jours, avec un piège à éviter : une faute de frappe qui retomberait sur zéro
// éteindrait la mesure sans que personne ne s'en aperçoive, et on ne le découvrirait qu'en
// cherchant des chiffres qui n'existent pas. Une valeur illisible garde donc le défaut, et le dit.
const jours = (v, d) => {
  if (v === undefined || v === '') return d;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  console.warn(`EVENTS_RETENTION_DAYS vaut « ${v} », qui n'est pas un nombre de jours. On garde ${d}. Mets 0 pour ne rien enregistrer.`);
  return d;
};

// Adresse publique fournie par l'hébergeur, quand il y en a une : évite de la recopier à la main.
// Render donne l'adresse complète ; Fly donne le nom de l'app, dont l'adresse se déduit.
const urlHebergeur = () =>
  process.env.RENDER_EXTERNAL_URL || (process.env.FLY_APP_NAME ? `https://${process.env.FLY_APP_NAME}.fly.dev` : '');

export const config = {
  root,
  // Nom affiché partout (app, bot, notifications). Modifiable sans toucher au code.
  appName: (process.env.APP_NAME || 'Odo').trim(),
  // DATA_DIR permet de placer les données sur un volume persistant (hébergeur) ou dans un dossier de test
  // Rendu absolu : res.sendFile() refuse un chemin relatif, et les photos ne partaient donc plus
  // dès qu'on donnait un DATA_DIR relatif (« ./data »), sans que rien d'autre ne le laisse voir.
  dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')),
  uploadsDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data'), 'uploads'),
  publicDir: path.join(root, 'public'),
  port: Number(process.env.PORT || 3000),
  botToken: process.env.BOT_TOKEN || '',
  // Adresse HTTPS publique. WEBAPP_URL l'emporte ; sinon on prend celle de l'hébergeur.
  webAppUrl: (process.env.WEBAPP_URL || urlHebergeur()).replace(/\/$/, ''),
  adminChatId: process.env.ADMIN_CHAT_ID || '',
  adminKey: process.env.ADMIN_KEY || '',
  // Secret d'où se déduisent les codes des QR posés dans les lieux partenaires (server/lieux.js).
  // Absent, un secret est tiré au hasard au démarrage : les QR imprimés cessent de marcher, aucun
  // ne devient devinable. En production avec au moins un lieu, le serveur refuse de démarrer.
  venueSecret: process.env.VENUE_SECRET || '',
  // Signe les sessions web : pour l'instant celles de la modération, plus tard celles des
  // paiements (section 10.3 du cahier des charges). Un seul secret pour les deux, sans quoi le
  // chantier suivant en traînerait un second à fusionner. Absent, /api/mod refuse en le disant.
  webSessionSecret: process.env.WEB_SESSION_SECRET || '',
  // Durée d'une session de modération. Courte : elle donne accès aux signalements, donc à des
  // discussions entre membres. Le lien qui l'ouvre, lui, vaut dix minutes et ne sert qu'une fois.
  modSessionSec: Number(process.env.MOD_SESSION_SEC) || 12 * 3600,
  modLienSec: Number(process.env.MOD_LIEN_SEC) || 600,
  // Fuseau dans lequel l'espace de modération affiche les dates. Le serveur tourne en UTC :
  // sans ça, « 22 h 40 » se lirait « 21 h 40 » pour l'équipe, et on daterait mal un signalement.
  modTimezone: process.env.MOD_TIMEZONE || 'Africa/Douala',
  // Combien de jours on garde les événements de mesure. 0 : on n'en écrit aucun — c'est ce qui
  // rend la mesure refusable sans toucher au code. Voir audit/05-mesure-produit.md.
  eventsRetentionDays: jours(process.env.EVENTS_RETENTION_DAYS, 180),
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

// Lieux publics partenaires. **Aucun ne porte son code** : il se calcule à partir du secret du
// serveur (`server/lieux.js`). Un champ `code` ici reviendrait à l'écrire dans Git, et surtout à
// le laisser recopier par n'importe quelle route qui renvoie un lieu — ce qui est exactement
// arrivé : la discussion servait l'objet entier, code compris.
// Informations connues seulement au démarrage (nom d'utilisateur du bot)
export const runtime = { botUsername: '' };

// Lieux d'exemple, pour la démonstration seulement : aucun de ces établissements n'a signé
// quoi que ce soit. Ils servent à essayer le parcours de rendez-vous de bout en bout, jamais à
// envoyer quelqu'un quelque part.
export const VENUES_DEMO = [
  { id: 'palmier', name: 'Le Palmier', area: 'Bastos', city: 'Yaoundé', country: 'CM', perk: `-10 % avec ${config.appName}` },
  { id: 'etudiants', name: 'Café des étudiants', area: 'Ngoa-Ekellé', city: 'Yaoundé', country: 'CM', perk: 'Boisson offerte dès 2 consommations' },
  { id: 'lac', name: 'Terrasse du lac', area: 'Centre-ville', city: 'Yaoundé', country: 'CM', perk: `-10 % avec ${config.appName}` },
  { id: 'wouri', name: 'Le Wouri Lounge', area: 'Bonapriso', city: 'Douala', country: 'CM', perk: `-10 % avec ${config.appName}` },
];

// Les lieux partenaires, et pourquoi la liste est vide.
//
// Un lieu n'entre ici qu'après un accord signé avec l'établissement. L'app annonce son nom, son
// quartier et son avantage (« -10 % avec Odo ») à quelqu'un qui va s'y rendre : si le café n'a
// rien signé, c'est un mensonge fait à un membre, et un problème avec le café. Une app dont la
// promesse centrale est « des personnes réelles, pas d'arnaque » ne peut pas ouvrir là-dessus.
//
// Liste vide, le rendez-vous avec confirmation d'arrivée n'est simplement pas proposé, et l'app
// le dit : « pas encore de lieu partenaire dans ta ville », en invitant à convenir d'un lieu
// public dans la discussion. Tout le mécanisme reste en place — routes, check-in, QR, notification
// d'arrivée — et une seule ligne ajoutée ici le rallume, le jour où un partenariat existe.
//
// Les quatre lieux d'exemple vivent désormais dans server/seed.js, avec les profils de
// démonstration, et n'apparaissent qu'avec SEED_DEMO.
export const venues = [...(config.seedDemo ? VENUES_DEMO : [])];

export const INTENTS = { amitie: 'Amitié', serieux: 'Relation sérieuse' };

// « Sortie en duo » a été proposée avant d'exister : l'app promettait « rencontrer à quatre, avec
// un ami » et livrait un match ordinaire, en tête-à-tête. L'option est retirée de l'inscription
// (P1-7) ; son libellé reste ici pour que les profils qui la portent encore s'affichent avec un
// mot plutôt qu'avec « undefined », le temps que chacun rouvre l'app. Quand le vrai mode existera,
// la ligne remonte dans INTENTS.
export const INTENTS_RETIRES = { duo: 'Sortie en duo' };

// Questions de compatibilité (P1-4), posées uniquement en « Relation sérieuse » : c'est là qu'elles
// veulent dire quelque chose, et nulle part ailleurs. Facultatives — ne pas répondre est une
// réponse, et une liste fermée vaut mieux qu'un champ libre qu'il faudrait ensuite interpréter.
//
// La religion n'est volontairement pas ici. Le raisonnement de MATCH_POLICY sur l'orientation vaut
// pour elle : une colonne interrogeable, croisée avec la ville et le quartier déjà stockés, est
// une liste de ciblage en cas de fuite ou de réquisition. Qui veut le dire peut l'écrire dans sa
// réponse libre, avec ses mots — c'est du texte, pas un facteur de tri.
export const COMPAT = {
  mariage: {
    question: 'Le mariage, pour toi ?',
    valeurs: { oui: "C'est mon projet", peutetre: 'Peut-être, un jour', non: 'Ce n\'est pas mon projet' },
  },
  enfants: {
    question: 'Des enfants ?',
    valeurs: { oui: "J'en veux", deja: "J'en ai déjà", peutetre: 'Peut-être', non: "Je n'en veux pas" },
  },
};
export const GENDERS = { femme: 'Femme', homme: 'Homme' };
// La ville n'est plus une liste fermée : elle se saisit librement et se compare par clé
// normalisée. Voir server/geo.js.
