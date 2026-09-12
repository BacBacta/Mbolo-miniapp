# Mbolo : instructions pour l'agent de code

Tu reprends **Mbolo**, une mini app Telegram de rencontres vérifiées pour l'Afrique francophone, lancée d'abord à Yaoundé (Cameroun). Le prototype fonctionne : il a été testé sur un vrai téléphone Android dans Telegram. Ton rôle est de le faire évoluer vers une bêta fermée, sans casser ce qui marche.

Lis ce fichier en entier avant toute modification.

---

## 1. Le produit en une phrase

Des rencontres entre personnes réelles et vérifiées, dans des lieux publics, sans arnaques ni demandes d'argent.

**Cible :** étudiants et jeunes actifs de 18 à 30 ans, sur des téléphones Android d'entrée de gamme, avec des forfaits data limités et un réseau parfois instable.

**Promesse de sécurité (non négociable) :**
- tous les profils sont vérifiés par selfie avec un geste aléatoire ;
- aucune demande ou offre d'argent n'est possible dans les discussions ;
- les pseudos et numéros Telegram ne sont jamais montrés aux autres ;
- les premiers rendez-vous se font dans des lieux publics partenaires, avec confirmation d'arrivée par QR code.

---

## 2. Stack technique

- **Serveur :** Node.js 20 ou plus, Express 4, modules ES (`"type": "module"`).
- **Bot :** grammY (interrogation longue en local, webhook en production).
- **Interface :** HTML, CSS et JavaScript sans framework ni étape de build, SDK officiel `telegram-web-app.js`.
- **Stockage :** PostgreSQL si `DATABASE_URL` est défini (`server/store.pg.js`, migrations SQL versionnées), sinon fichier JSON avec écriture atomique (`server/store.json.js`). `server/store.js` choisit ; les deux offrent la même interface, asynchrone.
- **Tests :** `node --test test/*.test.js` (lancé par `npm test`). La même suite tourne sur PostgreSQL avec `npm run test:pg` (un schéma par fichier de test) ; les deux passent en CI.
- **Nom de l'app :** variable `APP_NAME` (par défaut `Mbolo`), injectée dans `index.html` par le serveur.
- **Dépendances :** `express`, `grammy`, `qrcode`, `dotenv`, `pg`. N'en ajoute pas sans justification.

## 3. Organisation du code

```
server/
  index.js      Serveur Express, en-têtes de sécurité, QR codes des lieux (/qr/:id.png?key=)
  config.js     Variables d'environnement, lieux partenaires, listes (intentions, genres)
  geo.js        Pays (liste ISO), noms localisés, clé de comparaison des villes, suggestions, fuseau → pays
  auth.js       Validation HMAC de Telegram.WebApp.initData, middleware requireAuth
  routes.js     API REST sous /api
  bot.js        Commandes du bot, modération des selfies, notify(), notifyAdmin()
  antiscam.js   checkMessage() : blocage argent (contextuel), liens, numéros, pseudos
  limites.js    Limitation de débit par compte et par action, en mémoire
  compression.js Compression gzip des fichiers et des réponses d'API
  i18n.js       Langue de chaque personne, dictionnaire des messages du bot
  store.js      Choix du stockage selon DATABASE_URL, et rien d'autre
  store.json.js Stockage fichier JSON : défaut, une seule instance, présence en mémoire
  store.pg.js   Stockage PostgreSQL : même interface, transactions, plusieurs instances
  db/migrate.js Lanceur de migrations (verrou consultatif, une transaction par fichier)
  db/migrations/ Migrations SQL, appliquées une fois chacune, jamais modifiées après coup
  seed.js       Profils de démonstration (SEED_DEMO=true)
public/
  index.html    Charge telegram-web-app.js puis app.js
  tg.js         Seul point d'accès au SDK Telegram, avec secours hors Telegram
  app.js        Écrans (objet SCREENS), navigation go(), appels api()
  ui.js         Icônes, toast, squelettes de chargement, geste de balayage des cartes
  i18n.js       Choix de la langue, chargement du dictionnaire à la demande, t() et tn()
  i18n/en.js    Dictionnaire anglais ; la clé est la phrase française
  styles.css    Identité « Aura » : surfaces d'encre ou d'os selon data-scheme, aura réservée au match, au badge et au like ; Fraunces pour l'identité, Manrope pour l'interface
test/
  activity, antiscam, assets, auth, compression, filters, geographie, langues,
  limites, moderation, notifications, photos, production, profiles, rendezvous,
  securite, stockage, webhook (128 tests, tous rejoués sur PostgreSQL par npm run test:pg)
scripts/
  import-json.js Reprise d'un db.json existant vers PostgreSQL
  test-pg.js     La suite complète sur PostgreSQL, un schéma par fichier de test
audit/
  Dossier d'audit du parcours : benchmark, mesures, constats, risques, plan
```

