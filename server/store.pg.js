// Stockage PostgreSQL. Même interface que store.json.js, à la lettre : le reste de l'app ne sait
// pas lequel des deux il utilise.
//
// Ce que cette version apporte et que le fichier JSON ne pouvait pas donner : plusieurs instances
// qui écrivent sans s'écraser, des sauvegardes, et des transactions là où une écriture partielle
// laisserait la base incohérente (supprimer un compte, défaire un match).
//
// Ce qu'elle ne change pas : les requêtes. allUsers() charge toujours toute la table, parce que
// la découverte filtre en mémoire. C'est tenable pour une bêta de quelques centaines de personnes ;
// le jour où ça ne l'est plus, c'est le filtre de découverte qu'il faudra descendre en SQL, pas
// le stockage qu'il faudra changer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { config } from './config.js';
import { fichierVoix } from './voix.js';
import { fichiersDUnePhoto, fichiersDUnCompte, supprimerLesPhotosDuChat } from './photos.js';
import { migrer } from './db/migrate.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Le nom sous lequel la base voit l'app : scripts/restaurer.js s'en sert pour refuser de
  // restaurer pendant qu'elle tourne.
  application_name: 'odo',
  // Fly, Neon et Supabase présentent des certificats que Node ne valide pas seul. La connexion
  // reste chiffrée ; c'est la vérification de l'autorité qui est levée, comme le fait psql par défaut.
  ssl: /\bsslmode=(require|prefer)\b/.test(config.databaseUrl || '') ? { rejectUnauthorized: false } : false,
  max: 10,
  // Chaque connexion du pool travaille dans le schéma configuré. Posé ici plutôt que dans chaque
  // requête : aucune table n'a à être nommée avec son schéma dans le reste du fichier.
  ...(config.databaseSchema ? { options: `-c search_path=${config.databaseSchema}` } : {}),
});

// Une connexion inactive du pool coupée par le serveur (redémarrage, réseau) émet « error » sur le
// pool ; sans écouteur, c'est une exception non capturée et le processus s'arrête. Le pool en
// rouvre une à la requête suivante : il n'y a rien d'autre à faire que le dire.
pool.on('error', (e) => console.error(`Connexion PostgreSQL perdue (le pool en rouvrira une) : ${e.message}`));

// Les migrations s'appliquent à l'import, pas au démarrage du serveur : rien ne peut interroger
// une table qui n'existe pas encore, ni dans index.js ni dans un test qui monte son propre Express.
export const pret = await migrer(pool, (m) => console.error(m), config.databaseSchema);

const q = async (texte, params) => (await pool.query(texte, params)).rows;
const un = async (texte, params) => (await q(texte, params))[0] || null;

export const newId = () => crypto.randomBytes(8).toString('hex');
const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

// Les lignes reviennent avec leurs colonnes ; l'app attend les objets qu'elle a écrits.
const versUser = (r) => (r ? { ...r.data, id: r.id, createdAt: Number(r.created_at) } : null);
const versMatch = (r) => (r ? { id: r.id, key: r.pair_key, users: [r.user_a, r.user_b], createdAt: Number(r.created_at), readAt: r.read_at } : null);
// Même forme que le fichier : les champs absents n'y sont pas, jamais « null ».
const versMessage = (r) => ({
  id: r.id, from: r.from_id, text: r.text, at: Number(r.at),
  ...(r.reply_to ? { replyTo: r.reply_to } : {}),
  ...(r.photo ? { photo: true } : {}),
  ...(r.deleted_at ? { deletedAt: Number(r.deleted_at) } : {}),
});
const versSwipe = (r) => (r ? { from: r.from_id, to: r.to_id, action: r.action, at: Number(r.at) } : null);
const versDate = (r) => (r ? { ...r.data, id: r.id, matchId: r.match_id } : null);
// La forme d'un événement doit être identique des deux côtés : le stockage JSON omet u et p quand
// ils sont vides, PostgreSQL les garde à null. Un test compare les deux surfaces, mais pas leur
// contenu — sans cette normalisation, le même code lirait deux formes différentes.
const versPaiement = (r) => ({ id: r.id, userId: r.user_id, chargeId: r.charge_id, source: r.source, jours: Number(r.jours), stars: Number(r.stars), statut: r.statut, at: Number(r.at), ...(r.rembourse_le ? { rembourseLe: Number(r.rembourse_le) } : {}) });
const versEvent = (r) => {
  const e = { id: r.id, k: r.k, at: Number(r.at) };
  if (r.u !== null && r.u !== undefined) e.u = r.u;
  if (r.p) e.p = r.p;
  return e;
};

