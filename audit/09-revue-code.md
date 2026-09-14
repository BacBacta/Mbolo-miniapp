# Odo — revue du code : trous, faiblesses, failles

Revue globale du 14 septembre 2026, sur `main` à `17085e1`. Elle ne parle pas des écrans ni du
parcours (`audit/03-*`, `audit/04-risques.md`) : elle lit **le code**, et ne retient que ce qui a un
fichier, une ligne et un scénario d'échec. Chaque constat sérieux a été relu de bout en bout, et ceux qui
disent « rejoué » ont été **exécutés contre l'application** avant d'être écrits ici.

Ce qu'elle n'est pas : une preuve d'absence. Elle dit ce qui a été trouvé, pas ce qui n'existe pas.

---

## 0. Règles de ce fichier

- **Critique** : un membre ordinaire, ou personne, peut éteindre la production, contourner une
  promesse de sécurité de la section 1 de `CLAUDE.md`, ou agir au nom d'un autre. À corriger avant
  toute ouverture.
- **Important** : la promesse tient sur le chemin nominal mais pas sur un chemin voisin, ou une
  donnée personnelle sort de là où la page de confidentialité la range. À corriger avant la bêta.
- **Mineur** : durcissement, dette, cas limite. À planifier, sans urgence.

Un constat = fichier, ligne, ce qui se passe, comment on le déclenche, et le correctif en une ou
deux phrases. Les numéros de ligne sont ceux de `17085e1`.

---

## 1. Critique : à corriger avant tout le reste

### C1. N'importe quel membre vérifié éteint le serveur avec un statut de rendez-vous

`server/routes.js:883` : `const changement = CHANGEMENTS[statut];` — `CHANGEMENTS` est un objet
ordinaire, donc `CHANGEMENTS['constructor']` est une fonction, donc « vrai ». Le contrôle
`if (!changement)` passe. Rejoué : `PUT /api/dates/:id` avec `{ "status": "constructor" }` sur un
rendez-vous accepté répond 200, la base porte `status: 'constructor'` (le rendez-vous n'est plus
« vivant », plus de check-in possible, l'autre n'est pas prévenu), puis `notify()` (`routes.js:899`,
lancé sans `await`) appelle `t(lang, undefined)` (`server/bot.js:31`), `s.split` lève une
`TypeError` **hors** du `try` de `notify`, et la promesse rejetée n'est rattrapée par personne :
**Node arrête le processus**. Fly redémarre la machine ; la requête suivante la rééteint. Limite :
10 par heure et par compte (`rendezvous`), soit largement assez.

Le même mécanisme attend derrière chaque `notify()` et `direATiers()` appelés sans `await` ni
`.catch()` : `routes.js:657, 663, 787, 856, 900, 909, 932, 936, 972`. Leurs deux premières lignes
(`store.getUser`, `store.updateUser`) sont hors du `try` : **une base injoignable pendant l'envoi
d'un message éteint aussi le serveur**, sans attaquant.

**Correctif** : `Object.hasOwn(CHANGEMENTS, statut)` ; un `.catch()` qui journalise sur chaque
notification lancée en arrière-plan (ou une fonction `enArrierePlan(promesse)` unique) ;
`process.on('unhandledRejection', …)` qui journalise au lieu de tomber — ce n'est pas un
remplacement des deux premiers, c'est le filet du jour où l'on en oublie un. Test : un statut
`constructor`, `__proto__`, `toString` doit répondre 400 et laisser le rendez-vous intact.

### C2. Un cookie malformé, sans aucune authentification, éteint le serveur

`server/session.js:51` : `decodeURIComponent(morceau.slice(i + 1).trim())` lève `URIError` sur
`%E0%A4%A` ou un simple `%`. `requireModerateur` (`server/moderation.js:80`) l'appelle depuis une
fonction `async` posée telle quelle sur `modApi` (`moderation.js:99-138`), qui **n'a pas** l'enveloppe
que `routes.js:26-33` pose sur `api`. Rejoué : `GET /api/mod/me` avec `Cookie: mod_session=%` →
`URIError: URI malformed`, processus terminé, code 1. Aucun compte requis, aucune limite de débit
(les compteurs sont indexés par compte). Une boucle de requêtes tient la production éteinte.

**Correctif** : `try { return decodeURIComponent(…) } catch { return null; }` dans `lireCookie`, et
la même enveloppe de promesses sur `modApi` que sur `api` (la boucle sur les verbes est à copier
ou à sortir dans un module partagé). Test : le cookie `%` doit répondre 401.

### C3. `POST /api/swipes` ne regarde pas la cible : blocage contourné, match ressuscité

`server/routes.js:634-666` : la route vérifie que la cible existe, que l'action est `like` ou
`pass`, et que ce n'est pas soi-même. Rien d'autre : ni `isApproved(target)`, ni `isBlocked`, ni
`compatible()`, ni `dansLaZone`. Et `createMatch` (`store.json.js:302`, `store.pg.js:337`) ne
refuse pas une paire bloquée. Rejoué, trois scénarios :

