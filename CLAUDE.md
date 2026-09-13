# Odo : instructions pour l'agent de code

Tu reprends **Odo**, une mini app Telegram de rencontres vérifiées pour l'Afrique francophone, lancée d'abord à Yaoundé (Cameroun). Le prototype fonctionne : il a été testé sur un vrai téléphone Android dans Telegram. Ton rôle est de le faire évoluer vers une bêta fermée, sans casser ce qui marche.

Lis ce fichier en entier avant toute modification.

---

## 1. Le produit en une phrase

Des rencontres entre personnes réelles et vérifiées, dans des lieux publics, sans arnaques ni demandes d'argent.

**Cible :** étudiants et jeunes actifs de 18 à 30 ans, sur des téléphones Android d'entrée de gamme, avec des forfaits data limités et un réseau parfois instable.

**Promesse de sécurité (non négociable) :**
- tous les profils sont vérifiés par selfie avec un geste aléatoire ;
- aucune demande ou offre d'argent n'est possible dans les discussions ;
- les pseudos et numéros Telegram ne sont jamais montrés aux autres ;
- les premiers rendez-vous se font dans des **lieux publics**, une **personne de confiance** peut être prévenue du lieu et de l'heure, et l'arrivée est confirmée par QR code **là où un lieu partenaire existe** — la liste part vide, un lieu n'y entre qu'avec un accord signé, et l'app dit clairement quand la confirmation n'est pas disponible.

---

## 2. Stack technique

- **Serveur :** Node.js 20 ou plus, Express 4, modules ES (`"type": "module"`).
- **Bot :** grammY (interrogation longue en local, webhook en production).
- **Interface :** HTML, CSS et JavaScript sans framework ni étape de build, SDK officiel `telegram-web-app.js`.
- **Stockage :** PostgreSQL si `DATABASE_URL` est défini (`server/store.pg.js`, migrations SQL versionnées), sinon fichier JSON avec écriture atomique (`server/store.json.js`). `server/store.js` choisit ; les deux offrent la même interface, asynchrone.
- **Tests :** `node --test test/*.test.js` (lancé par `npm test`). La même suite tourne sur PostgreSQL avec `npm run test:pg` (un schéma par fichier de test). Le parcours dans un navigateur est couvert par Playwright (`npm run e2e`, dossier `e2e/`). Les trois passent en CI.
- **Nom de l'app :** variable `APP_NAME` (par défaut `Odo`), injectée dans `index.html` par le serveur.
- **Dépendances :** `express`, `grammy`, `qrcode`, `dotenv`, `pg`. En développement seulement : `@playwright/test`, **épinglé** — sa version décide de la version de Chromium téléchargée. N'en ajoute pas sans justification.

## 3. Organisation du code

```
server/
  index.js      Serveur Express, en-têtes de sécurité, QR codes des lieux (/qr/:id.png?key=)
  config.js     Variables d'environnement, lieux partenaires, listes (intentions, genres)
  geo.js        Pays (liste ISO), noms localisés, clé de comparaison des villes, suggestions, fuseau → pays
  auth.js       Validation HMAC de Telegram.WebApp.initData, middleware requireAuth
  session.js    Cookie web signé (WEB_SESSION_SECRET), sans dépendance ni table
  moderation.js Espace de modération : lien à usage unique, droit = admin du groupe, écran sans JS
  confiance.js  Personne de confiance : invitation, accord explicite, retrait des deux côtés
  jauge.js      Jauge de confiance : la liste des critères ouverts, et le calcul du score
  lieux.js      Le code d'un lieu : empreinte du secret serveur, jamais servie au client
  voix.js       Présentation vocale : durées, nom de fichier, ce qui est public, et pourquoi ça vit dans le bot
  bascule.js    Ce que la bascule PostgreSQL doit retrouver : comptage par clé, fonction pure
  mesure.js     Pose les événements : garde-fou anti-texte, ralentis, semaine ISO des cohortes
  chiffres.js   Lit les chiffres : fonction pure, exclusions en amont, avertissements
  routes.js     API REST sous /api
  bot.js        Commandes du bot, modération des selfies, notify(), notifyAdmin()
  antiscam.js   checkMessage() : blocage argent (contextuel), liens, numéros, pseudos
  limites.js    Limitation de débit : les règles, le middleware ; les compteurs sont dans le stockage
  assets.js     Version des fichiers envoyés au navigateur, tirée du contenu et non du démarrage
  compression.js Compression gzip des fichiers et des réponses d'API
  i18n.js       Langue de chaque personne, dictionnaire des messages du bot
  store.js      Choix du stockage selon DATABASE_URL, et rien d'autre
  store.json.js Stockage fichier JSON : défaut, une seule instance, présence en mémoire
  store.pg.js   Stockage PostgreSQL : même interface, transactions, plusieurs instances
  db/migrate.js Lanceur de migrations (verrou consultatif, une transaction par fichier)
  db/migrations/ Migrations SQL, appliquées une fois chacune, jamais modifiées après coup
                 001-base.sql, 002-events.sql (mesure produit), 003-limites.sql (compteurs partagés)
  seed.js       Profils de démonstration (SEED_DEMO=true)
  legal/        Pages publiques (confidentialité, conditions) : hors de public/, car le nom de l'app y est injecté
public/
  index.html    Charge telegram-web-app.js puis app.js
  tg.js         Seul point d'accès au SDK Telegram, avec secours hors Telegram
  app.js        Écrans (objet SCREENS), navigation go(), appels api()
  ui.js         Icônes, toast, squelettes de chargement, geste de balayage, décision du verre
  i18n.js       Choix de la langue, chargement du dictionnaire à la demande, t() et tn()
  i18n/en.js    Dictionnaire anglais ; la clé est la phrase française
  styles.css    Identité « Aura » : surfaces d'encre ou d'os selon data-scheme, aura réservée au match, au badge et au like ; Fraunces pour l'identité, Manrope pour l'interface
test/
  activity, antiscam, assets, auth, compression,
  bannissement, checkin, deploiement, filters, geographie, instructions, jauge, langues, limites,
  limites-instances (PostgreSQL seulement : deux processus, un seul quota), moderation,
  moderation-session, notifications, pages-publiques, photos, production, profiles,
  rendezvous, securite, stockage, verre, webhook
  (tous rejoués sur PostgreSQL par npm run test:pg)
e2e/
  aides.js       Gestes partagés : ouvrir, créer un profil, se faire vérifier
  inscription, discussion, mesure, pages-publiques, verre (18 tests Playwright, npm run e2e)
scripts/
  chiffres.js    npm run chiffres : entonnoir et contre-métriques, --json pour la machine
  import-json.js Reprise d'un db.json existant vers PostgreSQL, événements compris
  etat-stockage.js Compare fichier et base table par table ; sort en erreur si la base en porte moins
  test-pg.js     La suite complète sur PostgreSQL, un schéma par fichier de test
basculer-postgres.sh  Bascule vers PostgreSQL en deux temps : preparer, basculer, verifier
DEPLOIEMENT.md  Guide pas à pas de mise en ligne : secrets, contrôles, PostgreSQL, pannes
audit/
  Dossier d'audit du parcours : benchmark, mesures, constats, risques, plan
```

## 4. Fonctionnalités en place

