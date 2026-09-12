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
- **Stockage :** fichier JSON avec écriture atomique (`server/store.js`), à migrer vers PostgreSQL.
- **Tests :** `node --test test/*.test.js` (lancé par `npm test`).
- **Nom de l'app :** variable `APP_NAME` (par défaut `Mbolo`), injectée dans `index.html` par le serveur.
- **Dépendances :** `express`, `grammy`, `qrcode`, `dotenv`. N'en ajoute pas sans justification.

## 3. Organisation du code

```
server/
  index.js      Serveur Express, en-têtes de sécurité, QR codes des lieux (/qr/:id.png?key=)
  config.js     Variables d'environnement, lieux partenaires, listes (intentions, genres)
  geo.js        Pays (liste ISO), noms localisés, clé de comparaison des villes, suggestions
  auth.js       Validation HMAC de Telegram.WebApp.initData, middleware requireAuth
  routes.js     API REST sous /api
  bot.js        Commandes du bot, modération des selfies, notify(), notifyAdmin()
  antiscam.js   checkMessage() : blocage argent (contextuel), liens, numéros, pseudos
  limites.js    Limitation de débit par compte et par action, en mémoire
  compression.js Compression gzip des fichiers et des réponses d'API
  i18n.js       Langue de chaque personne, dictionnaire des messages du bot
  store.js      Accès aux données, présence en mémoire, non lus
  seed.js       Profils de démonstration (SEED_DEMO=true)
public/
  index.html    Charge telegram-web-app.js puis app.js
  tg.js         Seul point d'accès au SDK Telegram, avec secours hors Telegram
  app.js        Écrans (objet SCREENS), navigation go(), appels api()
  ui.js         Icônes, toast, squelettes de chargement, geste de balayage des cartes
  i18n.js       Choix de la langue, chargement du dictionnaire à la demande, t() et tn()
  i18n/en.js    Dictionnaire anglais ; la clé est la phrase française
  styles.css    Design : couleurs dérivées des variables --tg-theme-* (clair et sombre), Instrument Serif pour l'identité, Manrope pour l'interface, composants, animations
test/
  activity, antiscam, assets, auth, compression, filters, geographie, langues,
  limites, notifications, photos, profiles, securite, webhook (87 tests)
audit/
  Dossier d'audit du parcours : benchmark, mesures, constats, risques, plan
```

## 4. Fonctionnalités en place

| Domaine | État |
|---|---|
| Authentification | `Authorization: tma <initData>` validé côté serveur (HMAC, expiration 24 h, champ `signature` toléré). Mode développement `x-dev-user` si `ALLOW_DEV_AUTH=true` et hors production |
| Profil | Prénom, âge 18+, genre, intention (amitié, relation sérieuse, sortie en duo), pays, ville libre, quartier, question, langues, jusqu'à trois photos facultatives, chacune modérée, compressées côté client |
| Vérification | Geste aléatoire, selfie envoyé au groupe de modération avec boutons Valider/Refuser, selfie supprimé après décision, `AUTO_APPROVE` pour les tests |
| Langues | Français et anglais. Choix explicite dans le profil, sinon la langue du Telegram, sinon le français. Interface traduite chez la personne (`public/i18n.js` + `public/i18n/<code>.js`, chargés à la demande), messages du bot traduits côté serveur (`server/i18n.js`) dans la langue de **qui reçoit**. `PUT /api/me/lang` |
| Découverte | Même zone de recherche et même intention, 20 profils par jour, ceux qui t'ont liké en premier, économie de data (photos à la demande) |
| Match et discussion | Discussion plein écran, polling toutes les 4 s, non lus, présence (pas de notification si la personne lit) |
| Notifications bot | Match, message (limité à une par discussion toutes les 2 min), « tu as plu à quelqu'un » (une par jour), test depuis l'onglet Profil, bouton qui rouvre le bon écran (`?screen=chat&match=`) |
| Anti-arnaque | Argent bloqué (texte normalisé contre les contournements), contacts bloqués avant 10 messages, profil sans contact ni argent |
| Rendez-vous | Proposition dans un lieu partenaire, check-in par `showScanQrPopup`, notification à l'autre personne |
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

### Règles Telegram et paiements
7. **Aucune vente de bien ou service numérique à l'utilisateur dans la mini app** (premium, boosts, likes) autrement qu'en Telegram Stars : c'est la règle de Telegram. Ne propose pas non plus de lien externe pour les payer. Le premium en mobile money n'existe que sur la version web, selon la section 10.
8. **Aucune crypto, aucun jeton, aucun mécanisme « tap-to-earn »** (zone grise réglementaire dans la CEMAC).
9. **Monétisation prévue** : pass premium à durée fixe (mobile money sur le web, Stars dans Telegram), services physiques payés par mobile money, et B2B (lieux partenaires payés par rendez-vous confirmé, fonctions sponsorisées). Pas de publicité tierce dans les écrans de rencontre.