## 4. Fonctionnalités en place

| Domaine | État |
|---|---|
| Authentification | `Authorization: tma <initData>` validé côté serveur (HMAC, expiration 24 h, champ `signature` toléré). Mode développement `x-dev-user` si `ALLOW_DEV_AUTH=true` et hors production |
| Profil | Prénom, âge 18+, genre, intention (amitié, relation sérieuse, sortie en duo), pays, ville libre, quartier, question, langues, jusqu'à trois photos facultatives, chacune modérée, compressées côté client |
| Vérification | Geste aléatoire, selfie envoyé au groupe de modération avec boutons Valider/Refuser, selfie supprimé après décision. `AUTO_APPROVE` valide sans humain, **pour les tests seulement** : il est éteint dès que `NODE_ENV=production`, et le serveur y refuse de démarrer sans `ADMIN_CHAT_ID`. Le groupe est interrogé au démarrage (`verifierGroupeModeration`) pour qu'un bot absent du groupe se voie au déploiement. Si un selfie ou une photo ne parvient pas à partir alors que la modération est configurée, l'envoi est **défait** et la personne est invitée à réessayer, au lieu d'attendre une décision que personne ne peut prendre |
| Langues | Français et anglais. Choix explicite dans le profil, sinon la langue du Telegram, sinon le français. Interface traduite chez la personne (`public/i18n.js` + `public/i18n/<code>.js`, chargés à la demande), messages du bot traduits côté serveur (`server/i18n.js`) dans la langue de **qui reçoit**. `PUT /api/me/lang` |
| Localisation | Pays deviné au premier lancement depuis le fuseau du téléphone (`paysDuFuseau` dans `server/geo.js`, table dérivée de zone.tab). Le navigateur passe `?tz=` à `GET /api/me`, le serveur répond `options.suggestedCountry`. **Le fuseau n'est ni stocké ni journalisé, aucun GPS n'est demandé.** Il donne le pays, jamais la ville. Bouton « Ma position : {pays} » dans les filtres. Le choix de la personne l'emporte toujours |
| Découverte | Même zone de recherche et même intention, 20 profils par jour, ceux qui t'ont liké en premier, économie de data (photos à la demande) |
| Match et discussion | Discussion plein écran, polling toutes les 4 s, non lus, présence (pas de notification si la personne lit) |
| Notifications bot | Match, message (limité à une par discussion toutes les 2 min), « tu as plu à quelqu'un » (une par jour), test depuis l'onglet Profil, bouton qui rouvre le bon écran (`?screen=chat&match=`) |
| Anti-arnaque | Argent bloqué (texte normalisé contre les contournements : points, lettres détachées, « O » pour zéro), contacts bloqués avant 10 messages, profil et créneau de rendez-vous sans contact ni argent. **International** : 34 familles de moyens de paiement, 56 devises, vocabulaire français et anglais, numéros de n'importe quel indicatif (E.164 ou neuf chiffres). Deux paliers de moyens : inconditionnels, et ambigus (`om`, `visa`, `wave`, `wise`) qui ne bloquent pas seuls mais tiennent le rôle d'objet d'argent |
| Rendez-vous | Proposition dans un lieu partenaire, puis **accepter, refuser ou annuler** : statuts `proposed`, `accepted`, `declined`, `cancelled`, notification du bot à chaque changement. L'invité accepte ou refuse ; celui qui propose annule sa proposition ; une fois accepté, chacun peut se décommander. **Le check-in par `showScanQrPopup` n'est possible que sur un rendez-vous accepté.** Un seul rendez-vous vivant par discussion. `PUT /api/dates/:id` |
| Sécurité | Signaler et bloquer, guide anti-chantage, suppression complète du compte |
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