| Domaine | État |
|---|---|
| Authentification | `Authorization: tma <initData>` validé côté serveur (HMAC, expiration 24 h, champ `signature` toléré). Mode développement `x-dev-user` si `ALLOW_DEV_AUTH=true` et hors production |
| Profil | Prénom, âge 18+, genre, intention (amitié, relation sérieuse), pays, ville libre, quartier, question, langues, deux questions de compatibilité facultatives en « Relation sérieuse » (mariage, enfants), jusqu'à trois photos facultatives, chacune modérée, compressées côté client |
| Vérification | Geste aléatoire, selfie envoyé au groupe de modération avec boutons Valider/Refuser, selfie supprimé après décision. `AUTO_APPROVE` valide sans humain, **pour les tests seulement** : il est éteint dès que `NODE_ENV=production`, et le serveur y refuse de démarrer sans `ADMIN_CHAT_ID`. Le groupe est interrogé au démarrage (`verifierGroupeModeration`) pour qu'un bot absent du groupe se voie au déploiement. Si un selfie ou une photo ne parvient pas à partir alors que la modération est configurée, l'envoi est **défait** et la personne est invitée à réessayer, au lieu d'attendre une décision que personne ne peut prendre |
| Jauge de confiance | `server/jauge.js` : une **liste unique** de critères ouverts (selfie validé, trois mois d'ancienneté), lue par la carte, par le score et par l'écran d'explication. Le garant n'y est pas et n'y sera pas : P1-6 est abandonné, et une jauge « sur 3 » dont le 3 est inatteignable n'explique rien. Ajouter un critère reste une ligne le jour où un vrai mécanisme existe. Un critère inconnu de la liste ne compte ni au numérateur ni au dénominateur. L'écran s'ouvre une fois après l'enregistrement du profil (`localStorage`, clé `jauge_vue`), puis depuis l'onglet Profil |
| Langues | Français et anglais. Choix explicite dans le profil, sinon la langue du Telegram, sinon le français. Interface traduite chez la personne (`public/i18n.js` + `public/i18n/<code>.js`, chargés à la demande), messages du bot traduits côté serveur (`server/i18n.js`) dans la langue de **qui reçoit**. `PUT /api/me/lang` |
| Localisation | Pays deviné au premier lancement depuis le fuseau du téléphone (`paysDuFuseau` dans `server/geo.js`, table dérivée de zone.tab). Le navigateur passe `?tz=` à `GET /api/me`, le serveur répond `options.suggestedCountry`. **Le fuseau n'est ni stocké ni journalisé, aucun GPS n'est demandé.** Il donne le pays, jamais la ville. Bouton « Ma position : {pays} » dans les filtres. Le choix de la personne l'emporte toujours |
| Découverte | Même zone de recherche et même intention, 20 profils par jour, ceux qui t'ont liké en premier, économie de data (photos à la demande) |
| Match et discussion | Discussion plein écran, polling toutes les 4 s, non lus, présence (pas de notification si la personne lit) |
| Notifications bot | Match, message (limité à une par discussion toutes les 2 min), « tu as plu à quelqu'un » (une par jour), test depuis l'onglet Profil, bouton qui rouvre le bon écran (`?screen=chat&match=`) |
| Présentation vocale | 15 secondes, facultative, **enregistrée dans le bot** (`/voix`) parce que `getUserMedia` est inutilisable dans les mini apps sur Android — et parce que l'opus de Telegram arrive déjà compressé, donc sans transcodage sur une machine de 256 Mo. **Écoutée par la modération avant d'être entendue par quiconque** : `antiscam.js` ne lit que du texte, rien n'empêche de dire un numéro à haute voix, et c'est la seule barrière de ce canal. La durée est annoncée d'avance et rien n'est téléchargé avant l'appui, pour que personne ne paie de la data sans le savoir. Retrait des deux côtés (`/sansvoix` ou l'app). `GET /api/voix/:userId` suit les règles des photos (`server/voix.js`) |
| Anti-arnaque | Argent bloqué (texte normalisé contre les contournements : points, lettres détachées, « O » pour zéro), contacts bloqués avant 10 messages, profil et créneau de rendez-vous sans contact ni argent. **International** : 34 familles de moyens de paiement, 56 devises, vocabulaire français et anglais, numéros de n'importe quel indicatif (E.164 ou neuf chiffres). Deux paliers de moyens : inconditionnels, et ambigus (`om`, `visa`, `wave`, `wise`) qui ne bloquent pas seuls mais tiennent le rôle d'objet d'argent |
| Code d'un lieu | `server/lieux.js` : le contenu du QR est une **empreinte HMAC** de `VENUE_SECRET` et de l'identifiant du lieu. Il ne se déduit pas de l'identifiant, n'est pas dans Git, et **aucun lieu ne porte de champ `code`** — une route ne peut donc plus le recopier dans une réponse, ce qui est exactement ce qui arrivait. Comparaison à temps constant, 10 essais par heure. `VENUE_SECRET` absent : secret tiré au hasard au démarrage (les QR imprimés cessent de marcher, aucun ne devient devinable) ; en production **avec au moins un lieu**, le serveur refuse de démarrer. **Le code reste fixe** : il prouve « j'ai vu ce QR », pas « j'y suis » |
| Rendez-vous | **Disponible seulement là où un lieu partenaire existe, et la liste part vide** : au lancement, l'app invite à convenir d'un lieu public dans la discussion. Là où un lieu existe : proposition, puis **accepter, refuser ou annuler** : statuts `proposed`, `accepted`, `declined`, `cancelled`, notification du bot à chaque changement. L'invité accepte ou refuse ; celui qui propose annule sa proposition ; une fois accepté, chacun peut se décommander. **Le check-in par `showScanQrPopup` n'est possible que sur un rendez-vous accepté.** Un seul rendez-vous vivant par discussion. `PUT /api/dates/:id` |
| Sécurité | Signaler et bloquer, guide anti-chantage, suppression complète du compte. **Fermer un compte** depuis le groupe de modération (bouton sous chaque signalement et chaque message bloqué) : accès refusé avec la marche à suivre, disparition de la découverte, matchs défaits, réouverture possible du même endroit. La marque (`banned`) garde qui, quand et pourquoi — les conditions promettent qu'un compte fermé pour arnaque ne se recrée pas |
| Espace de modération | `/moderation` dans le groupe : lien à usage unique (10 min) envoyé **en privé**, session web de 12 h par cookie signé. Le droit d'entrer est **d'être administrateur du groupe**, demandé à Telegram à chaque requête (cache 60 s) : perdre ses droits ferme la session en cours. Quatre vues sans JavaScript ni image : accueil, file de vérification, signalements, comptes fermés — **jamais de selfie**. Un signalement ouvre **le fil de la discussion signalée, et elle seule** ; **chaque lecture laisse une trace** sur le signalement (`lectures`), et un fil défait n'est plus lisible. Sans `WEB_SESSION_SECRET`, `/moderation` et `/api/mod` répondent 503, le reste de l'app tourne |
| Mesure produit | Six horodatages d'entonnoir dans l'objet utilisateur et **onze événements** dans `events` (`server/mesure.js` : `app_opened` ralenti à l'heure, `form_step`, `profile_saved`, `selfie_sent`, `verif_decided` avec `ok`/`auto`/`ms`, `verif_retried`, `deck_served` ralenti à 5 min, `deck_empty`, `quota_hit`, `antiscam_block` — **le code, jamais le libellé ni le texte** —, `account_deleted` sans identifiant). `chargeValide()` refuse toute charge utile qui n'est pas faite de nombres et de mots-clés fermés : la barrière est dans le code, pas dans la discipline de l'appelant. `form_step` passe par `localStorage` et l'ouverture suivante : **zéro requête ajoutée**. `DELETE /api/me` purge, `EVENTS_RETENTION_DAYS` (180, `0` n'écrit rien). **`npm run chiffres`** (`server/chiffres.js`, fonction pure + `scripts/chiffres.js`) : entonnoir, activation à 14 jours, churn dur et silencieux, métrique phare (check-in réciproques entre personnes réelles, par ville), six métriques d'entrée, six contre-métriques. Exclusions **en amont**, et la **paire** exclue quand un profil de démonstration est dedans. Les décisions `auto: true` sortent du délai de modération et de l'activation. Chaque limite est écrite à côté du chiffre : phare falsifiable tant que les codes des lieux sont fixes, départs non datables sans `app_opened`, rien de rétroactif. Plan : `audit/05-mesure-produit.md` |
| Personne de confiance | `server/confiance.js` : un membre fabrique une invitation (code aléatoire à usage unique, 24 h, limite de 64 caractères du lien `t.me`), la personne l'ouvre, **le bot lui dit ce qu'elle recevra et ce qu'on garde d'elle**, et n'enregistre rien avant son accord explicite. Reçoit : lieu et heure d'un rendez-vous accepté, arrivée confirmée, et « je pars maintenant » depuis la discussion (`POST /api/matches/:id/prevenir`) — **le seul qui marche sans lieu partenaire**. **Jamais le prénom de l'autre membre** : il n'a pas consenti. `direATiers()` dans `bot.js` est le seul chemin vers un non-membre, avec la langue retenue à l'accord. Retrait des deux côtés (`DELETE /api/me/confiance`, `/retirer`). L'identifiant Telegram ne sort jamais du serveur |
| Pages publiques | `/confidentialite` et `/conditions`, lisibles sans compte, hors de Telegram et sans JavaScript. Servies depuis `server/legal/`, nom de l'app injecté, compressées au démarrage. L'onglet Profil y renvoie par `tg.openLink()`. Un test vérifie que le délai de suppression du selfie qu'elles annoncent est celui que le serveur applique |
| Éléments natifs | MainButton, SecondaryButton, BackButton, SettingsButton, popups, haptique, scanner QR, confirmation de fermeture, CloudStorage, requestWriteAccess, addToHomeScreen |

## 5. Règles à respecter absolument

### Sécurité et données
1. **Ne jamais faire confiance au client.** Toute identité vient de `initData` validé sur le serveur. `initDataUnsafe` sert uniquement à préremplir l'interface.
2. **Aucune donnée d'orientation sexuelle ni d'ethnie** n'est collectée. Voir `MATCH_POLICY` dans le README : le cadre pénal camerounais rend ces données dangereuses pour les utilisateurs.
3. **Le selfie de vérification n'est jamais servi aux autres membres** et reste supprimé après la décision de modération.
4. **Toute nouvelle donnée personnelle** doit être minimale, justifiée, supprimée par `DELETE /api/me`, et signalée dans le README (loi camerounaise n° 2024/017 sur les données personnelles).
5. **Aucun secret dans le code ni dans Git.** `.env` reste ignoré.
6. **Les mineurs sont exclus** : aucune fonction ne doit contourner le contrôle d'âge.

> **Un réglage de confort ne survit pas au déploiement.** `AUTO_APPROVE` et `ALLOW_DEV_AUTH` s'éteignent seuls quand `NODE_ENV=production` (`server/config.js`), et le serveur refuse de démarrer en production sans `ADMIN_CHAT_ID`. Tout nouveau réglage qui affaiblit une promesse de sécurité pour faciliter les tests suit la même règle, et un test le fige (`test/production.test.js`). Les numéros de cette section sont cités ailleurs dans le dépôt : cette consigne reste hors numérotation pour ne pas les décaler.

### Règles Telegram et paiements
7. **Aucune vente de bien ou service numérique à l'utilisateur dans la mini app** (premium, boosts, likes) autrement qu'en Telegram Stars : c'est la règle de Telegram. Ne propose pas non plus de lien externe pour les payer. Le premium en mobile money n'existe que sur la version web, selon la section 10.
8. **Aucune crypto, aucun jeton, aucun mécanisme « tap-to-earn »** (zone grise réglementaire dans la CEMAC).
9. **Monétisation prévue** : pass premium à durée fixe (mobile money sur le web, Stars dans Telegram), services physiques payés par mobile money, et B2B (lieux partenaires payés par rendez-vous confirmé, fonctions sponsorisées). Pas de publicité tierce dans les écrans de rencontre.

### Interface
10. **Le français est la langue source**, tutoiement, phrases courtes, casse de phrase (pas de Majuscules À Chaque Mot), sans « s'il vous plaît », sans point d'exclamation dans les messages système. Le texte s'écrit en français **dans** l'appel de traduction : `t('Envoyer la proposition')` côté interface, `notify(id, 'Écrire', …)` côté bot. La clé de traduction **est la phrase française** : une phrase non traduite s'affiche en français, jamais sous forme d'identifiant. Toute phrase ajoutée à l'interface doit aussi être ajoutée à `public/i18n/en.js` — un test le vérifie.
11. **Les erreurs disent ce qui se passe et quoi faire** : « Ce code ne correspond pas à Le Palmier. Scanne le code posé sur ta table. »
12. **Le nom de l'app n'est jamais écrit en dur** : `config.appName` côté serveur, constante `APP` côté interface (injectée par le serveur depuis `APP_NAME`).
13. **Toute action principale passe par `tg.setButtons()`**, toute navigation arrière par `tg.setBack()`. N'appelle jamais `window.Telegram.WebApp` en dehors de `public/tg.js`.
14. **L'app possède ses surfaces, Telegram décide du schéma.** Les couleurs viennent des jetons de `styles.css` (`--bg`, `--bg2`, `--bg3`, `--text`, `--button`…), déclinés en clair et en sombre par `<html data-scheme>` que `tg.js` règle d'après `colorScheme` ; `tg.js` renvoie ensuite la surface de la page au cadre Telegram (`setHeaderColor`, `setBackgroundColor`, `setBottomBarColor`) et la couleur d'action au bouton natif. Jamais de couleur en dur dans un composant : un jeton, ou `color-mix` d'un jeton. **L'aura (`--aura`) n'apparaît qu'au match, sur l'anneau d'un avatar vérifié et sur le stamp du like** ; le rose (`--like`) et l'ambre (`--gold`) sont les seules autres couleurs au repos. L'app doit rester lisible dans les deux schémas (contraste AA mesuré).
15. **Pensé pour la data et le réseau** : pas de bibliothèque front lourde, images compressées, états de chargement et d'erreur réseau sur chaque écran.
16. **Ne jamais reconstruire le champ de saisie de la discussion** pendant la frappe (le clavier se fermerait) : mettre à jour seulement `#messages` via `updateChat()`.

## 6. Façon de travailler

1. **Commence toujours par un plan court** : fichiers touchés, changements d'API, risques. Attends mon accord si la tâche touche la sécurité, les données ou les paiements.
2. **Une fonctionnalité par branche et par pull request**, de taille relisible.
3. **Ajoute ou mets à jour les tests** pour toute logique serveur. `npm test` doit passer avant de proposer la PR.
4. **Garde la compatibilité du fichier `.env`** : toute nouvelle variable a une valeur par défaut sûre et est documentée dans `.env.example` et le README.
5. **Mets à jour le README** quand tu changes l'installation, les variables ou le comportement visible.
6. **Termine chaque tâche par** : un résumé des changements, les commandes pour tester en local (navigateur avec `?dev_user=`), et **les étapes pour tester sur un téléphone dans Telegram**.
7. **Si une consigne de ce fichier bloque une demande**, dis-le clairement et propose une alternative au lieu de la contourner.

Contexte du développeur : il travaille sous **Windows avec PowerShell**. Donne les commandes dans ce format, avec des chemins entre guillemets.

## 7. Limites connues

- Sans `DATABASE_URL`, le stockage reste un seul fichier JSON : pas de concurrence entre plusieurs instances, pas de sauvegarde automatique. C'est le mode par défaut, pratique pour développer. **En production, le serveur démarre quand même mais l'écrit à chaque démarrage** (« Attention : en production sur un fichier JSON ») : refuser casserait une production qui tourne, se taire laisserait perdre des chiffres qui ne se reconstituent pas. `scripts/import-json.js` fait la bascule, **événements de mesure compris**, et `test/import.test.js` l'éprouve de bout en bout sur PostgreSQL.
- `allUsers()` charge toute la table, y compris sur PostgreSQL : la découverte filtre en mémoire, et `/summary` l'appelle **toutes les 20 secondes par app ouverte**. Mesuré : 2 ms à 100 comptes, 15 ms à 2 000, 77 ms à 10 000, pour ~816 octets de tas par compte et par appel. Tenable pour quelques centaines de comptes ; au-delà, c'est le filtre qu'il faudra descendre en SQL, pas le stockage qu'il faudra changer. Chiffres et seuils : dette technique n° 3.
- Les notifications partent sans retenir la réponse HTTP. Un test qui les compte doit donc les attendre (voir `test/rendezvous.test.js`), pas les lire aussitôt après l'appel.
- Présence et réponses de démo en mémoire : perdues au redémarrage.
- Discussion par polling toutes les 4 secondes.
- L'espace de modération web **lit** (file de vérification, signalements, comptes fermés) ; toutes les **décisions** se prennent dans le groupe Telegram. Si le groupe devient injoignable, plus personne ne peut être vérifié — et plus personne ne peut ouvrir de session web non plus, puisque la liste des administrateurs vient de là. Le serveur le signale au démarrage et les personnes concernées sont invitées à réessayer, mais rien ne prévient l'exploitant en cours de route.
- **La liste des lieux partenaires est vide**, et c'est voulu : un lieu n'y entre qu'avec un accord signé avec l'établissement, sinon l'app annonce un avantage (« -10 % avec Odo ») à quelqu'un qui va se rendre dans un café qui n'a rien promis. Le rendez-vous avec confirmation d'arrivée n'est donc proposé nulle part pour l'instant, et l'app le dit en invitant à convenir d'un lieu public dans la discussion. Tout le mécanisme reste en place : une ligne dans `config.js` le rallume. Les quatre lieux d'exemple ne sortent qu'avec `SEED_DEMO` (`test/production.test.js`).
- Compteurs de limitation de débit : partagés entre instances sur PostgreSQL (table `rate_limits`), en mémoire sur le fichier JSON — qui est mono-instance de toute façon. Dans les deux cas ils repartent à zéro au redémarrage sur JSON ; sur PostgreSQL ils survivent.
- `server/antiscam.js` couvre maintenant tous les pays, avec trois limites connues : les pays à **mobiles à 8 chiffres** (Togo, Gabon) ne sont attrapés que sous la forme `+indicatif` ; un numéro **écrit en toutes lettres** (« six sept sept… ») n'est vu que s'il est annoncé (« mon numéro ») ; et le vocabulaire ne couvre que le **français et l'anglais** — une demande écrite dans une autre langue échappe aux règles de formulation, mais pas à celles des numéros ni des moyens de paiement, qui ne dépendent pas de la langue.
- Le corpus de non-régression d'`antiscam.js` reste écrit à la main : il fige chaque cas nommé, il ne mesure pas le comportement de vrais utilisateurs. À remplacer par les messages réellement signalés pendant la bêta.
- La localisation s'arrête au **pays** : le fuseau ne distingue pas Yaoundé de Douala, et l'app ne demande pas le GPS. La ville reste écrite par la personne, avec des suggestions pour 33 pays seulement.
- Traduction : le français et l'anglais seulement. Les noms de pays viennent d'`Intl.DisplayNames` (donc traduits automatiquement), mais les villes, les quartiers et les textes saisis par les membres restent tels quels.
- Le **code d'un lieu partenaire est fixe** : il prouve qu'on a vu le QR, pas qu'on y est. Qui l'a scanné une fois peut le réutiliser plus tard depuis chez lui. Le rendre infalsifiable demande un code tournant affiché par le lieu (P1-10) ou un horaire réel sur le rendez-vous — `slot` est du texte libre, donc une fenêtre horaire n'est pas calculable en l'état.
- La mesure produit **ne dit rien rétroactivement** : tous les chiffres partent du jour où les lignes ont été posées. Et la **métrique phare est une borne haute**, pas une preuve : les codes des lieux partenaires sont fixes, donc un check-in peut être confirmé sans s'être déplacé. `npm run chiffres` l'écrit à côté du nombre. Voir `audit/05-mesure-produit.md`.
- `SEED_DEMO=true` reste possible en production : c'est un choix assumé pour une machine de démonstration, pas un garde-fou. De vraies personnes y écriraient à des profils fictifs. `AUTO_APPROVE`, lui, n'a plus d'effet en production, et le serveur refuse de démarrer sans `ADMIN_CHAT_ID` (`test/production.test.js`).
- Le **verre** (flou d'arrière-plan) a **trois chemins vers le même repli opaque** : le navigateur ne sait pas flouter (`@supports`), la personne demande moins de transparence (`prefers-reduced-transparency`), ou l'appareil le rend mal — ce dernier cas est constaté par `reglerLeVerre()` dans `public/ui.js`, qui pose `data-verre="opaque"`. La décision est retenue dans `localStorage` : la mesure d'une session est bruitée, l'appareil ne change pas. Elle reste une heuristique : `deviceMemory` est grossier, et la mesure d'images ne vaut que pendant que l'app dessine.
- Les tests de bout en bout couvrent le parcours principal, pas chaque cas limite : ils sont lents (deux minutes et demie) et ne tournent que sur Chromium, à la taille d'un téléphone. Les règles fines restent la charge des tests unitaires.
- Un test de bout en bout qui attend passivement ne prouve rien : le rafraîchissement de la discussion ne touche au DOM que lorsqu'un message arrive. Celui de la règle 16 fait donc arriver un vrai message pendant la frappe — sans cela il passait même avec l'écran refait à chaque cycle.

## 8. Feuille de route

L'ordre est contraignant : chaque tâche suppose les précédentes terminées.

### P0 : indispensable avant une bêta fermée
1. ~~**Intégration continue GitHub Actions**~~ : fait, `.github/workflows/ci.yml` lance `npm ci`, `npm test` et `npm audit` sur chaque pull request et chaque poussée vers `main`, en Node 20 et 22.
2. ~~**Migration vers PostgreSQL**~~ : fait côté code. `DATABASE_URL` bascule le stockage vers `server/store.pg.js`, les migrations SQL de `server/db/migrations/` s'appliquent à l'import du module, et `scripts/import-json.js` reprend un `db.json` existant sans doublon. La suite complète passe sur les deux stockages, en CI comme en local (`npm run test:pg`). **La bascule de la production est outillée** (`basculer-postgres.sh`, travail GitHub « PostgreSQL ») : la base est attachée sous un nom que le serveur ignore, importée, vérifiée par `scripts/etat-stockage.js`, et renommée seulement ensuite — sans la fenêtre où la production tournerait sur une base vide. **Et elle a été lancée** : la production tourne sur PostgreSQL depuis le 13 septembre 2026 (`mbolo-pg`, Fly non géré), 58 lignes importées, événements de mesure compris, vérifiées par `scripts/etat-stockage.js` avant le renommage. **Ce qui reste n'est pas la bascule mais les sauvegardes** : une base non gérée n'en fait aucune d'elle-même au-delà des instantanés de volume de l'hébergeur. À régler avant de dépasser quelques centaines de comptes, et obligatoirement avant tout paiement (P0-6).
3. ~~**Limitation des requêtes** par utilisateur~~ : fait pour messages, balayages, signalements, vérification, photos, rendez-vous et profil (`server/limites.js`, sans dépendance). Reste à couvrir : les paiements, quand ils existeront.
4. ~~**Accepter ou refuser un rendez-vous**~~ : fait, `PUT /api/dates/:id` avec les quatre statuts, notification à chaque changement, check-in réservé aux rendez-vous acceptés, un seul rendez-vous vivant par discussion, et l'identifiant Telegram de qui propose ne sort plus du serveur (`test/rendezvous.test.js`).
5. ~~**Défaire un match**~~ : fait, `DELETE /api/matches/:id`, sans notification, avec blocage sans accusation et six motifs de signalement.
6. **Version web et paiement par mobile money** : voir la section 10, cahier des charges complet.
7. ~~**Tests de bout en bout**~~ : fait. `e2e/` contient treize tests Playwright (Chromium, taille d'un téléphone) qui refont le parcours complet en mode développement ; `npm run e2e` en local, travail « Parcours navigateur » en CI, traces et captures conservées en cas d'échec.
8. ~~**Pages publiques**~~ : fait. `/confidentialite` et `/conditions` sont servies depuis `server/legal/` sans compte, hors de Telegram et sans JavaScript, avec le nom de l'app injecté ; l'onglet Profil y renvoie par `tg.openLink()`.
9. ~~**Déploiement**~~ : fait. `Dockerfile` (image sans root, volume sur `/data`, scripts d'exploitation embarqués), `/health`, et **`DEPLOIEMENT.md`** : guide pas à pas, contrôles après déploiement, passage à PostgreSQL, tableau des pannes. `test/deploiement.test.js` démarre le serveur avec le seul contenu de l'image et vérifie que le guide ne cite pas des messages qui n'existent plus.
10. ~~**Traiter les vulnérabilités `npm audit`**~~ : fait, `qs` est forcé en 6.16.0 par un `overrides` dans `package.json`, sans changement majeur d'`express`. `npm audit` ne signale plus rien.

### P1 : produit (aligné sur le standard du marché)
1. **Détection des doublons de visage** — **reportée, et pour trois raisons à ne pas redécouvrir**. L'idée : à la validation du selfie, calculer une empreinte, la comparer aux existantes, refuser si le visage est déjà lié à un autre compte actif. Ce qui bloque : (a) **la machine fait 256 Mo**, un modèle de reconnaissance faciale n'y tient pas — il faudrait l'agrandir, donc payer plus, et ajouter la dépendance la plus lourde du projet ; (b) **« empreinte non réversible » est inexact** : une empreinte de visage se retourne partiellement en visage et identifie de façon unique — c'est une donnée biométrique permanente, alors que la page de confidentialité promet aujourd'hui qu'on ne garde **rien** du selfie ; (c) **les modèles ouverts sont nettement moins précis sur les peaux foncées**, donc les faux positifs frapperaient précisément la population visée — et un faux positif ici est une accusation de fraude sans recours. Le trou qu'elle vise est réel (les conditions promettent qu'un compte fermé ne se recrée pas, et rien ne l'empêche avec un nouveau compte Telegram) ; à l'échelle d'une bêta, **la modération humaine voit déjà chaque selfie**. À rouvrir quand la bêta aura montré si les faux comptes sont un problème mesuré, pas redouté.
2. ~~**Partage du rendez-vous avec une personne de confiance**~~ : fait (`server/confiance.js`). Elle **accepte elle-même** dans Telegram après avoir lu ce qu'elle recevra — rien n'est enregistré avant. Prévenue à la proposition acceptée, à l'arrivée confirmée, et par un « je pars maintenant » depuis la discussion, **le seul qui ne dépende d'aucun lieu partenaire**. Le prénom de l'autre membre ne sort jamais : il n'a pas consenti.
3. ~~**Présentation vocale**~~ : fait (`server/voix.js`, `test/voix.test.js`). 15 secondes, **enregistrée dans Telegram, pas dans la mini app** : `getUserMedia` est inutilisable dans les mini apps sur Android (caméra qui ne s'ouvre pas, permission qui se répète ou n'apparaît jamais), et c'est notre cible — l'app délègue déjà le selfie au module natif pour la même raison. Telegram livre de l'opus déjà compressé avec sa durée : **aucun transcodage**, donc pas de ffmpeg sur une machine de 256 Mo. `/voix` pour enregistrer, `/sansvoix` ou l'app pour retirer. **Chaque présentation est écoutée par la modération avant d'être entendue** : `antiscam.js` ne lit que du texte, rien n'empêche de dire un numéro à haute voix, et c'est la seule barrière qui existe pour ce canal. **L'écoute** : un bouton dans le corps de la carte, jamais sur la photo — il se touche pendant qu'on lit, pas pendant qu'on balaie. **Rien n'est téléchargé avant l'appui**, et la durée est annoncée d'avance (`voix: { duree }` dans le profil public) pour qu'on sache ce que l'écoute va coûter en data. Un seul son à la fois. `GET /api/voix/:userId` suit les règles des photos : vérifié pour entrer, validé pour être entendu par les autres, audible par soi-même en attente, muet après un blocage.
4. ~~**Questions de compatibilité pour « Relation sérieuse »**~~ : fait pour le mariage et les enfants (`COMPAT` dans `config.js`, listes fermées, facultatives). Posées et rangées **uniquement en « Relation sérieuse »** — changer d'intention efface les réponses, pour qu'elles ne ressortent pas sans avoir été reconfirmées. Affichées sur la carte, **jamais un filtre** : elles renseignent, elles ne trient pas. Une valeur hors liste est refusée (règle 5.1). **La religion n'est volontairement pas un champ** : le raisonnement de `MATCH_POLICY` sur l'orientation vaut pour elle — une colonne interrogeable, croisée avec la ville et le quartier déjà stockés, est une liste de ciblage en cas de fuite ou de réquisition. Qui veut le dire l'écrit dans sa réponse libre, avec ses mots : du texte, pas un facteur de tri. Un test l'interdit nommément. **Le propriétaire l'a confirmé explicitement** au moment de la livraison (« concernant la religion, enlevons-la pour le moment ») : ce n'est pas un oubli, et une session future qui voudrait la rouvrir doit le lui redemander.
5. ~~**Explication de la jauge de confiance**~~ : fait (`server/jauge.js`). Un écran s'ouvre une fois juste après l'enregistrement du profil, et une ligne permanente le rouvre depuis l'onglet Profil ; les pastilles de la carte s'ouvrent aussi dessus. **La jauge a changé de dénominateur avant d'être expliquée** : elle affichait « sur 3 » alors que le garant était figé à `false` pour tout compte réel — seuls les profils de démonstration l'avaient. Personne ne pouvait dépasser 2 sur 3, et expliquer une jauge dans cet état aurait été expliquer une déception. Elle ne compte donc que les **critères ouverts** (selfie validé, trois mois d'ancienneté), tirés d'une **liste unique** que la carte, le score et l'écran d'explication lisent tous : deux endroits qui décrivent la même chose finissent par diverger, ici il n'y en a qu'un. Le garant, lui, ne la rejoindra pas : P1-6 est abandonné. Un critère inconnu de la liste est ignoré des deux côtés de la fraction (`test/jauge.test.js`).
6. ~~**Système de garant**~~ : **abandonné, et pour une raison qui vaut plus que celles du départ**. Le mot « garant » désigne quelqu'un comme répondant. L'app aurait beau ne promettre aucun recours, une personne arnaquée lirait qu'il y en a un et se retournerait vers le membre qui s'est porté garant — pour réclamer, ou pire. On fabriquerait une responsabilité qu'on ne peut pas tenir, entre deux personnes qu'on ne peut pas protéger l'une de l'autre. Les autres objections restaient contournables (il fallait d'abord donner une catégorie au bannissement, puisque rien ne distingue aujourd'hui « fermé pour arnaque » de « fermé pour autre chose ») ; celle-là ne l'est pas. **Le trou que le garant visait reste ouvert** — rien ne prouve qu'un compte vérifié est de bonne foi au-delà du selfie — mais il se comblera par la modération et la mesure, pas en nommant un répondant. **Décision explicite du propriétaire**, à ne pas rouvrir en croyant à un oubli.
7. ~~**Mode sortie en duo**~~ : **l'option est retirée de l'inscription** (`INTENTS` ne la propose plus), parce qu'elle promettait « rencontrer à quatre, avec un ami » alors que **rien dans le serveur ne traitait ce cas** — ni invitation d'ami, ni appariement à quatre : qui la choisissait obtenait un match ordinaire, en tête-à-tête. Un compte resté sur cette intention ne verrait plus personne (la découverte cherche la même intention chez les autres) : il **bascule vers Amitié à sa prochaine ouverture**, et le bot le lui dit — changer le profil de quelqu'un sans l'en informer serait pire que le laisser en panne. `INTENTS_RETIRES` garde le libellé pour que les profils pas encore rouverts s'affichent avec un mot plutôt qu'avec « undefined ». **Le mode reste à construire** : inscription à deux, appariement entre duos, discussion de groupe, et toutes les règles anti-arnaque à rejouer sur une conversation à plusieurs.
8. ~~**Plusieurs photos**~~ : fait. Trois emplacements (`PHOTO_SLOTS`), chacun modéré comme le selfie, avec ses propres boutons Valider/Refuser (`test/photos.test.js`).
9. ~~**Anglais**~~ : fait, fichiers de traduction chargés à la demande, langue de Telegram par défaut, choix dans le profil, bot traduit dans la langue de qui reçoit. `antiscam.js` est également ouvert à tous les pays. Reste à faire : le **pidgin** (`public/i18n/pcm.js` + `server/i18n.js`).
10. **Tableau de bord de modération** web protégé : **la porte est posée** (`server/moderation.js` : lien à usage unique, session par cookie signé, droit = administrateur du groupe revérifié à chaque requête) et l'espace montre déjà la file de vérification, les signalements et les comptes fermés. **L'écran est fait** : quatre vues sans JavaScript, fil de la discussion signalée avec trace de lecture. Reste ce qui n'est pas de la lecture — lieux partenaires et rotation des codes QR, paiements et remboursements.
11. **Temps réel** (WebSocket ou SSE) avec retour automatique au polling si la connexion est instable.

### Dette technique : ce qu'aucun point ci-dessus ne couvre

Ces points ne sont pas des fonctionnalités manquantes mais des choix qui ont vieilli, ou des
conséquences d'un chantier précédent. Aucun n'a de point de feuille de route attitré, et c'est
précisément pour cela qu'ils s'oublient.

1. ~~**Les compteurs de limitation de débit sont en mémoire**~~ : fait. Ils vivent maintenant **dans le stockage**, et chaque stockage répond à sa mesure : le fichier JSON garde une carte en mémoire — il est mono-instance par construction, et réécrire le fichier entier à chaque message coûterait cher pour une exactitude dont ce mode n'a pas besoin — tandis que **PostgreSQL les met en base** (table `rate_limits`, migration `003-limites.sql`), dans une transaction : lire puis écrire sans verrou est exactement ce qu'on cherchait à éviter, deux requêtes simultanées s'accorderaient le même dernier jeton. La purge des fenêtres mortes rejoint le balayage des six heures, sans quoi la table garderait une ligne par compte et par action pour toujours. **Le test qui compte** est `test/limites-instances.test.js` : il lance deux vrais processus Node sur la même base et vérifie qu'ils se partagent un seul quota — le reste de la suite passait déjà avant ce chantier et passerait encore si les compteurs repartaient en mémoire demain. Le sabotage y affiche exactement le symptôme de la dette : « 5 + 5 jetons pour une règle qui en autorise 5 ». Si le stockage ne répond pas, le garde-fou **laisse passer** en le journalisant : ce n'est pas une porte d'authentification, et une base injoignable fera échouer la requête deux lignes plus loin.
2. ~~**Analytique produit**~~ : fait, les quatre lots. Horodatages d'entonnoir, table `events` et sa purge, onze événements, et `npm run chiffres` qui lit l'entonnoir, l'activation, le churn, la métrique phare et les douze métriques d'encadrement. **Ce qui reste n'est pas du code** : la métrique phare est une borne haute tant que les codes des lieux partenaires sont fixes (point 4 ci-dessous), et aucun chiffre n'est rétroactif.
3. **`allUsers()` charge toute la table**, y compris sur PostgreSQL : `select * from users` sans `where` ni `limit`, désérialisé en objets JavaScript, puis filtré en mémoire (`candidat()` dans `routes.js`). **Cinq routes l'appellent, et l'une d'elles change la nature du problème** : `/summary` tourne **toutes les 20 secondes dans chaque app ouverte** (`setInterval` dans `public/app.js`). Ce n'est donc pas un coût par découverte, c'est une charge de fond proportionnelle à *comptes × apps ouvertes*. Et `/summary` charge tout le monde **pour un seul nombre** : `unread` et `newMatches` se calculent sur les matchs, `tous` ne sert qu'à compter les likes reçus.
   **Mesuré** (PostgreSQL local, cache chaud, meilleur de trois passages — donc le cas favorable) : 100 comptes → 2 ms et 0,08 Mo de tas par appel ; 500 → 5 ms ; 2 000 → 15 ms et 1,6 Mo ; 10 000 → 77 ms et 7,8 Mo. Environ **816 octets de tas par compte et par appel**. En production la base est sur une autre machine : ajouter l'aller-retour et le transfert de la table entière. À 2 000 comptes et 100 apps ouvertes, c'est 5 appels/s à 15 ms et 8 Mo/s de déchets à ramasser — sur une machine de **256 Mo**, la pression mémoire se voit avant le processeur.
   **Le seuil d'alerte est le produit comptes × apps simultanées, pas le nombre de comptes** : vers 1 000 comptes actifs, ou plus tôt si la mémoire se tend. En dessous, le corriger revient à optimiser un chiffre qu'on n'a pas encore.
   **Deux correctifs, de tailles très différentes.** Le petit : `/summary` n'a besoin que des gens qui m'ont liké, et ceux-là sont déjà connus par `store.swipesTo(me.id)`, chargé juste à côté — une heure de travail, supprime la boucle des 20 secondes, ne touche ni au schéma ni au filtre. Le vrai : une méthode de stockage `candidats(me, filtres)` que PostgreSQL implémente en `where` et que le fichier JSON implémente en filtrant sa map — même forme que les compteurs de limitation (point 1). Dans les deux cas c'est **le filtre qu'il faut descendre en SQL, pas le stockage qu'il faut changer**.
4. ~~**Le check-in est falsifiable**~~ : **la moitié devinable est corrigée, la moitié « présence » ne l'est pas.** Ce qui a été trouvé en le corrigeant est pire que ce que ce point décrivait : le code n'était pas seulement déductible de l'identifiant du lieu, **le serveur le donnait au navigateur** — `routes.js` renvoyait l'objet lieu entier, `code` compris, à chaque interrogation de la discussion. Deux autres routes le retiraient, celle-là non. Un code imprévisible n'aurait rien changé tant que l'API le distribuait. Aujourd'hui (`server/lieux.js`) le code est une **empreinte HMAC** du secret serveur et de l'identifiant, les lieux **ne portent plus de champ `code` du tout** (on ne laisse pas fuir ce qu'on ne transporte pas), la comparaison est à temps constant, le check-in est limité à 10 essais par heure, et `VENUE_SECRET` renouvelle tous les codes d'un coup. **Ce qui reste faux** : le code est *fixe* pour un lieu. Il prouve « j'ai vu ce QR », jamais « j'y suis en ce moment » — qui l'a scanné une fois peut le réutiliser des mois plus tard depuis chez lui. Il y faut un **code tournant affiché par le lieu** (prévu avec les lieux en base, P1-10), ou un horaire réel sur le rendez-vous : `slot` est aujourd'hui **du texte libre** (« Samedi, 11 h »), donc aucune fenêtre horaire n'est calculable sans le convertir en horodatage d'abord. Tant que c'est le cas, la métrique phare reste une borne haute et **on ne peut pas facturer un lieu au rendez-vous confirmé** (P2-1).
5. **Le corpus de non-régression d'`antiscam.js` est écrit à la main** : il fige des cas imaginés, pas des messages réellement signalés. À remplacer par les signalements de la bêta dès qu'il y en aura.
6. **Présence et réponses de démonstration en mémoire** : perdues au redémarrage, non partagées entre instances. Sans gravité, mais de la même famille que le point 1.

### P2 : monétisation B2B
1. **Espace lieux partenaires** : statistiques de rendez-vous confirmés, facturation mensuelle par rendez-vous.
2. **Fonctions sponsorisées** : nom d'une marque associé à une fonction gratuite (ex. vérification), sans transmettre de donnée personnelle.
3. **Carte bancaire pour la diaspora** sur la version web, si une structure juridique éligible existe.

## 8 bis. Ce qui attend le propriétaire

Trois points ne peuvent pas être réglés depuis le code, et **ne doivent donc pas être reproposés comme du travail à faire ici** : renseigner les pages publiques dans BotFather, les faire relire par un juriste, et déclarer le traitement à l'Autorité de protection des données. La liste tenue à jour, avec le détail de chacun, est dans le README, section « Avant d'ouvrir à de vraies personnes ».

## 9. Définition de « terminé »

Une tâche est terminée quand :
- [ ] `npm test` passe, avec de nouveaux tests pour la logique ajoutée ;
- [ ] le parcours fonctionne en mode développement dans un navigateur ;
- [ ] les éléments natifs Telegram concernés passent par `public/tg.js` ;
- [ ] les textes sont en français et suivent la section 5 ;
- [ ] aucune règle de sécurité, de données ou de paiement n'est affaiblie ;
- [ ] le README et `.env.example` sont à jour ;
- [ ] le résumé final explique comment tester sur un téléphone.

## 10. Cahier des charges : version web et paiement par mobile money (P0-6)

### 10.1 Objectif
Rendre la même application accessible hors de Telegram (PWA) et y vendre des **pass premium à durée fixe** payés en mobile money (MTN MoMo, Orange Money) via un agrégateur, sans jamais enfreindre la règle Telegram sur les biens numériques.

### 10.2 Règles non négociables
- **Origine de session** : chaque requête porte `session.origin` = `telegram` (initData validé) ou `web` (session web). Les prix en FCFA, les liens vers le site et tout texte d'incitation à payer hors Telegram sont **exclus** quand `origin === 'telegram'`. Le bot n'envoie jamais de lien de paiement ni de prix en FCFA.
- **Parité Stars** : tout pass vendu sur le web est aussi achetable en Stars dans la mini app (`sendInvoice`, devise `XTR`), à un prix équivalent.
- **Les droits premium sont la seule source de vérité** (table `entitlements`). Aucune interface ne décide seule.
- **Pas d'abonnement récurrent** : pass de 30 ou 90 jours, expiration franche, rappel neutre.
- **Aucune donnée de paiement sensible stockée** : jamais de code secret, jamais de numéro de carte ; le numéro mobile money est conservé haché avec un sel serveur, plus les 4 derniers chiffres en clair pour l'affichage.
- **Adaptateur par agrégateur** (`server/payments/providers/<nom>.js`) derrière une interface commune, pour changer de prestataire sans toucher au métier.
- Toute modification de cette section passe par une validation explicite du propriétaire.

### 10.3 Authentification web
Trois méthodes, dans cet ordre de préférence, toutes aboutissant au même `user_id` Telegram :
1. **Telegram Login Widget** : signature vérifiée côté serveur (même logique que `auth.js`, clé dérivée différemment ; se référer à la documentation « Checking authorization »).
2. **Code par le bot** : l'utilisateur saisit son identifiant ou pseudo ; le serveur envoie un code à 6 chiffres via le bot, valable 10 minutes, 5 essais, puis invalide.
3. **Code par SMS** (facultatif, derrière un indicateur d'activation) pour les personnes sans accès à Telegram.

Session web : cookie `HttpOnly`, `Secure`, `SameSite=Lax`, signé, durée 30 jours, révocable (`DELETE /api/web/session`). Table `web_sessions (id, user_id, created_at, expires_at, revoked_at, user_agent)`.

### 10.4 Schéma (PostgreSQL, migrations versionnées)
```
plans          (id text pk, name, days int, price_xaf int, price_stars int, active bool)
payments       (id uuid pk, user_id, plan_id, provider text, provider_ref text unique,
                payment_ref text unique, amount_xaf int, currency text,
                msisdn_hash text, msisdn_last4 text, operator text,
                status text check in ('pending','success','failed','expired','refunded'),
                origin text, raw_last jsonb, created_at, updated_at, completed_at)
payment_events (id bigserial pk, payment_id, kind text, payload jsonb, received_at)
entitlements   (id uuid pk, user_id, plan_id, source text check in ('momo','stars','sponsor','gift'),
                payment_id nullable, starts_at, ends_at, created_at)
refunds        (id uuid pk, payment_id, amount_xaf, reason, status, provider_ref, created_at)
```
Index : `payments(user_id, status)`, `entitlements(user_id, ends_at)`, `payment_events(payment_id)`.

### 10.5 Routes
| Méthode et route | Origine | Rôle |
|---|---|---|
| `GET /api/plans` | web, telegram | Liste des pass ; le prix affiché dépend de l'origine (`price_xaf` sur le web, `price_stars` dans Telegram) |
| `GET /api/me/premium` | toutes | `{ active, plan, ends_at, source }` |
| `POST /api/payments` | web uniquement | Corps `{ plan_id, msisdn }` ; crée un paiement `pending`, appelle l'adaptateur en mode push, renvoie `{ payment_id, status, expires_in }` |
| `GET /api/payments/:id` | web | Statut pour l'attente ; en cas de `pending` de plus de 60 s, réinterroge l'agrégateur avant de répondre |
| `POST /api/payments/:id/retry` | web | Nouvelle demande push (nouvelle référence, ancien paiement passé en `expired`), 3 tentatives par heure |
| `POST /api/payments/webhook/:provider` | agrégateur | Vérifie l'authenticité, journalise dans `payment_events`, confirme le statut auprès de l'API du prestataire, puis active si `success` |
| `POST /api/stars/invoice` | telegram uniquement | Crée une facture Telegram en `XTR` pour le pass choisi |
| Webhook bot `successful_payment` | Telegram | Crée `payments(provider='stars')` et l'entitlement |
| `POST /api/web/auth/telegram`, `/api/web/auth/bot-code`, `DELETE /api/web/session` | web | Authentification et déconnexion |

### 10.6 Parcours push (référence)
1. Web : choix du pass, saisie du numéro (opérateur déduit du préfixe, numéro mémorisé haché).
2. Serveur : ligne `payments` en `pending`, appel à l'adaptateur avec `payment_ref` unique, `notify_url`, montant, numéro.
3. Agrégateur : demande de validation sur le téléphone (USSD ou notification MoMo/OM).
4. Web : page « Valide sur ton téléphone », interrogation toutes les 3 s, 120 s au plus, puis options « Renvoyer », « Changer d'opérateur », « Réessayer plus tard ».
5. Webhook : authentification, idempotence par `provider_ref`, confirmation de statut par appel API, transition `pending → success`, création de l'entitlement (`starts_at` = maintenant ou fin du pass en cours, `ends_at` = + jours).
6. Bot : message neutre « Ton pass est actif jusqu'au … », sans lien ni prix.

### 10.7 Cas d'échec à gérer
- Pas de réponse en 120 s : `expired`, proposition de renvoi.
- Solde insuffisant ou refus : `failed`, message explicite, proposition de l'autre opérateur.
- Webhook reçu après expiration : honoré quand même (l'argent est parti), entitlement créé, journalisé.
- Webhook en double : ignoré grâce à `provider_ref unique`.
- Webhook perdu : tâche de réconciliation toutes les 10 min sur les `pending` de plus de 5 min ; passage en `expired` après 24 h sans confirmation.
- Double débit avéré : `refunds` via l'API de transfert de l'agrégateur, statut `refunded`, notification à la modération.
- Numéro utilisé par plus de 3 comptes : paiement refusé, alerte modération.
- Pass acheté alors qu'un pass est actif : prolongation (empilement), jamais de perte.

### 10.8 Interface web
- Même base de code que la mini app (`public/`), avec `tg.js` en mode hors Telegram complet (barre de boutons, dialogues, scanner QR par la caméra du navigateur ou saisie manuelle).
- Manifeste PWA, icône, écran hors ligne, installation sur l'écran d'accueil.
- Page premium sur le web uniquement : plans, avantages, numéro, attente, résultat. Textes en français, tutoiement, prix en FCFA.
- Rappel d'expiration : sur le web (bandeau) ; dans Telegram, message neutre du bot sans lien.

### 10.9 Variables d'environnement
```
WEB_SESSION_SECRET=        secret de signature des sessions web (obligatoire en production)
PAYMENT_PROVIDER=monetbil  monetbil | campay | notchpay | mock
PAYMENT_SERVICE_KEY=       clé du service chez l'agrégateur
PAYMENT_SERVICE_SECRET=    secret de vérification des webhooks
PAYMENT_PUSH_TIMEOUT_SEC=120
PAYMENT_MAX_ACCOUNTS_PER_MSISDN=3
SMS_LOGIN_ENABLED=false
```
Le fournisseur `mock` simule les réponses (succès, échec, expiration, doublon) pour les tests et le mode développement.

### 10.10 Tests exigés
- Adaptateur `mock` : succès, échec, expiration, webhook en double, webhook tardif, webhook forgé (rejeté).
- Idempotence : deux webhooks identiques ne créent qu'un entitlement.
- Réconciliation : un `pending` sans webhook est résolu par l'appel de statut.
- Empilement : achat pendant un pass actif prolonge `ends_at`.
- Origine : une requête `telegram` vers `POST /api/payments` reçoit 403 ; `GET /api/plans` ne renvoie jamais `price_xaf` à une origine `telegram`.
- Authentification web : Login Widget valide/invalide/expiré ; code bot expiré ou épuisé.
- Stars : `successful_payment` crée paiement et entitlement ; la facture Stars n'est jamais émise pour une origine `web`.
- Bout en bout : parcours complet d'achat en mode `mock` dans le navigateur.

### 10.11 Livrables
- Migrations, adaptateurs (`mock` + un agrégateur réel), routes, page premium, manifeste PWA.
- README : section « Version web et paiements », guide pour obtenir les clés chez l'agrégateur, procédure de remboursement.
- `.env.example` mis à jour.
- Tableau de bord de modération : au minimum une liste des paiements avec filtre par statut et bouton de remboursement (peut être livré dans P1-10 si trop lourd, à condition qu'un script en ligne de commande existe entre-temps).