- **Après un blocage** : F bloque H (`/blocks` défait le match, sans accusation — c'est la promesse).
  H renvoie `{ targetId: F, action: 'like' }`. Le like de F existe toujours en base → `likedBy` est
  vrai → **le match est recréé** et F reçoit « Nouveau match : H et toi, vous vous plaisez ». La
  notification n'a pas de clé de ralentissement ; la limite `swipe` autorise 60 appels par minute.
  Le blocage, seule protection silencieuse de l'app, devient un canal de harcèlement nominatif.
- **Après un match défait** : mêmes swipes conservés, mêmes conséquences.
- **Like par identifiant** d'un compte non vérifié, fermé, d'une autre ville, ou du même genre en
  « Relation sérieuse » sous `romance_opposite` : accepté. Sur un compte sans profil,
  `target.profile.city` (ligne 663) lève une `TypeError` → 500.

**Correctif** : dans `/swipes`, charger `relations(me)` et refuser si la cible n'est pas
`joignable` (le même filtre que la découverte) ; ne pas renotifier si `matchBetween` existe déjà ;
garder une trace des paires défaites (même forme que `blocks`, sans notification) que `createMatch`
et `/swipes` respectent — sinon un simple like refait ce qu'un « défaire » a défait. Test : un
like après blocage doit répondre 403 et n'envoyer aucune notification.

### C4. Le webhook Telegram n'est protégé que par son adresse

`server/bot.js:507-510` : `/telegram/<identifiant du bot>-<ADMIN_KEY ou "hook">`, puis
`setWebhook(url)` **sans `secret_token`** et `webhookCallback(bot, 'express')` **sans
`secretToken`**. L'identifiant du bot est public. Sans `ADMIN_KEY` (`config.js:39` ne tire rien au
hasard ; seul `deployer-fly.sh:83` le fait — pas `render.yaml`, pas le `docker run` du guide,
`.env.example` propose `change-moi`), le chemin est devinable. Avec, le secret voyage dans l'URL de
chaque mise à jour, donc dans les journaux de l'hébergeur — c'est le constat de `CLAUDE.md` sur le
14 septembre, et il n'a pas été corrigé, seulement documenté.

Scénario : `POST` sur ce chemin d'un `callback_query` forgé, `message.chat.id = ADMIN_CHAT_ID`
(la valeur figure dans les journaux, `bot.js:92`), `data = "approve:<id>"`. La seule garde
(`bot.js:377`, `String(ctx.chat?.id) !== String(config.adminChatId)`) compare une valeur **fournie
par l'attaquant**. Résultat : un compte vérifié sans qu'aucun humain n'ait vu le selfie, un compte
fermé (`ban:`), ou un `/moderation` au nom d'un administrateur. Aujourd'hui, sur Fly, `ADMIN_KEY`
est posé et aléatoire : la porte est fermée par une chaîne dans une URL, pas par un contrôle.

**Correctif** : un `WEBHOOK_SECRET` dédié (ajouté à `SECRETS_DISTINCTS` dans `server/secrets.js`),
`setWebhook(url, { secret_token })`, `webhookCallback(bot, 'express', { secretToken })` — Telegram
le renvoie dans l'en-tête `X-Telegram-Bot-Api-Secret-Token`, jamais dans l'URL ; chemin sans secret ;
en production avec `USE_WEBHOOK`, refus de démarrer sans lui (`test/production.test.js`).

### C5. En mode webhook, toute erreur d'un gestionnaire du bot éteint le serveur

`server/bot.js:508` : `app.use(secretPath, webhookCallback(bot, 'express'))`. Dans grammY,
`handleUpdate` (`node_modules/grammy/out/bot.js:241-243`) attrape l'erreur d'un gestionnaire et la
**relance** en `BotError` ; `bot.catch` (`server/bot.js:452`) n'est appelé que par la boucle
d'interrogation longue (`handleUpdates`), **jamais en mode webhook**. `webhookCallback` ne l'attrape
pas non plus (`webhook.js:88`), Express 4 ignore la promesse rejetée, et Node arrête le processus.
Reproduit : sortie code 1. La production est en webhook (`fly.toml:19`). Le délai de 10 s a le même
effet (`onTimeout: "throw"` par défaut).

Ce qui le déclenche sans attaquant : `ctx.reply` refusé par Telegram (`/id` ou `/start` dans un
groupe où le bot ne peut pas écrire, un 429), `ctx.answerCallbackQuery` sur une requête « too old »
après un `decideVerification` un peu long (`bot.js:379-383`), `ctx.editMessageText` dans `conf:`
(`:430, :434`), un téléchargement de voix qui dépasse 10 s (`:337-341`, `fetch` sans délai). Chaque
cas éteint l'app pour tout le monde.

**Correctif** : `webhookCallback(bot, 'express', { onTimeout: 'return', timeoutMilliseconds:
25_000, secretToken })` enveloppé — `app.use(secretPath, (req, res, next) => wh(req, res).catch(next))` —
et une route d'erreur qui répond 200 à Telegram (sinon il renvoie la même mise à jour en boucle),
en journalisant par `bot.errorHandler`. Test : un gestionnaire qui jette, une mise à jour envoyée
sur le chemin, le serveur toujours debout et Telegram ayant reçu 200.

---

## 2. Important : avant la bêta

### I1. Le lien de modération « à usage unique » sert de cookie de session