- Sans `DATABASE_URL`, le stockage reste un seul fichier JSON : pas de concurrence entre plusieurs instances, pas de sauvegarde automatique. C'est le mode par défaut, pratique pour développer, à ne pas garder en production.
- `allUsers()` charge toute la table, y compris sur PostgreSQL : la découverte filtre en mémoire. Tenable pour quelques centaines de comptes ; au-delà, c'est le filtre de découverte qu'il faudra descendre en SQL, pas le stockage qu'il faudra changer.
- Les notifications partent sans retenir la réponse HTTP. Un test qui les compte doit donc les attendre (voir `test/rendezvous.test.js`), pas les lire aussitôt après l'appel.
- Présence et réponses de démo en mémoire : perdues au redémarrage.
- Discussion par polling toutes les 4 secondes.
- Pas d'interface de modération en dehors du groupe Telegram. Si le groupe devient injoignable, plus personne ne peut être vérifié : le serveur le signale au démarrage et les personnes concernées sont invitées à réessayer, mais rien ne prévient l'exploitant en cours de route.
- Lieux partenaires codés en dur dans `config.js`, codes QR fixes, et seulement au Cameroun : ailleurs, le rendez-vous avec confirmation d'arrivée n'est pas disponible.
- Compteurs de limitation de débit en mémoire : remis à zéro au redémarrage, non partagés entre instances.
- `server/antiscam.js` couvre maintenant tous les pays, avec trois limites connues : les pays à **mobiles à 8 chiffres** (Togo, Gabon) ne sont attrapés que sous la forme `+indicatif` ; un numéro **écrit en toutes lettres** (« six sept sept… ») n'est vu que s'il est annoncé (« mon numéro ») ; et le vocabulaire ne couvre que le **français et l'anglais** — une demande écrite dans une autre langue échappe aux règles de formulation, mais pas à celles des numéros ni des moyens de paiement, qui ne dépendent pas de la langue.
- Le corpus de non-régression d'`antiscam.js` reste écrit à la main : il fige chaque cas nommé, il ne mesure pas le comportement de vrais utilisateurs. À remplacer par les messages réellement signalés pendant la bêta.
- La localisation s'arrête au **pays** : le fuseau ne distingue pas Yaoundé de Douala, et l'app ne demande pas le GPS. La ville reste écrite par la personne, avec des suggestions pour 33 pays seulement.
- Traduction : le français et l'anglais seulement. Les noms de pays viennent d'`Intl.DisplayNames` (donc traduits automatiquement), mais les villes, les quartiers et les textes saisis par les membres restent tels quels.
- Aucune analytique produit : aucun entonnoir, aucune cohorte, aucune courbe de rétention n'est calculable. Voir `audit/05-mesure-produit.md`.
- `SEED_DEMO=true` reste possible en production : c'est un choix assumé pour une machine de démonstration, pas un garde-fou. De vraies personnes y écriraient à des profils fictifs. `AUTO_APPROVE`, lui, n'a plus d'effet en production, et le serveur refuse de démarrer sans `ADMIN_CHAT_ID` (`test/production.test.js`).
- Le **verre** (flou d'arrière-plan) a un repli opaque quand le navigateur ne sait pas flouter ou quand la personne demande moins de transparence (`--glass-blur` et ses trois jetons de fond, dans `styles.css`). Un téléphone qui sait flouter mais le rend lentement garde le flou : aucune règle CSS ne distingue ce cas, seul un vrai Android d'entrée de gamme le dira.
- Les tests de bout en bout dans un navigateur ont été faits manuellement avec Playwright, ils ne sont pas dans le dépôt.

## 8. Feuille de route

L'ordre est contraignant : chaque tâche suppose les précédentes terminées.

### P0 : indispensable avant une bêta fermée
1. ~~**Intégration continue GitHub Actions**~~ : fait, `.github/workflows/ci.yml` lance `npm ci`, `npm test` et `npm audit` sur chaque pull request et chaque poussée vers `main`, en Node 20 et 22.
2. ~~**Migration vers PostgreSQL**~~ : fait. `DATABASE_URL` bascule le stockage vers `server/store.pg.js`, les migrations SQL de `server/db/migrations/` s'appliquent à l'import du module, et `scripts/import-json.js` reprend un `db.json` existant sans doublon. La suite complète passe sur les deux stockages, en CI comme en local (`npm run test:pg`).
3. ~~**Limitation des requêtes** par utilisateur~~ : fait pour messages, balayages, signalements, vérification, photos, rendez-vous et profil (`server/limites.js`, sans dépendance). Reste à couvrir : les paiements, quand ils existeront.
4. ~~**Accepter ou refuser un rendez-vous**~~ : fait, `PUT /api/dates/:id` avec les quatre statuts, notification à chaque changement, check-in réservé aux rendez-vous acceptés, un seul rendez-vous vivant par discussion, et l'identifiant Telegram de qui propose ne sort plus du serveur (`test/rendezvous.test.js`).
5. ~~**Défaire un match**~~ : fait, `DELETE /api/matches/:id`, sans notification, avec blocage sans accusation et six motifs de signalement.
6. **Version web et paiement par mobile money** : voir la section 10, cahier des charges complet.
7. **Tests de bout en bout** Playwright dans le dépôt (mode développement), lancés en CI.
8. **Pages publiques** `/confidentialite` et `/conditions`, liées depuis l'accueil, le site et le README.
9. **Déploiement** : Dockerfile, volume persistant, contrôle `/health`, guide pas à pas pour un hébergeur.
10. ~~**Traiter les vulnérabilités `npm audit`**~~ : fait, `qs` est forcé en 6.16.0 par un `overrides` dans `package.json`, sans changement majeur d'`express`. `npm audit` ne signale plus rien.

### P1 : produit (aligné sur le standard du marché)
1. **Détection des doublons de visage** : à la validation du selfie, calcul d'une empreinte non réversible (modèle open source côté serveur), comparaison aux empreintes existantes, refus si le visage est déjà lié à un autre compte actif. Le selfie reste supprimé ; seule l'empreinte est conservée, déclarée comme donnée biométrique dans le dossier de protection des données.
2. **Partage du rendez-vous avec une personne de confiance** : contact Telegram désigné dans le profil, prévenu par le bot à la proposition acceptée et à l'arrivée confirmée.
3. **Présentation vocale** de 15 secondes (enregistrement, compression, lecture), désactivable en économie de data.
4. **Questions de compatibilité pour « Relation sérieuse »** : projet de mariage, désir d'enfants, religion (optionnelle, masquée par défaut). Jamais d'orientation ni d'ethnie.
5. **Explication de la jauge de confiance** à l'inscription (écran unique, 3 lignes).
6. **Système de garant** : un membre vérifié peut se porter garant de 3 personnes au plus ; il perd son badge si l'une est bannie pour arnaque.
7. **Mode sortie en duo complet** ou retrait de l'option de l'inscription tant qu'il n'est pas terminé.
8. **Plusieurs photos** (3 au plus) avec modération.
9. ~~**Anglais**~~ : fait, fichiers de traduction chargés à la demande, langue de Telegram par défaut, choix dans le profil, bot traduit dans la langue de qui reçoit. `antiscam.js` est également ouvert à tous les pays. Reste à faire : le **pidgin** (`public/i18n/pcm.js` + `server/i18n.js`).
10. **Tableau de bord de modération** web protégé : selfies en attente, signalements, bannissements, lieux partenaires et rotation des codes QR, paiements et remboursements.
11. **Temps réel** (WebSocket ou SSE) avec retour automatique au polling si la connexion est instable.

### P2 : monétisation B2B
1. **Espace lieux partenaires** : statistiques de rendez-vous confirmés, facturation mensuelle par rendez-vous.
2. **Fonctions sponsorisées** : nom d'une marque associé à une fonction gratuite (ex. vérification), sans transmettre de donnée personnelle.
3. **Carte bancaire pour la diaspora** sur la version web, si une structure juridique éligible existe.

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