### Interface
10. **Le français est la langue source**, tutoiement, phrases courtes, casse de phrase (pas de Majuscules À Chaque Mot), sans « s'il vous plaît », sans point d'exclamation dans les messages système. Le texte s'écrit en français **dans** l'appel de traduction : `t('Envoyer la proposition')` côté interface, `notify(id, 'Écrire', …)` côté bot. La clé de traduction **est la phrase française** : une phrase non traduite s'affiche en français, jamais sous forme d'identifiant. Toute phrase ajoutée à l'interface doit aussi être ajoutée à `public/i18n/en.js` — un test le vérifie.
11. **Les erreurs disent ce qui se passe et quoi faire** : « Ce code ne correspond pas à Le Palmier. Scanne le code posé sur ta table. »
12. **Le nom de l'app n'est jamais écrit en dur** : `config.appName` côté serveur, constante `APP` côté interface (injectée par le serveur depuis `APP_NAME`).
13. **Toute action principale passe par `tg.setButtons()`**, toute navigation arrière par `tg.setBack()`. N'appelle jamais `window.Telegram.WebApp` en dehors de `public/tg.js`.
14. **Couleurs uniquement via les variables du thème Telegram** : l'app doit être lisible en clair et en sombre.
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

- Stockage JSON en un seul fichier : pas de concurrence entre plusieurs instances, pas de sauvegarde automatique.
- Présence et réponses de démo en mémoire : perdues au redémarrage.
- Pas de limitation du nombre de requêtes (anti-spam).
- Une proposition de rendez-vous ne peut être ni acceptée ni refusée : elle reste « proposée ».
- Discussion par polling toutes les 4 secondes.
- Pas d'interface de modération en dehors du groupe Telegram.
- Lieux partenaires codés en dur dans `config.js`, codes QR fixes, et seulement au Cameroun : ailleurs, le rendez-vous avec confirmation d'arrivée n'est pas disponible.
- Compteurs de limitation de débit en mémoire : remis à zéro au redémarrage, non partagés entre instances.
- `server/antiscam.js` reste calibré sur le Cameroun : préfixe `+237`, numéros à 9 chiffres commençant par 6, MTN MoMo et Orange Money, montants en F CFA. Hors de la zone, un numéro étranger ou un autre moyen de paiement peut passer. À élargir avant d'ouvrir un autre pays pour de vrai.
- Traduction : le français et l'anglais seulement. Les noms de pays viennent d'`Intl.DisplayNames` (donc traduits automatiquement), mais les villes, les quartiers et les textes saisis par les membres restent tels quels.
- Aucune analytique produit : aucun entonnoir, aucune cohorte, aucune courbe de rétention n'est calculable. Voir `audit/05-mesure-produit.md`.
- `fly.toml` et `render.yaml` livrent `AUTO_APPROVE=true` et `SEED_DEMO=true` en production, et aucun ne définit `ADMIN_CHAT_ID` : la vérification par selfie est débranchée sur l'app déployée. Voir `audit/04-risques.md`.
- Les tests de bout en bout dans un navigateur ont été faits manuellement avec Playwright, ils ne sont pas dans le dépôt.

## 8. Feuille de route

L'ordre est contraignant : chaque tâche suppose les précédentes terminées.

### P0 : indispensable avant une bêta fermée
1. ~~**Intégration continue GitHub Actions**~~ : fait, `.github/workflows/ci.yml` lance `npm ci`, `npm test` et `npm audit` sur chaque pull request et chaque poussée vers `main`, en Node 20 et 22.
2. **Migration vers PostgreSQL** avec migrations versionnées (`node-pg-migrate` ou équivalent léger), en gardant l'interface de `store.js` ; script d'import depuis `db.json`. Obligatoire avant tout paiement.
3. ~~**Limitation des requêtes** par utilisateur~~ : fait pour messages, balayages, signalements, vérification, photos, rendez-vous et profil (`server/limites.js`, sans dépendance). Reste à couvrir : les paiements, quand ils existeront.
4. **Accepter ou refuser un rendez-vous** : statuts `proposed`, `accepted`, `declined`, `cancelled` ; notification à chaque changement ; le check-in n'est possible que si le rendez-vous est accepté.
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
9. ~~**Anglais**~~ : fait, fichiers de traduction chargés à la demande, langue de Telegram par défaut, choix dans le profil, bot traduit dans la langue de qui reçoit. Reste à faire : le **pidgin** (`public/i18n/pcm.js` + `server/i18n.js`), et l'élargissement d'`antiscam.js` hors du Cameroun.
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