`server/session.js:19-42` : un seul format signé, sans champ de type. Le lien est
`signer({ id, u }, 600 s)` (`moderation.js:54`), la session est `signer({ id }, 12 h)`
(`moderation.js:329`), et `requireModerateur` (ligne 81) comme la page (ligne 332) ne lisent que
`session?.id`. Rejoué : coller la valeur de `?jeton=` dans `Cookie: mod_session=…` → `GET
/api/mod/me` répond 200 **avant** l'échange, et **encore après** que le lien a été consommé (le
second `?jeton=` renvoie bien 403). Le contrôle `modJeton` est contourné ; le lien vaut dix minutes
de session pour qui l'a vu (journal d'accès du `GET /moderation?jeton=`, message Telegram
transféré). Le même défaut attend les sessions de paiement de 30 jours prévues sur le même secret.

**Correctif** : un champ `k: 'lien' | 'session'` dans le corps signé, vérifié des deux côtés — ou
deux clés HMAC dérivées par usage.

### I2. Les listes fermées sont lues par `OBJET[valeur]` : les clés du prototype passent

`server/routes.js:192` `GENDERS[b.gender]`, `:193` `INTENTS[b.intent]`, `:98` `valeurs[v]`
(compatibilité), `:458` `GENDERS[g]` (filtres). Rejoué : `gender: 'constructor'` est enregistré
(200). Conséquence sous `romance_opposite` : `compatible()` (`routes.js:509`) teste
`a.gender === b.gender`, jamais vrai → ce profil **voit femmes et hommes et est servi aux deux**,
sans que la carte le montre (le genre n'est pas dans `publicProfile`). C'est la règle qui protège
juridiquement les membres au Cameroun (règle 5.2), et elle se contourne avec un mot. Sous la
politique levée, `filters.gender = 'valueOf'` est stocké tel quel.

**Correctif** : `Object.hasOwn()` partout où une liste fermée est interrogée (ou des `Map`), et un
test qui envoie `constructor`, `__proto__`, `toString`, `valueOf` sur chaque champ à liste fermée.
Même famille que C1.

### I3. Un compte supprimé est recréé dans la seconde

`public/app.js:1922-1926` : `await api('/me', { method: 'DELETE' }); … tg.close(); S.me = await
api(ME());`. Or `requireAuth` fait un *upsert* à chaque requête (`server/auth.js:65` →
`upsertTelegramUser`, `store.json.js:62-67` crée la ligne). Trois chemins refont donc une ligne
`users` (identifiant Telegram, prénom, langue, `createdAt`, plus un `app_opened`) juste après la
suppression : l'appel explicite de la ligne 1925 (toujours hors Telegram ; sur Desktop et Web,
`close()` n'interrompt pas le script), le `summaryTimer` de l'onglet Profil (`app.js:267`, toutes
les 20 s, jamais arrêté avant le `DELETE`), et `leavePresence()` sur `pagehide` (`app.js:1979-1988`),
déclenché précisément par la fermeture. La page de confidentialité promet une suppression
complète ; la base garde une ligne.

**Correctif** : avant le `DELETE`, arrêter le minuteur et poser `S.supprime = true` que `api()` et
`leavePresence()` respectent ; ne plus rappeler `/me` après ; côté serveur, `POST /presence/leave`
ne devrait pas créer de compte (un `getUser` sans upsert suffit à cette route). Test de bout en
bout : après suppression, `store.getUser(id)` doit rester `undefined` pendant 30 s.

### I4. Les signalements et la personne de confiance survivent à `DELETE /api/me`

`server/store.json.js:105-129` et `server/store.pg.js:124-152` : `deleteUser` efface selfie,
photos, voix, événements, swipes, blocages, matchs, messages, rendez-vous, et **pas `reports`**. Un
signalement porte `from` et `targetId` (deux identifiants Telegram), `reason`, `matchId`,
`lectures`, et il n'existe aucune purge de cette table. Qui signale puis supprime son compte
laisse son identifiant dans `/moderation` pour toujours. Même trou pour `confiance` : si un membre
est la personne de confiance d'un autre et efface son compte, `confiance.id` et `confiance.prenom`
restent chez l'autre.

**Correctif** : dans `deleteUser`, effacer les signalements émis, anonymiser `targetId` sur les
signalements reçus (un compte fermé ne peut pas appeler la route, donc les signalements contre un
banni restent), retirer `confiance` là où `confiance.id` est l'identifiant supprimé ; une durée de
conservation des signalements dans la purge des six heures. Aucun test n'appelle `deleteUser`
directement aujourd'hui : en ajouter un dans `test/stockage.test.js`.

### I5. Un selfie jamais tranché reste dans le groupe, avec son bouton « Valider » actif

`purgerVerificationsOubliees` (`store.json.js:135-152`, `store.pg.js:156-169`) efface le fichier du
volume et remet le compte en attente. Mais le `message_id` du `sendPhoto` (`bot.js:159`) n'est
stocké nulle part : rien ne peut retirer la photo du groupe. Et `decideVerification`
(`bot.js:229-238`) écrit la décision **sans regarder l'état** : selfie A oublié puis purgé, la
personne renvoie un selfie B, un modérateur clique « Valider » sous le vieux message A → compte
approuvé sans que B ait été regardé. Après `DELETE /api/me`, le selfie en attente reste aussi
visible dans le groupe jusqu'à ce que quelqu'un clique. La promesse « selfie supprimé après la
décision » tient pour le disque, pas pour Telegram.

**Correctif** : garder `verifMessageId` à l'envoi ; purge et `deleteUser` appellent `deleteMessage`
(secours : `editMessageCaption` sans clavier) ; `decideVerification` refuse si
`user.verification !== 'pending'` et répond « déjà tranché ou expiré » au bouton.

### I6. L'identifiant public d'un membre est son identifiant Telegram, et les fichiers se servent par identifiant

`server/routes.js:59` : `publicProfile` renvoie `id: user.id`, qui est l'identifiant Telegram
(`auth.js`), dans chaque carte, chaque match, chaque `messages[].from`. Un membre peut ouvrir
`tg://user?id=<id>` : selon les réglages de l'autre, il voit sa fiche Telegram et peut lui écrire
**hors de l'app**, hors `antiscam.js`. La promesse « pseudos et numéros jamais montrés » tient à
la configuration de confidentialité de chacun, pas à l'app.

`routes.js:470-499` : `servePhoto` et `/voix/:userId` exigent que **le demandeur** soit vérifié
et qu'il n'y ait pas de blocage. Rien sur la cible. Un membre vérifié récupère donc, pour tout
identifiant (numérique, énumérable), les photos validées d'un compte en attente, **fermé**, ou
d'une autre ville — et confirme qu'une personne précise est inscrite sur une app de rencontres, ce
qui, dans le contexte visé, est une fuite en soi.

**Correctif** : un identifiant public opaque (aléatoire, comme `newId()`), résolu côté serveur ;
sur `/photos` et `/voix`, exiger `isApproved(target)`, `!target.banned`, et que la cible soit
joignable ou en match avec le demandeur. C'est un changement de forme d'API : à faire tôt.

### I7. La ville échappe à l'anti-arnaque

`server/routes.js:198-205` : `profileText` contrôle le prénom, le quartier, la réponse libre et les
langues — **pas `city`** (40 caractères libres ; `villeAffichee` garde les chiffres). `city: "677 12
34 56"` passe `cleVille().length >= 2` et s'affiche sur la carte de tous ceux qui cherchent « tout
le pays », avant tout échange. **Correctif** : ajouter `city` (et `country`) au texte contrôlé.

### I8. La politique de sécurité de contenu ne protège pas contre l'injection

`server/index.js:96` : `Content-Security-Policy: frame-ancestors …` et rien d'autre. Toute
l'interface passe par `innerHTML` (`app.js:273`). Aujourd'hui chaque champ d'un autre membre passe
par `esc()` (vérifié, voir section 4) ; le jour où un seul l'oublie, un script injecté lit
`tg.initData()` (valable 24 h) et l'envoie où il veut. Ce qui empêche une politique stricte :
`onload="…"` dans `public/index.html:17`, un `<script>` en ligne dans `server/legal/*.html` et
`server/moderation.js:223`, neuf attributs `style="…"` (`app.js` ×3, `ui.js` ×6). Pas de
`Strict-Transport-Security` non plus (à poser si Fly ne l'ajoute pas).

**Correctif** : `default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'
https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self'
blob: data:; media-src blob:; connect-src 'self'; base-uri 'none'; form-action 'self';
frame-ancestors …`, après avoir sorti le `onload` et les scripts en ligne dans des fichiers servis.

### I9. Interface : deux courses, et des identifiants non encodés

- `public/app.js:1087-1107` : après `await api('/matches/'+id)`, la garde est `S.screen !==
  'chat'`, pas l'identifiant. Ouvrir A (réseau lent), revenir, ouvrir B : B s'affiche, puis la
  réponse de A arrive, `S.chat = A`, et **`sendMessage()` envoie à A** (`app.js:1668`) sous le nom
  de B. Chaque réponse tardive pose aussi un `setInterval(pollChat)` de plus sans effacer le
  précédent : polling doublé, jamais arrêté. Correctif : jeton de requête (`++S.chatJeton`,
  comparé après l'`await`) et `clearInterval` avant de reposer.
- `app.js:1109-1117` (`date()`) : aucune garde après `await api('/venues…')`. Revenir à la
  discussion et taper pendant les 12 s de délai : `render()` remplace tout, clavier fermé, texte
  perdu — la règle 16 contournée par un chemin voisin. Même motif dans `verify()` (`:835-843`).
  Correctif : `if (S.screen !== 'date') return;` comme `discover()` le fait déjà.
- `app.js:1092, 1416, 1650, 1668, 1688, 1705, 1719, 1780` : chemins d'API composés sans
  `encodeURIComponent`, alors que `match` vient de `tg.launchParams()` (`start_param`, non vérifié
  côté client). `?screen=chat&match=../../me` fait un `fetch('/api/me')` que `renderChat()` ne sait
  pas afficher : écran blanc sans « Réessayer ». Portée limitée (même jeton), mais c'est la seule
  entrée externe qui atteint un chemin sans filtre. Correctif : encoder, et n'accepter que
  `/^[a-f0-9]{16}$/` dans `boot()`.

### I10. Chaîne de déploiement : actions non épinglées, entrées non validées

- `.github/workflows/deploy-fly.yml:33`, `postgres.yml:60`, `sauvegarde.yml:39` :
  `superfly/flyctl-actions/setup-flyctl@master`. Branche mutable, dans des travaux qui portent
  `FLY_API_TOKEN`, `BOT_TOKEN`, `ADMIN_KEY`, `ADMIN_CHAT_ID`, `WEB_SESSION_SECRET`. Aucun bloc
  `permissions:` dans les quatre fichiers. Correctif : épingler par SHA (ou `curl` + somme de
  contrôle), `permissions: contents: read` en tête.
- `sauvegarde.yml:51` : `--garder ${{ inputs.garder || '14' }}` inséré tel quel dans une commande
  exécutée **en root sur la machine de production** par `flyctl ssh console`. `deploy-fly.yml:43` et
  `postgres.yml:68` entourent leurs entrées de guillemets simples, qu'une apostrophe rompt. Qui peut
  déclencher un travail (accès en écriture au dépôt) exécute ce qu'il veut sur la production.
  Correctif : passer les entrées par `env:` et les valider (`^[0-9]+$`, `^[a-z0-9-]+$`) avant usage.

### I11. Aucun arrêt propre, et le fichier JSON s'écrit sans `fsync`

`server/index.js` : aucun `process.on('SIGTERM')`. `fly.toml:41-43` arrête la machine dès qu'elle
est inactive : les requêtes en cours sont coupées, `pool.end()` n'est jamais appelé, et en mode
fichier la fenêtre de 200 ms de `save()` (`store.json.js:50-57`) est perdue — un match accepté en
200 puis disparu. `save()` n'appelle ni `fsync` ni `try/catch` : une coupure laisse un `db.json`
tronqué, et le démarrage repart sur une base **vide** (`store.json.js:38-44`) ; un disque plein
(`ENOSPC`) dans le minuteur est une exception non rattrapée. `markRead` (`store.json.js:336-341`)
resérialise le fichier entier toutes les 4 s par discussion ouverte. La production est sur
PostgreSQL : c'est important pour le mode fichier, mineur aujourd'hui. `store.pg.js:22` : aucun
`pool.on('error')` — une connexion inactive coupée par le serveur émet `error` sans écouteur, et
c'est une exception non capturée.

**Correctif** : gestionnaire de signal (`server.close()`, vidage synchrone, `pool.end()`),
`kill_timeout = "10s"` dans `fly.toml`, `fsync` fichier puis dossier, `try/catch` journalisé,
`pool.on('error', …)`, et `markRead` sans écriture si rien n'a changé.

### I12. La restauration se fait à chaud

`scripts/restaurer.js:111-137` : `delete` puis `insert` dans une transaction pendant que l'app
tourne (`DEPLOIEMENT.md` la lance par `flyctl ssh console` sans arrêter la machine). Une écriture
concurrente entre dans la transaction (clé dupliquée → `rollback`) ou est effacée, et le recomptage
peut échouer sur une ligne écrite après. Correctif : exiger `flyctl scale count 0` avant
`--ecraser`, ou un drapeau explicite qui le dit.

### I13. Les boutons Valider, Refuser, Fermer obéissent à tout membre du groupe, pas aux administrateurs

`server/bot.js:366, 377, 390, 400, 410` : la seule garde est `String(ctx.chat?.id) !==
String(config.adminChatId)`. Tout membre du groupe de modération, administrateur ou non, valide un
selfie ou ferme un compte, alors que l'espace web exige `estAdministrateur` (`moderation.js:82`) et
que `CLAUDE.md` fait de ce droit la règle. `administrateurs()` (cache 60 s, repli 10 min) existe et
n'est pas utilisée ici. Tant que le groupe ne compte que des administrateurs, rien ne se voit ; le
jour où l'on y ajoute quelqu'un « pour regarder », il décide.

**Correctif** : `if (!(await estAdministrateur(ctx.from.id))) return ctx.answerCallbackQuery(…)`
dans les cinq gestionnaires, et un test avec un membre non administrateur.

### I14. Devenir personne de confiance sans avoir reçu le lien

`server/bot.js:417-433` : `conf:oui:<id du membre>` vérifie qu'une invitation est **ouverte**
(`membre.confianceCode` existe) mais ne compare jamais le code, qui n'est pas dans la donnée du
bouton (`bot.js:286`). Telegram ne garantit pas qu'une `callback_data` corresponde à un bouton
existant : un client modifié envoyant `conf:oui:<id>` pendant les 24 h d'une invitation devient
personne de confiance **sans le lien**, et reçoit ensuite lieu, heure et « je pars maintenant ».
Le message « Ce compte n'existe plus » (`:421`) sert au passage d'oracle d'existence de compte.

**Correctif** : mettre le code dans le bouton (`conf:oui:<code>`) et retrouver le membre par
`porteurDuCode` — le code est aléatoire, à usage unique, et déjà consommé à la réponse.

### I15. Anti-arnaque : ce qui passe aujourd'hui, rejoué

`server/antiscam.js`, corpus d'environ 390 messages rejoués avec la signature réelle
(`checkMessage(texte, 0, 10)`). Ce n'est pas la limite documentée (numéros en toutes lettres,
autres langues) : ce sont des messages ordinaires, en français, que la règle vise et manque.

- **Le tiret est supprimé au lieu d'être remplacé** (`antiscam.js:25`, `.replace(/[.\-_*]/g, '')`)
  et les verbes sont écrits sans accent (`:107`) alors que le texte brut les garde : `prête-moi 5000`,
  `dépanne-moi de 5k` **passent** — la forme correctement orthographiée est la seule qui échappe.
  `prete-moi 5000` et `prête moi 5000` sont bloqués.
- **L'apostrophe omise colle les mots** : `jai besoin dargent` passe (`\bargent\b` ne matche plus).
- **`BESOIN` (`:118`) n'accepte que `aide-moi`** : `tu peux m'aider avec 5000 fcfa` passe.
- **`MONTANT` (`:134-140`) exige quatre chiffres collés** : `envoie 5 000`, `envoie 5.000`
  passent ; `collerChiffres` n'est appliqué qu'aux numéros. Verbes absents : `donnes`, `envoyez`,
  `vire`, `offre`, `mets`, `gimme`, `dash`, `bless`.
- **Aucune normalisation Unicode** : `еnvоiе-mоi 5k` (е, о cyrilliques), `envoie-moi ５０００ fcfa`
  (pleine largeur), `5️⃣0️⃣0️⃣0️⃣`, un caractère de largeur nulle entre deux lettres — et côté contact
  `６７７１２３４５６`, `677l23456` (l pour 1), `6️⃣7️⃣7️⃣…`. Tout passe.
- **Vocabulaire de contact réel non couvert** (`:163-176`) : `je suis sur wa`, `mon ig c handle`,
  `fb`, `sc`, `mon tg`, `@ handle`, `t . me / handle`, `telegram.me/handle`, `bit.ly/abc`,
  `moi at gmail dot com`, `ton tel`, `text me`, `dm me`.
- **La ville** n'est pas contrôlée (I7) : `Douala @handle1` s'affiche sur la carte.

Ce qui tient : le seuil des 10 messages compte `min(mes messages, ses messages)`
(`routes.js:762-765`), donc l'autre ne peut pas débloquer seul, et un message refusé n'est pas
stocké ; les montants seuls ne bloquent jamais (voulu — mais `5k stp` est une demande).

**Correctif** : dans `normalize`, `NFKC` puis retrait de `[\u200B-\u200F\u2060\uFEFF]` et des
`\uFE0F\u20E3` des touches emoji, table de confusables cyrillique → latin (а е о р с х у), tiret
et point remplacés par une espace, variante sans apostrophe ; `collerChiffres` avant `MONTANT` ;
verbes et abréviations ci-dessus ; `\b[a-z0-9-]+\.(com|cm|net|me|ly|app)\b` pour les domaines
sans schéma. Et surtout : **remplacer le corpus imaginé par les messages réellement signalés**
dès qu'il y en a (dette n° 5). Les règles ne rattraperont jamais un scammeur motivé après dix
échanges ; elles doivent au moins rattraper le premier message maladroit.

---

## 3. Mineur : à planifier

Sécurité et données :
- `server/moderation.js:140-143` : `DELETE /session` efface le cookie et rien d'autre ; un cookie
  copié vaut jusqu'à `exp` (12 h). Nonce de session sur le compte, effacé à la déconnexion.
- `moderation.js:63-65` : course sur l'échange du jeton — lecture puis effacement non conditionnel,
  deux requêtes simultanées passent. Mise à jour conditionnelle (`where … = $2`).
- `moderation.js:182` : `marquerSignalementLu` sur un simple `GET` avec cookie `Lax` — un lien
  piégé fait signer une « lecture » à un modérateur. Trace faussée, pas de fuite.
- `moderation.js:161` : `oublierLesAdmins()` avant le contrôle de droit — n'importe quel membre du
  groupe vide le cache et force un `getChatAdministrators` ; si Telegram décroche, le cache de
  panne est remis à zéro et plus personne n'entre.
- `server/index.js:111` : `ADMIN_KEY` comparé par `!==`, sans limite de débit (la route n'a pas de
  compte). Disparaît avec C4 si la clé quitte les URL.
- `index.js:89` : `express.json({ limit: '3mb' })` global, avant toute authentification, webhook
  compris ; `routes.js:117-118` décode le base64 **avant** de vérifier 1,5 Mo. Sur 256 Mo, quelques
  dizaines de corps simultanés non authentifiés pèsent. Limite basse par défaut, `3mb` sur les deux
  routes photo seulement.
- `routes.js:470-477, 490-498` : photos et voix d'un compte **fermé** restent servies par
  identifiant (vérifient le blocage, pas `banned`). Couvert par I6.
- `auth.js:70-71` : `x-dev-user` accepte n'importe quelle chaîne, ensuite concaténée dans des
  chemins (`${u.id}-selfie.jpg`) : `../x` écrit hors de `uploads/`. Inerte en production
  (`ALLOW_DEV_AUTH` éteint), à borner par `/^\d+$/` quand même.
- `routes.js:978-983` : `POST /reports` accepte n'importe quel `matchId` — le signaleur peut
  rattacher une discussion avec un **tiers**, que `/moderation` ouvrira sur la foi d'un signalement
  contre quelqu'un d'autre. Ignorer le `matchId` reçu, prendre `matchBetween(moi, cible)`.
- `routes.js:927-938` : check-in répétable (jusqu'à 10 notifications par heure à l'autre **et** à
  la personne de confiance) ; lieu disparu de `venues` → `TypeError`, 500.
- `routes.js:852-855` : deux propositions simultanées sur PostgreSQL → deux rendez-vous vivants ;
  `PUT /dates/:id` lit puis écrit, « accepter » et « annuler » concurrents → le dernier gagne, deux
  notifications. Index partiel unique sur `dates(match_id) where status in ('proposed','accepted')`
  et `update … where status = $2 returning *`.
- `routes.js:620-622` : sous la politique levée, `/likes` et « tu as plu à quelqu'un » ignorent le
  genre recherché — une personne réglée sur « femmes » voit des hommes dans « ils t'ont aimée ».
  À trancher avec le propriétaire ; si c'est voulu, l'écran doit le dire.
- `index.js:179` : `console.error(err)` sur l'objet entier ; sur un JSON malformé, `body-parser`
  attache le corps brut dans `err.body` (jusqu'à 3 Mo : selfie, texte de message) → journal de
  l'hébergeur. Journaliser `type`, `status`, `message`, `stack`.
- `scripts/restaurer.js:118-119` : noms de colonnes tirés du fichier, entre `"` sans échappement.
  Acceptable parce que GCM authentifie le fichier ; une vérification `/^[a-z_]+$/` coûte une ligne.
- `scripts/sauvegarde.js:43-60` : un `.partiel` laissé par un plantage n'est jamais nettoyé.
- `deployer-fly.sh:41` : `flyctl auth whoami` écrit l'adresse mail du compte dans le journal du
  travail.

Interface :
- `app.js:1644-1660` : `catch {}` avale les 404 `MATCH_NOT_FOUND` et 403 `BLOCKED` ; après un
  match défait par l'autre, l'écran reste ouvert et interroge toutes les 4 s pour rien.
- `app.js:315-325` : `refreshSummary` n'a pas le garde `document.hidden` que `pollChat` a — en
  arrière-plan, `/summary` (et son `allUsers()`, dette n° 3) continue toutes les 20 s.
- `app.js:163, 174, 1463` : `createObjectURL` jamais révoqués.
- `app.js:1721, 311`, `ui.js:238-242`, `tg.js:198` : textes hors `t()` et `'fr-FR'` en dur
  (« Aujourd'hui », « Hier » en russe). `tg.js:38` : deux couleurs en dur en repli.
- `app.js:2028` : `?screen=verify` sur un compte déjà vérifié → `ALREADY_VERIFIED` → « Réessayer »
  qui boucle. `go()` n'appelle pas `arreterLaVoix()`.
- Tout ce qui touche à `/health` (`index.js:101`) : ne regarde pas le stockage ; une base morte reste
  « saine » et Fly continue de réveiller une machine qui répondra 500.

Exploitation :
- `Dockerfile:2` `node:22-alpine` sans somme de contrôle ; `docker-entrypoint.sh:6` `chown -R` de
  tout le volume à **chaque réveil**, sous une `grace_period` de 10 s.
- `fly.toml` : ni `kill_timeout`, ni `swap_size_mb` ; pas de `NODE_OPTIONS=--max-old-space-size`.
- `package.json:22` : `"@playwright/test": "^1.56.0"` — caret, alors que `CLAUDE.md` le dit
  épinglé (le verrou compense sous `npm ci`).
- Présence et compteurs JSON en mémoire repartent à **chaque mise en veille** de la machine, pas
  seulement « au redémarrage ».
- `reports`, `swipes` (y compris les « pass ») et `lectures` ne sont jamais purgés ; `presence`
  ne rétrécit que sur `/presence/leave`.

- `bot.js:337-341` : voix téléchargée sans délai (`fetch` sans `AbortSignal.timeout`) et sans
  regarder `voice.file_size` — un fichier de 20 Mo déclaré à 10 s est chargé en mémoire sur 256 Mo,
  six fois par heure et par compte. Refuser au-delà de 300 ko, délai de 8 s.
- `routes.js:983` : le motif de signalement part **brut** à la modération (la version stockée est
  tronquée, `:981`) — un texte qui imite une consigne sous le bouton « Fermer ce compte ».
  Réutiliser la valeur tronquée.

---

## 4. Ce qui a été vérifié et tient

Autant le dire, pour que la prochaine revue ne refasse pas ce travail.

- **Authentification** (`auth.js:20-46`) : secret dérivé de `WebAppData`, chaîne de contrôle triée,
  `timingSafeEqual` après contrôle de longueur (un `hash` non hexadécimal est rejeté par la
  longueur), expiration 24 h, `signature` toléré des deux façons, `user.id` lu après la signature
  seulement, aucune raison de refus renvoyée au client. Les bannis sont refusés à la porte unique.
  `AUTO_APPROVE` et `ALLOW_DEV_AUTH` s'éteignent en production, `ADMIN_CHAT_ID` et l'unicité des
  secrets sont exigés au démarrage, `VENUE_SECRET` dès qu'un lieu existe.
- **Sessions** (`session.js`) : HMAC-SHA256 à temps constant, `exp` vérifié, cookie `HttpOnly`,
  `Secure` en production, `SameSite=Lax`, effacé avec les mêmes attributs. `/api/mod` répond 503
  sans secret, revérifie le droit d'administrateur à chaque requête, ne sert aucun selfie, échappe
  toute sortie HTML, et la page est en `no-store`.
- **Autorisation des routes** : `requireApproved` garde découverte, likes, matchs, messages,
  rendez-vous, check-in, blocages, signalements, photos et voix ; `loadMatch` impose appartenance
  **et** blocage ; `/dates/:id` et `/checkin` refont les deux contrôles ; la machine d'états des
  rendez-vous est juste pour les quatre valeurs légitimes ; `createMatch` est idempotent (`on
  conflict do nothing`), pas de double match par course ; le quota ne compte que les likes du jour.
- **Ce qui sort** : `publicProfile` n'expose ni prénom Telegram, ni `languageCode`, ni pseudo, ni
  chemin de fichier, ni photo non validée ; le selfie n'est servi par aucune route (pas de `static`
  sur `uploads/`) ; `voix.js` applique « validé pour les autres, audible pour soi » ; `lieux.js` ne
  transporte aucun champ `code`, compare à temps constant, 10 essais par heure ; `mesure.js` refuse
  tout texte ; `confiance.js` : code de 96 bits, usage unique, 24 h, rien d'enregistré avant
  l'accord, prénom de l'autre membre jamais transmis, `direATiers` seul chemin vers un non-membre.
- **Entrées** : âge entier 18-99 (`"18.5"`, `NaN`, `null` refusés) ; `slot` passe par
  `checkMessage` ; photos bornées à 1,5 Mo décodés, emplacement dans `[1,2,3]` ; réponses de
  compatibilité en liste fermée (aux clés de prototype près, I2).
- **Interface** : chaque champ d'un autre membre atteint le DOM à travers `esc()` — prénom, âge,
  ville, quartier, réponse libre, langues, messages, lieu, créneau, prénom de la personne de
  confiance, erreurs serveur ; les identifiants dans `data-id` sont hexadécimaux ; `initDataUnsafe`
  ne sert qu'au préremplissage ; le SDK n'est touché que dans `tg.js` ; `api()` n'envoie
  `Authorization` qu'à `/api` même origine, avec délai et sans réessai ; `localStorage` ne pilote
  rien de sensible ; la règle 16 tient sur le chemin nominal.
- **Stockage** : aucune injection SQL (identifiants constants, `nomSur()` refuse tout nom hors
  `TABLES`, `DATABASE_SCHEMA` filtré, valeurs en `$n`) ; migrations idempotentes sous verrou
  consultatif ; `limiteConsommer` verrouille la ligne dans une transaction ; `deleteUser` PostgreSQL
  est transactionnel ; like → match converge dans les deux ordres grâce à `pair_key unique`.
- **Sauvegarde** : sel et IV aléatoires par fichier, clé scrypt par fichier (pas de réutilisation
  de nonce), tag GCM vérifié avant `final()`, écriture atomique en `0600`, refus sans secret, refus
  de restaurer sur une base non vide, recomptage depuis la base.
- **Chaîne de déploiement** : `.dockerignore` exclut `data`, `.env*`, `test`, `*.sh`, `fly.toml` ;
  `db.json` et `uploads/` hors Git ; `npm ci --omit=dev` ; processus sous `node` ; aucun `set -x`
  ni écho de secret ; `flyctl secrets list --json` va directement dans `node` ; `basculer-postgres.sh`
  masque `DATABASE_URL` ; `ci.yml` en `pull_request` (jamais `_target`), donc aucun secret pour un
  fork ; l'artefact de sauvegarde n'est que le bloc chiffré ; `npm audit` : rien.

---

## 5. Dans quel ordre

Six lots, chacun une pull request relisible, dans cet ordre. Les deux premiers tiennent en une
journée et ferment tout ce qui éteint la production.

1. ~~**Ne plus tomber**~~ — fait le 14 septembre 2026 (`server/promesses.js`, `test/promesses.test.js`). (C1, C2, C5, I11 en partie) : `Object.hasOwn` sur `CHANGEMENTS` ; `.catch()`
   sur chaque notification en arrière-plan ; `lireCookie` qui ne jette pas ; enveloppe de promesses
   sur `modApi` et sur le webhook ; `pool.on('error')` ; `process.on('unhandledRejection')` qui
   journalise. Tests : statut `constructor`, cookie `%`, gestionnaire du bot qui jette.
2. **Fermer les portes** (C3, C4, I1, I2, I13, I14) : `/swipes` filtré par `joignable` et paires
   défaites respectées ; `secret_token` sur le webhook et `ADMIN_KEY` hors des URL ; type dans le
   corps signé des sessions ; `Object.hasOwn` sur toutes les listes fermées ; `estAdministrateur`
   sur les cinq boutons ; code dans le bouton `conf:`.
3. **Tenir la promesse de suppression** (I3, I4, I5) : suppression sans recréation, signalements
   et confiance emportés, selfie retiré du groupe, décision refusée hors `pending`.
4. **Ce qui sort du serveur** (I6, I7, I8) : identifiant public opaque — le plus lourd du lot,
   parce qu'il change la forme de l'API ; `/photos` et `/voix` conditionnés à la cible ; ville
   dans le texte contrôlé ; politique de sécurité de contenu complète.
5. **Anti-arnaque** (I15) : normalisation Unicode, tiret, apostrophe, montants espacés, verbes et
   abréviations manquants — puis le corpus réel.
6. **Interface et exploitation** (I9, I10, I12, section 3) : jeton de requête sur la discussion,
   garde sur `date()`, identifiants encodés ; actions épinglées, `permissions:`, entrées validées ;
   restauration à froid ; arrêt propre ; le reste de la section 3 au fil de l'eau.

Ce que cette revue ne couvre pas et qu'une autre devra faire : le comportement réel sous charge
(dette n° 3 mesurée, pas rejouée ici), les dictionnaires traduits sans locuteur natif, et tout ce
qui n'est pas du code — BotFather, le juriste, la déclaration (`CLAUDE.md`, section 8 bis).