// Le patch est fusionné dans le jsonb côté base : deux instances qui modifient deux champs
// différents du même compte ne s'écrasent plus l'une l'autre, ce qu'un lire-modifier-écrire
// depuis Node ne pouvait pas garantir.
async function fusionner(table, id, patch) {
  const { id: _ignore, createdAt: _aussi, ...reste } = patch;
  return un(`update ${table} set data = data || $2::jsonb where id = $1 returning *`, [String(id), JSON.stringify(reste)]);
}

function supprimerFichiers(id, noms) {
  for (const f of noms) {
    const p = path.join(config.uploadsDir, `${id}-${f}.jpg`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

// La présentation vocale n'est pas un .jpg : elle a son propre effacement, sans quoi elle
// survivrait à la suppression du compte.
function supprimerLaVoix(id) {
  const p = path.join(config.uploadsDir, fichierVoix(id));
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Présence : en mémoire, comme en mode JSON. Savoir qui regarde une discussion à la seconde près
// n'a pas à survivre à un redémarrage, et n'a pas à voyager entre instances.
const presence = new Map();
const frappe = new Map();

export const store = {
  // ---------- Utilisateurs ----------
  getUser: async (id) => versUser(await un('select * from users where id = $1', [String(id)])),

  async upsertTelegramUser(tgUser) {
    const id = String(tgUser.id);
    const neuf = {
      // L'identifiant public, sans lien avec l'identifiant Telegram (audit/09-revue-code.md, I6)
      pid: newId(),
      firstName: tgUser.first_name || 'Toi',
      languageCode: tgUser.language_code || 'fr',
      profile: null,
      verification: 'none',
      pendingGesture: null,
      demo: false,
      lastNotifiedAt: {},
    };
    // Un compte existant ne reçoit que ce qui vient de Telegram, sans perdre le reste
    const venuDeTelegram = {};
    if (tgUser.first_name) venuDeTelegram.firstName = tgUser.first_name;
    if (tgUser.language_code) venuDeTelegram.languageCode = tgUser.language_code;
    const u = versUser(await un(
      `insert into users (id, data, created_at) values ($1, $2::jsonb, $3)
       on conflict (id) do update set data = users.data || $4::jsonb
       returning *`,
      [id, JSON.stringify(neuf), Date.now(), JSON.stringify(venuDeTelegram)],
    ));
    // Les comptes d'avant l'identifiant public en reçoivent un à leur prochain passage.
    return u.pid ? u : versUser(await fusionner('users', id, { pid: newId() }));
  },
  userByPid: async (pid) => (pid ? versUser(await un(`select * from users where data->>'pid' = $1`, [pid])) : null),

  // Charger quelques comptes nommés. **Une requête, pas une par identifiant** : sur une base
  // qui vit sur une autre machine, vingt getUser() font vingt allers-retours, et c'est pire que
  // le allUsers() qu'on cherchait à éviter. `any($1)` prend le tableau tel quel.
  //
  // Le tableau vide ne part pas en base : `any('{}')` est une requête qui ne peut rien rendre.
  usersByIds: async (ids) => ((ids || []).length
    ? (await q('select * from users where id = any($1)', [ids.map(String)])).map(versUser)
    : []),

  // À l'arrêt : rendre les connexions, pour que PostgreSQL ne garde pas des sessions mortes.
  async arreter() { await pool.end().catch(() => {}); },

  // Le jeton du lien de modération, comparé et effacé d'un seul geste : deux requêtes avec le
  // même lien ne peuvent pas passer toutes les deux.
  async consommerJetonModeration(id, usage) {
    if (!usage) return false;
    const r = await q(`update users set data = data - 'modJeton' where id = $1 and data->>'modJeton' = $2 returning id`, [String(id), String(usage)]);
    return r.length > 0;
  },

  // createdAt a sa propre colonne : un patch qui la porte la met à jour à part, le reste va
  // dans le jsonb. Sans cela, une date d'inscription réécrite serait silencieusement perdue.
  updateUser: async (id, patch) => {
    const { id: _ignore, createdAt, ...reste } = patch;
    return versUser(await un(
      'update users set data = data || $2::jsonb, created_at = coalesce($3, created_at) where id = $1 returning *',
      [String(id), JSON.stringify(reste), createdAt ?? null],
    ));
  },

  // Droit à l'effacement (loi camerounaise sur les données personnelles). Tout part ensemble :
  // une suppression à moitié faite laisserait des messages sans auteur.
  async deleteUser(id) {
    id = String(id);
    const client = await pool.connect();
    let ids = [];
    try {
      await client.query('begin');
      const { rows } = await client.query('select id from matches where user_a = $1 or user_b = $1', [id]);
      ids = rows.map((r) => r.id);
      if (ids.length) {
        await client.query('delete from messages where match_id = any($1)', [ids]);
        await client.query('delete from dates where match_id = any($1)', [ids]);
        await client.query('delete from matches where id = any($1)', [ids]);
      }
      await client.query('delete from swipes where from_id = $1 or to_id = $1', [id]);
      // Un paiement encaissé se garde comme une facture : la ligne reste, sans personne derrière.
      await client.query('update paiements set user_id = null where user_id = $1', [id]);
      await client.query('delete from blocks where from_id = $1 or to_id = $1', [id]);
      // Les signalements, dans les deux sens, et la place de personne de confiance chez les
      // autres : les deux survivaient à l'effacement (audit/09-revue-code.md, I4).
      await client.query(`delete from reports where data->>'from' = $1 or data->>'targetId' = $1`, [id]);
      await client.query(`update users set data = data - 'confiance' where data->'confiance'->>'id' = $1`, [id]);
      // Sans cette ligne, les événements de mesure survivraient à l'effacement d'un compte, et la
      // promesse « tout part » deviendrait fausse. Les lignes sans identifiant (account_deleted)
      // ne sont pas concernées : elles ne désignent personne.
      await client.query('delete from events where u = $1', [id]);
      await client.query('delete from users where id = $1', [id]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    supprimerFichiers(id, fichiersDUnCompte());
    supprimerLaVoix(id);
    for (const mid of ids) supprimerLesPhotosDuChat(config.uploadsDir, mid);
  },

  // Purge des selfies que la modération n'a jamais tranchés : la promesse est qu'il disparaît
  // après décision ; sans décision, il ne doit pas rester pour autant.
  // Rend la liste des comptes purgés, avec le numéro du message du groupe : c'est à l'appelant
  // de retirer la photo de Telegram, le stockage ne parle pas au bot.
  async purgerVerificationsOubliees(delaiMs) {
    const limite = Date.now() - delaiMs;
    const oublies = await q(
      `select id, data->>'verifMessageId' as message from users
       where data->>'verification' = 'pending'
         and coalesce((data->>'verificationSentAt')::bigint, created_at, 0) <= $1`,
      [limite],
    );
    const purges = [];
    for (const { id, message } of oublies) {
      supprimerFichiers(id, ['selfie']);
      await fusionner('users', id, { verification: 'none', pendingGesture: null, pendingGestureAt: null, verificationSentAt: null, verifMessageId: null });
      purges.push({ id, verifMessageId: message ? Number(message) : null });
    }
    return purges;
  },

  // ---------- Photos ----------
  // Les anciens profils n'avaient qu'une photo, <id>-profile.jpg : elle devient l'emplacement 1,
  // déjà validée, à la première lecture.
  async photosOf(user) {
    if (user.photos) return user.photos;
    const photos = [];
    if (user.profile?.hasPhoto) {
      const ancien = path.join(config.uploadsDir, `${user.id}-profile.jpg`);
      if (fs.existsSync(ancien)) fs.renameSync(ancien, path.join(config.uploadsDir, `${user.id}-photo-1.jpg`));
      photos.push({ n: 1, status: 'approved' });
    }
    user.photos = photos;
    await fusionner('users', user.id, { photos });
    return photos;
  },

  // hasPhoto reste synchronisé : « au moins une photo validée », ce que voient les autres.
  // La liste obtenue est renvoyée : celui qui appelle tient souvent une copie devenue vieille
  // de la personne, et la relire pour rien ferait un aller-retour de plus.
  async setPhoto(userId, n, status) {
    const u = await store.getUser(userId);
    if (!u) return [];
    const photos = [...(await store.photosOf(u)).filter((p) => p.n !== n), { n, status }].sort((a, b) => a.n - b.n);
    const patch = { photos };
    if (u.profile) patch.profile = { ...u.profile, hasPhoto: photos.some((p) => p.status === 'approved') };
    await fusionner('users', userId, patch);
    return photos;
  },

  // La présentation vocale : un seul emplacement, et son fichier à côté. Même cycle que les
  // photos — « pending » tant que la modération n'a pas écouté, « approved » ensuite.
  async setVoice(userId, status, duree) {
    const u = await store.getUser(userId);
    if (!u) return null;
    const voix = { status, duree: Number(duree) || 0, at: Date.now() };
    await fusionner('users', userId, { voix });
    return voix;
  },

  async removeVoice(userId) {
    const u = await store.getUser(userId);
    if (!u) return null;
    supprimerLaVoix(u.id);
    await fusionner('users', userId, { voix: null });
    return null;
  },

  async removePhoto(userId, n) {
    const u = await store.getUser(userId);
    if (!u) return [];
    const photos = (await store.photosOf(u)).filter((p) => p.n !== n);
    supprimerFichiers(u.id, fichiersDUnePhoto(n));
    const patch = { photos };
    if (u.profile) patch.profile = { ...u.profile, hasPhoto: photos.some((p) => p.status === 'approved') };
    await fusionner('users', userId, patch);
    return photos;
  },

  // ---------- Bannissement ----------
  // Le compte reste, mais il est clos : les conditions promettent qu'un compte banni pour arnaque
  // ne peut pas être recréé, ce qui suppose de garder de quoi le reconnaître. Ses matchs sont
  // défaits pour que personne ne reste en discussion avec lui.
  async banUser(id, { motif = '', par = '' } = {}) {
    const banned = { at: Date.now(), motif: String(motif).slice(0, 200), par: String(par) };
    const u = versUser(await fusionner('users', id, { banned }));
    if (!u) return null;
    for (const m of await store.matchesOf(id)) await store.removeMatch(m.id);
    return u;
  },

  // `- 'banned'` retire la clé du jsonb : un compte débanni ne garde pas une trace vide.
  async unbanUser(id) {
    return versUser(await un("update users set data = data - 'banned' where id = $1 returning *", [String(id)]));
  },

  bannis: async () => (await q("select * from users where data ? 'banned'")).map(versUser),

  allUsers: async () => (await q('select * from users')).map(versUser),

  // ---------- Limitation de débit ----------
  // En base, et c'est tout l'intérêt : ce stockage-ci tourne à plusieurs instances, qui doivent
  // compter ensemble. Tant que les compteurs vivaient en mémoire, deux machines laissaient passer
  // le double de ce que les règles annoncent, chacune ignorant l'autre.
  //
  // Une transaction, parce que lire-puis-écrire sans verrou est exactement ce qu'on essaie
  // d'éviter : deux requêtes simultanées liraient la même fenêtre et s'accorderaient toutes les
  // deux le dernier jeton. L'insertion à vide sert à prendre le verrou même quand la ligne
  // n'existe pas encore — `do update` est un non-changement qui verrouille la ligne existante.
  async limiteConsommer(cle, max, fenetreMs, maintenant = Date.now()) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(
        `insert into rate_limits (cle, horodatages, fin) values ($1, '{}', 0)
         on conflict (cle) do update set cle = excluded.cle
         returning horodatages`, [cle]);
      const gardes = (rows[0].horodatages || []).map(Number).filter((t) => maintenant - t < fenetreMs);
      const permis = gardes.length < max;
      if (permis) gardes.push(maintenant);
      await client.query('update rate_limits set horodatages = $2, fin = $3 where cle = $1',
        [cle, gardes, (gardes[gardes.length - 1] || maintenant) + fenetreMs]);
      await client.query('commit');
      return permis ? null : Math.max(1, Math.ceil((fenetreMs - (maintenant - gardes[0])) / 1000));
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  },

  async limitesReinitialiser() { await q('delete from rate_limits'); },

  // Sans cette purge, la table garderait une ligne par compte et par action pour toujours — y
  // compris celles de comptes effacés depuis longtemps.
  async purgerLimites(maintenant = Date.now()) {
    const { rowCount } = await pool.query('delete from rate_limits where fin < $1', [maintenant]);
    return rowCount;
  },

  // Lectures en vrac. La découverte a besoin, pour chaque candidat, de savoir s'il est bloqué,
  // si je l'ai déjà balayé et s'il m'a liké. Poser ces trois questions par candidat ferait
  // N allers-retours vers PostgreSQL ; on charge les trois relations une fois, et le filtre
  // redevient local. C'est la différence entre une requête et trois cents.
  blocksOf: async (id) => (await q('select from_id, to_id from blocks where from_id = $1 or to_id = $1', [String(id)]))
    .map((r) => (r.from_id === String(id) ? r.to_id : r.from_id)),
  swipesFrom: async (id) => (await q('select * from swipes where from_id = $1', [String(id)])).map(versSwipe),
  swipesTo: async (id) => (await q('select * from swipes where to_id = $1', [String(id)])).map(versSwipe),

  // ---------- Likes et matchs ----------
  hasSwiped: async (from, to) => !!(await un('select 1 from swipes where from_id = $1 and to_id = $2', [String(from), String(to)])),

  async addSwipe(from, to, action) {
    await q(
      `insert into swipes (from_id, to_id, action, at) values ($1, $2, $3, $4)
       on conflict (from_id, to_id) do update set action = excluded.action, at = excluded.at`,
      [String(from), String(to), action, Date.now()],
    );
  },

  likedBy: async (from, to) => !!(await un("select 1 from swipes where from_id = $1 and to_id = $2 and action = 'like'", [String(from), String(to)])),

  swipeOf: async (from, to) => versSwipe(await un('select * from swipes where from_id = $1 and to_id = $2', [String(from), String(to)])),

  // Rattrapage depuis la liste : un « Passer » peut devenir un « J'aime ». La date est mise à jour,
  // donc ce nouveau choix compte dans le quota du jour comme n'importe quel balayage.
  async updateSwipe(from, to, action) {
    const r = await un('update swipes set action = $3, at = $4 where from_id = $1 and to_id = $2 returning from_id', [String(from), String(to), action, Date.now()]);
    return !!r;
  },

  // Revenir sur un balayage (voir store.json.js).
  async removeSwipe(from, to) {
    return versSwipe(await un('delete from swipes where from_id = $1 and to_id = $2 returning *', [String(from), String(to)]));
  },

  matchBetween: async (a, b) => versMatch(await un('select * from matches where pair_key = $1', [pairKey(a, b)])),

  // Nombre de lignes de balayage, tous types confondus : sert à vérifier qu'un rattrapage réutilise
  // la ligne existante au lieu d'en créer une seconde.
  swipesCount: async (from) => Number((await un('select count(*)::int as n from swipes where from_id = $1', [String(from)])).n),

  // Seuls les « J'aime » comptent dans le quota : passer un profil qui ne convient pas ne doit pas
  // coûter une journée de découverte.
  async swipesToday(from) {
    const debut = new Date();
    debut.setHours(0, 0, 0, 0);
    const r = await un("select count(*)::int as n from swipes where from_id = $1 and action = 'like' and at >= $2", [String(from), debut.getTime()]);
    return Number(r.n);
  },

  async createMatch(a, b) {
    const key = pairKey(a, b);
    const [x, y] = [String(a), String(b)].sort();
    // do nothing puis relecture : deux likes simultanés ne créent qu'un match, et les deux
    // requêtes repartent avec le même.
    await q(
      `insert into matches (id, pair_key, user_a, user_b, created_at) values ($1, $2, $3, $4, $5)
       on conflict (pair_key) do nothing`,
      [newId(), key, x, y, Date.now()],
    );
    return versMatch(await un('select * from matches where pair_key = $1', [key]));
  },

  getMatch: async (id) => versMatch(await un('select * from matches where id = $1', [id])),
  matchesOf: async (uid) => (await q('select * from matches where user_a = $1 or user_b = $1', [String(uid)])).map(versMatch),

  // ---------- Lecture et présence ----------
  async markRead(matchId, userId) {
    await q('update matches set read_at = read_at || jsonb_build_object($2::text, $3::bigint) where id = $1', [matchId, String(userId), Date.now()]);
  },

  async unreadCount(matchId, userId) {
    const r = await un(
      `select count(*)::int as n from messages m
       where m.match_id = $1 and m.from_id <> $2 and m.deleted_at is null
         and m.at > coalesce((select (read_at->>$2)::bigint from matches where id = $1), 0)`,
      [matchId, String(userId)],
    );
    return Number(r.n);
  },

  hasOpened: async (matchId, userId) => !!(await un('select 1 from matches where id = $1 and read_at ? $2', [matchId, String(userId)])),

  touchPresence: (userId, matchId) => presence.set(`${userId}:${matchId}`, Date.now()),
  leavePresence: (userId) => { for (const k of presence.keys()) if (k.startsWith(`${userId}:`)) presence.delete(k); },
  purgerPresence: async (delaiMs = 10 * 60 * 1000) => {
    const limite = Date.now() - delaiMs;
    for (const [k, at] of presence) if (at < limite) presence.delete(k);
    // La frappe vit six secondes : tout ce qui traîne ici est mort depuis longtemps.
    for (const [k, at] of frappe) if (at < limite) frappe.delete(k);
  },
  isViewing: (userId, matchId, withinMs = 10000) => Date.now() - (presence.get(`${userId}:${matchId}`) || 0) < withinMs,

  // ---------- Qui est en train d'écrire ----------
  //
  // Éphémère par construction, et **jamais stocké** : une carte en mémoire, comme la présence,
  // qui meurt avec le processus. Savoir qu'une personne hésite au-dessus de son clavier n'a
  // aucune raison de survivre à un redémarrage, et encore moins de finir dans une sauvegarde.
  // Le mot arrive par l'interrogation qui partait déjà (`?ecrit=1`) : aucune requête de plus.
  touchTyping: (userId, matchId) => frappe.set(`${userId}:${matchId}`, Date.now()),
  isTyping: (userId, matchId, withinMs = 6000) => Date.now() - (frappe.get(`${userId}:${matchId}`) || 0) < withinMs,

  // ---------- Activité ----------
  // Un seul horodatage par personne, jamais exposé brut. Écrit au plus une fois par minute :
  // la condition est dans le where, donc c'est la base qui tranche, pas une lecture préalable.
  async touchActivity(userId) {
    await q(
      `update users set data = data || jsonb_build_object('lastActiveAt', $2::bigint)
       where id = $1 and coalesce((data->>'lastActiveAt')::bigint, 0) < $3`,
      [String(userId), Date.now(), Date.now() - 60000],
    );
  },

  // ---------- Messages ----------
  messagesOf: async (matchId) => (await q('select * from messages where match_id = $1 order by at', [matchId])).map(versMessage),

  async addMessage(matchId, from, text, { replyTo, photo } = {}) {
    const msg = { id: newId(), from: String(from), text, at: Date.now(), ...(replyTo ? { replyTo: String(replyTo) } : {}), ...(photo ? { photo: true } : {}) };
    await q('insert into messages (id, match_id, from_id, text, at, reply_to, photo) values ($1, $2, $3, $4, $5, $6, $7)', [msg.id, matchId, msg.from, text, msg.at, msg.replyTo || null, !!photo]);
    return msg;
  },

  // Le sien seulement ; la ligne reste, marquée (voir store.json.js).
  async supprimerMessage(matchId, messageId, from) {
    const r = await un(
      'update messages set deleted_at = coalesce(deleted_at, $4) where match_id = $1 and id = $2 and from_id = $3 returning *',
      [matchId, String(messageId), String(from), Date.now()],
    );
    return r ? versMessage(r) : null;
  },

  // ---------- Mesure ----------
  // Voir audit/05-mesure-produit.md : aucun texte, aucun identifiant nouveau, et rien du tout
  // quand EVENTS_RETENTION_DAYS vaut 0.
  async addEvent(k, u, p) {
    if (!config.eventsRetentionDays) return null;
    const e = { id: newId(), u: u === null || u === undefined ? null : String(u), k: String(k), at: Date.now(), p: p && Object.keys(p).length ? p : null };
    await q('insert into events (id, u, k, at, p) values ($1, $2, $3, $4, $5::jsonb)', [e.id, e.u, e.k, e.at, e.p && JSON.stringify(e.p)]);
    return versEvent(e);
  },

  async events({ depuis = 0, k = null } = {}) {
    const lignes = k
      ? await q('select * from events where at >= $1 and k = $2 order by at asc', [depuis, k])
      : await q('select * from events where at >= $1 order by at asc', [depuis]);
    return lignes.map(versEvent);
  },

  // ---------- Paiements ----------
  // `charge_id` est unique en base : deux livraisons du même paiement ne créditent qu'une fois,
  // et la seconde rend la ligne de la première (do nothing, puis lecture).
  async addPaiement({ userId, chargeId, source, jours, stars }) {
    const p = { id: newId(), userId: String(userId), chargeId: String(chargeId), source, jours: Number(jours), stars: Number(stars), statut: 'paye', at: Date.now() };
    const r = await q(
      'insert into paiements (id, user_id, charge_id, source, jours, stars, statut, at) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (charge_id) do nothing returning *',
      [p.id, p.userId, p.chargeId, p.source, p.jours, p.stars, p.statut, p.at],
    );
    if (r.length) return versPaiement(r[0]);
    return { ...versPaiement(await un('select * from paiements where charge_id = $1', [p.chargeId])), deja: true };
  },
  async paiementParCharge(chargeId) { const r = await un('select * from paiements where charge_id = $1', [String(chargeId)]); return r ? versPaiement(r) : null; },
  async paiementsDe(userId) { return (await q('select * from paiements where user_id = $1 order by at desc', [String(userId)])).map(versPaiement); },
  async marquerRembourse(chargeId) {
    const r = await un("update paiements set statut = 'rembourse', rembourse_le = $2 where charge_id = $1 and statut <> 'rembourse' returning *", [String(chargeId), Date.now()]);
    return r ? versPaiement(r) : null;
  },
  async paiements() { return (await q('select * from paiements order by at asc')).map(versPaiement); },

  // Ce qui a dépassé la durée de conservation s'en va, y compris les lignes sans identifiant.
  async purgerEvenements(jours = config.eventsRetentionDays) {
    if (!jours) return 0;
    const limite = Date.now() - jours * 24 * 3600 * 1000;
    const { rowCount } = await pool.query('delete from events where at < $1', [limite]);
    return rowCount;
  },

  // ---------- Signalements et blocages ----------
  async addReport(report) {
    await q('insert into reports (id, data, at) values ($1, $2::jsonb, $3)', [newId(), JSON.stringify(report), Date.now()]);
  },

  // Du plus ancien au plus récent : la modération lit une file, pas un journal à l'envers.
  reports: async () => (await q('select id, data, at from reports order by at asc')).map((r) => ({ id: r.id, at: Number(r.at), ...r.data })),

  // Ouvrir un fil de discussion signalé laisse une trace sur le signalement : qui a lu, quand.
  // Sans elle, lire les messages de deux personnes ne coûterait rien à personne.
  async marquerSignalementLu(id, par) {
    const r = await un(
      `update reports
          set data = jsonb_set(data, '{lectures}', coalesce(data->'lectures', '[]'::jsonb) || $2::jsonb)
        where id = $1
    returning id, data, at`,
      [id, JSON.stringify([{ par: String(par), at: Date.now() }])],
    );
    return r && { id: r.id, at: Number(r.at), ...r.data };
  },

  // Défaire un match : la discussion, ses messages et ses rendez-vous disparaissent des deux côtés.
  // Les balayages restent, pour que les deux personnes ne se revoient pas en découverte.
  async removeMatch(matchId) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('delete from messages where match_id = $1', [matchId]);
      await client.query('delete from dates where match_id = $1', [matchId]);
      const r = await client.query('delete from matches where id = $1 returning id', [matchId]);
      await client.query('commit');
      supprimerLesPhotosDuChat(config.uploadsDir, matchId);
      return r.rowCount > 0;
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  },

  async block(from, to) {
    await q('insert into blocks (from_id, to_id, at) values ($1, $2, $3) on conflict do nothing', [String(from), String(to), Date.now()]);
  },

  isBlocked: async (a, b) => !!(await un(
    'select 1 from blocks where (from_id = $1 and to_id = $2) or (from_id = $2 and to_id = $1)',
    [String(a), String(b)],
  )),

  // ---------- Rendez-vous ----------
  async addDate(date) {
    const { matchId, ...reste } = date;
    const d = { id: newId(), createdAt: Date.now(), arrivals: {}, ...reste };
    try {
      await q('insert into dates (id, match_id, data) values ($1, $2, $3::jsonb)', [d.id, matchId, JSON.stringify(d)]);
    } catch (e) {
      // L'index partiel dates_vivant (migration 005) : un seul rendez-vous vivant par discussion,
      // même quand les deux personnes proposent au même instant.
      if (e.code === '23505') return null;
      throw e;
    }
    return { ...d, matchId };
  },

  getDate: async (id) => versDate(await un('select * from dates where id = $1', [id])),
  datesOfMatch: async (matchId) => (await q("select * from dates where match_id = $1 order by (data->>'createdAt')::bigint", [matchId])).map(versDate),

  // updatedAt permet à la discussion de savoir qu'un rendez-vous a bougé sans renvoyer les
  // rendez-vous à chaque interrogation.
  async updateDate(id, patch) {
    const { id: _i, matchId: _m, ...reste } = patch;
    return versDate(await un(
      'update dates set data = data || $2::jsonb where id = $1 returning *',
      [id, JSON.stringify({ ...reste, updatedAt: Date.now() })],
    ));
  },
};
