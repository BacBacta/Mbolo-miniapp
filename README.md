# Mbolo : rencontres vérifiées, face à face

**Mbolo** signifie « salut, bienvenue » dans plusieurs langues d'Afrique centrale. C'est le mot qu'on dit en arrivant, au moment où deux personnes se rencontrent pour de vrai : c'est exactement la promesse de l'app. Il est court, se prononce de la même façon en français et en anglais, et se retient du premier coup.

> Le nom se change sans toucher au code : variable `APP_NAME` dans `.env` (voir « Changer le nom de l'application »).

Prototype déployable d'une mini app de rencontres, ouverte à tous les pays et pensée d'abord pour l'Afrique francophone : profils vérifiés par selfie, demandes d'argent bloquées, rendez-vous dans des lieux publics partenaires avec confirmation d'arrivée par QR code, mode économie de data.

Ce dépôt contient tout ce qu'il faut pour la tester sur ton propre téléphone en une heure environ.

---

## Ce que fait l'application

| Fonction | Comment c'est fait |
|---|---|
| Connexion sans mot de passe | Identité Telegram, signature vérifiée côté serveur (`server/auth.js`) |
| Profil 18+ | Âge contrôlé, ni numéro ni lien accepté dans le profil |
| Vérification par selfie | Geste aléatoire, valable 10 minutes et à usage unique, selfie envoyé à ta discussion de modération avec les boutons Valider / Refuser, puis **supprimé du disque et du groupe**. Un selfie que personne n'a tranché est supprimé au bout de sept jours et le compte peut recommencer. Un compte déjà vérifié ne repasse jamais par là |
| États vides | Un paquet vide dit lequel des trois cas se présente : personne d'autre dans ta ville, tous les profils de ta tranche d'âge déjà vus, ou limite du jour atteinte. Chacun propose le geste correspondant |
| Zone de recherche | Le **pays** vient d'une liste de 243 entrées, la **ville** s'écrit librement. Dans les filtres, tu choisis où tu veux rencontrer : une ville, ou tout un pays, le tien ou un autre. Ta zone décide de qui tu vois, jamais de qui te voit. Un état vide garde la barre de zone et propose « Changer de zone » : l'écran qui te dit d'en changer est aussi celui d'où tu peux le faire. Les noms de pays s'affichent dans la langue de la personne, sans table de traduction (`Intl.DisplayNames`) |
| Localisation | Le **pays est deviné au premier lancement** à partir du fuseau horaire du téléphone : pas de permission à accorder, pas de GPS, pas de service externe, pas de requête en plus. Le navigateur envoie son fuseau (`Africa/Dakar`), le serveur renvoie un code pays (`SN`) — **le fuseau n'est ni stocké ni journalisé**. Le fuseau donne le pays, jamais la ville : celle-ci reste écrite par la personne, avec des suggestions. Dans les filtres, un bouton « Ma position : Cameroun » ramène la zone là où tu es, en un geste. Rien ne s'applique tout seul : le choix de la personne l'emporte toujours (`server/geo.js`, `paysDuFuseau`) |
| Langues | **Cinq langues** : français, anglais, espagnol, portugais et swahili. Le choix se fait **dès le premier écran**, avant de créer quoi que ce soit — sans quoi il fallait comprendre la page pour trouver le réglage qui l'aurait rendue lisible. Chaque langue est nommée dans sa propre langue. La langue vient de ton choix, sinon de celle de ton Telegram, sinon du français. Le bot écrit à chacun dans sa langue, pas dans celle de la personne qui a déclenché la notification. **Un dictionnaire n'est téléchargé que par qui lit cette langue** : une personne qui lit en français ne paie rien. Une phrase non traduite s'affiche en français, jamais sous forme d'identifiant, et un test compare chaque dictionnaire à l'anglais clé par clé. Ajouter une langue = un fichier. **L'espagnol, le portugais et le swahili ont été traduits sans locuteur natif** : à faire relire avant d'ouvrir la bêta dans un pays qui les lit |
| Découverte | Profils vérifiés de la même zone et de la même intention, dans la tranche d'âge que tu choisis, 20 « J'aime » par jour, les profils passés ne comptant pas, ceux de ton quartier d'abord (sans jamais demander ta position). Badge « Nouveau » la première semaine. Une vue **Liste** montre tous les profils compatibles, balayés ou non, avec leur statut (aimé, passé, match) et des vignettes chargées à l'apparition, jamais en économie de data ; la parcourir ne consomme rien, seul un « J'aime » compte, et un « Passer » peut y être rattrapé |
| Match et discussion | En tête de Messages, ceux qui ont aimé ton profil et attendent ta réponse (visibles quel que soit leur âge). La liste marque « à toi » quand c'est à toi de répondre. Discussion plein écran, en-tête qui ouvre la fiche de la personne, heure des messages, compteur de non lus, pseudos Telegram jamais montrés |
| Activité | « En ligne récemment », « aujourd'hui » ou « cette semaine », jamais l'heure exacte ni de temps réel. La tranche fine est réservée aux matchs ; en découverte, « cette semaine » au plus |
| Notifications | Le bot prévient d'un match, d'un message ou d'un like (« tu as plu à quelqu'un », une fois par jour), mais pas si la personne lit déjà la discussion |
| Onglet Profil | Jusqu'à **3 photos**, chacune validée par la modération avant d'être montrée (refusée : supprimée, et la personne sait pourquoi) ; sur la carte, on change de photo en touchant la moitié droite ou gauche. Taux de complétion avec les étapes qui manquent (photo, quartier, langues), chacune ouvrant directement la bonne étape du formulaire. Aperçu de son profil tel que les autres le voient, en sections (réponse, infos, confiance), modification, test des notifications, paramètres. **Présentation vocale** de 15 s facultative, enregistrée dans le bot (`/voix`) et retirable des deux côtés |
| Jauge de confiance | Les pastilles sous chaque prénom disent ce qui est **vérifié**, et un appui explique quoi. Elle ne compte que des critères **ouverts** : le selfie validé par la modération, et l'ancienneté de trois mois. Elle affichait « sur 3 » alors que le troisième, le garant, était figé à *non* pour tout compte réel — une jauge que personne ne pouvait remplir. Le garant ne la rejoindra pas : l'idée est abandonnée, parce que nommer un répondant laisserait croire à un recours qui n'existe pas. Ajouter un critère reste une ligne dans `server/jauge.js` le jour où un vrai mécanisme existe, et le dénominateur suivra : la carte, le score et l'écran d'explication lisent tous la même liste. L'explication s'ouvre une fois juste après le profil, puis reste dans l'onglet Profil |
| Anti-arnaque | Un mot d'argent ne bloque jamais seul : il faut un moyen de paiement nommé, ou une demande, c'est-à-dire un verbe de transfert ou un besoin accompagné d'un montant ou d'un objet d'argent. « ça me coûte 300 F pour venir » passe, « envoie juste 10k » ne passe pas. Le message de refus nomme ce qui l'a déclenché. **Les règles ne visent plus le seul Cameroun** : 34 familles de moyens de paiement (mobile money africain, transfert de diaspora, portefeuilles, coordonnées bancaires, cartes cadeaux, crypto), 56 devises, et les mêmes tournures en anglais qu'en français. Un **numéro de téléphone est vu quel que soit son indicatif** : forme internationale `+`, ou neuf chiffres d'affilée, les séparateurs recollés et le « O » lu comme un zéro. Les lettres détachées (« e n v o i e 10k ») sont recollées avant comparaison. Bloqué dans les messages, dans le profil et dans le créneau d'un rendez-vous ; liens, numéros et pseudos bloqués tant que l'**échange** n'atteint pas 10 messages de chaque côté, pour qu'un monologue ne débloque rien (`server/antiscam.js`) |
| Limitation de débit | Par compte et par action : 20 messages et 60 balayages par minute, 5 vérifications, 5 signalements, 12 photos, 6 présentations vocales, 10 rendez-vous et 20 modifications de profil par heure. Le check-in d'arrivée s'y ajoute, à 10 essais par heure. Réponse 429 avec `Retry-After`. **Les compteurs vivent dans le stockage**, pour que deux machines comptent ensemble : en base sur PostgreSQL (table `rate_limits`, une transaction par jeton), en mémoire sur le fichier JSON — qui ne supporte qu'une instance de toute façon, et où réécrire le fichier entier à chaque message coûterait cher pour rien. Si le stockage ne répond pas, la requête passe et c'est journalisé : un garde-fou anti-spam n'est pas une porte d'authentification (`server/limites.js`) |
| Rendez-vous sûr | **La liste des lieux partenaires part vide, et c'est voulu** : un lieu n'y entre qu'avec un accord signé avec l'établissement — annoncer « -10 % avec Mbolo » à quelqu'un qui va se rendre dans un café qui n'a rien promis serait un mensonge fait à un membre. Au lancement, l'app dit donc partout qu'il n'y a pas encore de lieu partenaire, invite à convenir d'un lieu public dans la discussion, et rappelle de prévenir une personne de confiance. Tout ce qui suit s'allume dès qu'un lieu est ajouté. Une proposition s'**accepte ou se refuse** : la personne invitée répond, celle qui propose peut retirer sa proposition, et une fois le rendez-vous accepté **chacun peut se décommander** — se retirer d'une rencontre ne doit jamais être bloqué. Le bot prévient à chaque changement. **L'arrivée ne se confirme que sur un rendez-vous accepté**, par le scanner QR natif de Telegram : jusqu'ici on pouvait confirmer son arrivée à un rendez-vous que l'autre n'avait jamais accepté. Un seul rendez-vous vivant à la fois par discussion. Un blocage ferme aussi le rendez-vous. Tu sais que l'autre est arrivée, jamais depuis quand |
| Se protéger | Trois gestes de gravité croissante, tous sans que la personne soit prévenue : **retirer le match** (la discussion disparaît des deux côtés, définitivement), **bloquer** sans rien signaler, ou **signaler** avec six motifs (argent, chantage, comportement déplacé, usurpation, personne mineure, violence). Jusqu'ici, se débarrasser de quelqu'un passait obligatoirement par une accusation |
| Fermer un compte | La modération ferme un compte depuis le groupe Telegram, avec le bouton « Fermer ce compte » posé sous chaque signalement et sous chaque message bloqué par l'anti-arnaque. Le compte fermé perd l'accès à l'API (403, avec la marche à suivre), disparaît de la découverte et des listes, et **tous ses matchs sont défaits**. Rouvrir se fait du même endroit : une erreur se répare sans laisser de trace. La marque garde qui a décidé, quand et pourquoi — c'est ce qui permet de reconnaître la personne si elle revient, comme les conditions l'annoncent |
| Espace de modération | `/moderation` dans le groupe Telegram : le bot envoie **en privé** un lien à usage unique, valable dix minutes, qui ouvre une session web de douze heures (cookie signé, `HttpOnly`, `SameSite=Lax`). Le droit d'entrer, c'est **être administrateur du groupe** — demandé à Telegram (`getChatAdministrators`, cache d'une minute) à la création du lien, à son échange, **et à chaque requête** : quelqu'un qu'on retire des administrateurs perd l'accès dans la minute, pas à l'expiration de sa session. Quatre vues **sans JavaScript ni image** : accueil chiffré, file d'attente de vérification, signalements, comptes fermés. **Jamais un selfie** — il reste au groupe Telegram. Ouvrir un signalement affiche **le fil de la discussion signalée, et elle seule** : ni les autres conversations de la personne, ni celles de qui a signalé. Sans le fil, un signalement se réduit à un motif choisi dans une liste, invérifiable. **Chaque lecture est enregistrée** sur le signalement (qui, quand) et le compte est affiché. Une discussion défaite par un blocage ou une fermeture de compte n'est plus lisible : ses messages sont partis, il n'en existe aucune copie. Sans `WEB_SESSION_SECRET`, cette porte seule répond 503 en disant quoi faire ; le reste de l'app tourne |
| Mesure produit | Six horodatages d'entonnoir dans l'objet utilisateur (`profileSavedAt`, `verificationSentAt`, `verifDecidedAt`, `firstLikeAt`, `firstMatchAt`, `firstMessageAt`) et **onze événements** dans la table `events` : `app_opened` (une par heure), `form_step`, `profile_saved`, `selfie_sent`, `verif_decided` (avec `ok`, `auto` et le délai), `verif_retried`, `deck_served` (une par cinq minutes) et `deck_empty` (`quota` ou `vide`), `quota_hit`, `antiscam_block` (**le code seul**, jamais le texte ni la règle), `account_deleted`. **Aucun texte** — un garde-fou refuse toute charge utile qui n'est pas faite de nombres et de mots-clés fermés. L'étape du formulaire est retenue sur l'appareil et jointe à l'ouverture suivante : **zéro requête ajoutée**. `DELETE /api/me` emporte tout, `EVENTS_RETENTION_DAYS` (180 jours, `0` n'écrit rien) purge le reste. Marqueur `devUser` sur les comptes de test. **`npm run chiffres`** sort l'entonnoir, l'activation, le churn, la métrique phare, les six métriques d'entrée et les six contre-métriques, avec les exclusions **en amont** (démonstration, développement, comptes fermés — et la **paire** exclue, pas seulement l'auteur) et les avertissements qui disent ce que les chiffres ne peuvent pas dire. `npm run --silent chiffres -- --json` pour en faire autre chose. Voir `audit/05-mesure-produit.md` |
| Personne de confiance | Quelqu'un qui sait quand tu vas à un rendez-vous. **Elle accepte elle-même**, dans Telegram, après avoir lu ce qu'elle recevra : l'app fabrique une invitation, rien n'est enregistré avant son accord — un bot ne peut de toute façon pas écrire à qui ne lui a jamais parlé, et garder l'identité d'un tiers qui n'a rien demandé serait une donnée sans consentement. Elle reçoit le lieu et l'heure du rendez-vous accepté, le moment de l'arrivée, et un « je pars maintenant » déclenché depuis la discussion — **ce dernier ne dépend d'aucun lieu partenaire, donc il marche dès le premier jour**. Elle n'apprend **jamais avec qui** : l'autre personne n'a pas consenti à ce que son prénom sorte. Retrait des deux côtés : depuis le profil, ou par `/retirer` dans le bot. L'identifiant Telegram de la personne de confiance ne sort jamais du serveur |
| Données personnelles | Suppression complète du compte depuis les paramètres |

Éléments natifs Telegram utilisés : bouton principal et secondaire, bouton Retour, bouton Paramètres, popups, retour haptique, scanner de QR code, confirmation de fermeture, stockage Telegram, autorisation d'écriture, couleurs du thème de l'utilisateur.

Identité « Aura » : l'app possède ses surfaces — trois niveaux d'encre à peine violette en sombre (#0B0B14, #14141F, #1D1D2B), os et blanc en clair — et ne garde de Telegram que le choix clair ou sombre, qu'elle renvoie au cadre Telegram (en-tête, fond, barre du bas) pour que tout soit d'une pièce. Le bouton d'action est le seul objet clair de l'écran en sombre, le seul objet d'encre en clair. Deux couleurs seulement au repos : le rose du « J'aime » (#FF3D81) et l'ambre de la confiance (#F2C66B en sombre, #D9A63D en clair). Une troisième, l'**aura** — un gradient rose-ambre-violet —, n'a le droit d'apparaître qu'à trois endroits : le match (écran d'encre dans les deux thèmes, l'aura respire derrière la paire), l'anneau autour de l'avatar d'une personne vérifiée, et le stamp « J'aime » pendant le geste ; plus un voile très léger sur l'accueil. Nulle part ailleurs. Deux polices : Fraunces pour l'identité (prénoms, titres, réponses), en une seule instance pour rester à 34 Ko, et Manrope pour tout le reste — environ 60 Ko la première fois, puis en cache, chargées sans bloquer l'affichage. Le verre (flou d'arrière-plan) est limité à deux pastilles sur la photo et aux deux barres. Un navigateur qui ne sait pas flouter, ou une personne qui a demandé moins de transparence dans son système, reçoivent des fonds franchement opaques à la place : moins joli, toujours lisible.

---

## Ce qu'il te faut

- **Node.js 20 ou plus récent** : https://nodejs.org
- **Un compte Telegram** sur ton téléphone
- **Un tunnel HTTPS** pour tester depuis ton ordinateur (Telegram exige une adresse en `https://`). Le plus simple : `cloudflared` (gratuit, sans compte) ou `ngrok`.

---

## Étape 1 : créer ton bot avec @BotFather

1. Dans Telegram, ouvre **@BotFather**.
2. Envoie `/newbot`.
3. Donne un nom affiché (ex. `Mbolo Test`), puis un nom d'utilisateur finissant par `bot` (ex. `mbolo_test_bot`).
4. BotFather te donne un **jeton** du type `123456789:AAH...`. Garde-le secret : quiconque l'a contrôle ton bot.

## Étape 2 : installer le projet

```bash
cd mbolo-miniapp
npm install
cp .env.example .env
```

Ouvre `.env` et colle ton jeton dans `BOT_TOKEN`. Laisse `WEBAPP_URL` vide pour l'instant.

## Étape 3 : obtenir une adresse HTTPS

Dans un **deuxième terminal** :

```bash
# Avec cloudflared (installation : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
cloudflared tunnel --url http://localhost:3000

# ou avec ngrok
ngrok http 3000
```

Copie l'adresse affichée (ex. `https://abc-def.trycloudflare.com`) dans `WEBAPP_URL` du fichier `.env`.

> Avec cloudflared en mode rapide, l'adresse change à chaque lancement : pense à mettre `.env` à jour et à redémarrer le serveur.

## Étape 4 : lancer et tester sur ton téléphone

```bash
npm start
```

Tu dois voir :

```
Profils de démonstration chargés : 20
Mbolo écoute sur le port 3000
Bot @mbolo_test_bot démarré (interrogation longue)
```

Sur ton téléphone :

1. Cherche ton bot dans Telegram et envoie `/start`.
2. Appuie sur **Ouvrir Mbolo** sous le message (ou sur le bouton **Ouvrir** à côté du champ de saisie).
3. Crée ton profil : choisis **Yaoundé** comme ville pour voir les profils de démonstration.
4. Prends le selfie avec le geste demandé. Avec `AUTO_APPROVE=true`, il est validé au bout de 3 secondes et le bot t'écrit.
5. Aime un profil : les profils de démonstration aiment en retour, donc tu obtiens un match.
6. Écris un message, essaie « envoie-moi 2000 F par MoMo » pour voir le blocage, puis propose un rendez-vous.
7. **Teste les notifications** :
   - Onglet **Profil** → **Tester les notifications** : le bot t'écrit tout de suite.
   - Envoie un message à un profil de démo, puis **ferme immédiatement Mbolo** : environ 15 secondes plus tard, le bot te prévient de sa réponse, avec un bouton qui rouvre la bonne discussion.
   - Une minute après la validation de ton selfie, un profil de démo te « like » : le bot t'annonce que tu as plu à quelqu'un, et ce profil apparaît en premier dans Découvrir.

### Profils de démonstration : qui sert à quoi

Vingt profils fictifs, marqués « démo » sur leur carte, sans aucun visage : leurs images sont des dégradés
avec une initiale (`server/demo-photos/`). Ils couvrent chaque combinaison genre × intention à Yaoundé, pour
que le paquet ne soit jamais vide quel que soit ton profil, plus trois à Douala. Ils sont recréés à chaque
démarrage. Deux d'entre eux t'aiment automatiquement dès que ton profil est vérifié, pour remplir
« Ont aimé ton profil » sans attendre.

| Ton choix | Profils proposés | Ce que tu peux tester avec eux |
|---|---|---|
| Relation sérieuse, tu es un homme | Carine 24 (3 photos), Laure 21, Sandrine 29 (2 photos), Estelle 19 (sans photo) | changement de photo au toucher sur Carine, filtre d'âge (de 19 à 29), **Sandrine ne rend jamais les « J'aime »** : ton like reste en attente dans la liste |
| Relation sérieuse, tu es une femme | Junior 28 (2 photos), Landry 23, Armand 30 (sans photo), Thierry 26, Kevin 22 | même chose, **Armand ne rend jamais les « J'aime »** |
| Amitié | Brice 27, Nadège 22 (2 photos), Aïcha 26 (3 photos), Yannick 25 (sans photo), Serge 20 | tout le monde est proposé, quel que soit ton genre ; **Yannick ne rend jamais les « J'aime »** |
| *(ces trois profils illustraient la sortie en duo, retirée en P1-7 : ils sont passés en Amitié)* | Mireille 25, Stéphane 26, Patricia 23 (2 photos) | |
| Ville Douala | Ulrich 27, Chantal 24 (2 photos), Franck 22 | changer de ville dans ton profil |
| Ville Bafoussam, Buea ou Garoua | personne | l'écran « Personne d'autre à … pour l'instant » |

Scénarios à dérouler :

1. **Découverte et filtres** : balaie quelques cartes, passe en vue Liste, resserre la tranche d'âge à 19-22 dans les filtres, puis élargis-la depuis l'écran vide qui te le propose.
2. **Like en attente** : aime Sandrine, Armand ou Yannick selon ton profil. Aucun match : dans la liste, le profil reste « aimé ». Aime n'importe quel autre profil de démo : match immédiat.
3. **Likes reçus** : ouvre Messages, la bande « Ont aimé ton profil » montre deux personnes. Réponds à l'une d'elles.
4. **Discussion** : un profil de démo répond cinq fois, environ 15 secondes après chaque message. La cinquième réponse te propose un rendez-vous : propose-en un dans un lieu partenaire — les quatre lieux d'exemple n'existent qu'avec `SEED_DEMO`, aucun n'est servi en production.
5. **Anti-arnaque** : écris « ça me coûte 300 F pour venir », ça passe ; écris « envoie juste 10k », c'est refusé en nommant la catégorie.
6. **Limitation de débit** : envoie vingt messages d'affilée, le vingt-et-unième est refusé avec un délai.
7. **Se protéger** : depuis la discussion, touche le drapeau : retire le match, ou bloque, ou signale avec l'un des six motifs. La personne disparaît de Messages.
8. **Rendez-vous** : propose un créneau, puis confirme ton arrivée avec le QR code du lieu (étape 5 ci-dessous).
9. **Notifications** : ferme l'app après avoir écrit, le bot te prévient de la réponse et rouvre la bonne discussion.

Tout cela fonctionne sur l'app en ligne tant que `SEED_DEMO=true` y est actif. Désactive-le avant d'ouvrir à de vrais utilisateurs.

## Étape 5 : tester le QR code d'arrivée

1. Mets une valeur à `ADMIN_KEY` **et à `VENUE_SECRET`** dans `.env`, puis redémarre.
2. Sur ton ordinateur, ouvre `https://TON-ADRESSE/qr/palmier.png?key=TA_CLE`.
3. Dans la discussion Mbolo sur ton téléphone, appuie sur **Je suis arrivé(e) : scanner le code** et vise l'écran.

Lieux disponibles : `palmier`, `etudiants`, `lac` (Yaoundé) et `wouri` (Douala). Ils se modifient dans `server/config.js`.

Sans `VENUE_SECRET`, le secret est tiré au hasard à chaque démarrage : le QR affiché reste valable
tant que le serveur tourne, et cesse de l'être au redémarrage suivant. C'est voulu — un défaut qui
échoue du bon côté. **Le code ne se déduit pas de l'identifiant du lieu et n'est jamais envoyé au
navigateur** : il n'existe que sur le serveur et sur la feuille imprimée.

## Étape 6 : activer la vraie modération des selfies

1. Crée un groupe Telegram privé « Modération Mbolo » et ajoute ton bot.
2. Envoie `/id` dans le groupe : le bot répond l'identifiant (ex. `-1001234567890`).
3. Dans `.env` : `ADMIN_CHAT_ID=-1001234567890` et `AUTO_APPROVE=false`. En production, ces deux réglages sont imposés : `AUTO_APPROVE` y est sans effet, et `ADMIN_CHAT_ID` y est obligatoire.
4. Redémarre. Chaque nouveau selfie arrive dans le groupe avec le geste demandé et deux boutons : **Valider** ou **Refuser**. Le selfie est supprimé du serveur dès la décision. Chaque **photo de profil** arrive de la même façon : validée, elle devient visible ; refusée, elle est supprimée et la personne est prévenue par le bot.

## Étape 7 (facultative) : faire de Mbolo l'app principale du bot

Dans @BotFather : `/mybots` → ton bot → **Bot Settings** → **Configure Mini App** → active-la avec ton `WEBAPP_URL`. Tu obtiens :

- un bouton « Ouvrir l'app » sur le profil du bot ;
- des liens directs `https://t.me/TON_BOT?startapp=ref_123` à partager ;
- la personnalisation de l'écran de chargement (icône, couleurs).

Pense aussi à renseigner ta **politique de confidentialité** dans BotFather (obligatoire dès que tu collectes des données).

---

## Tout lancer depuis le téléphone (Termux)

Le dépôt contient trois scripts prévus pour Termux, qui remplacent les étapes 2 à 4 quand tu n'as pas d'ordinateur sous la main.

```bash
pkg install nodejs-lts git openssh cloudflared
git clone https://github.com/BacBacta/Mbolo-miniapp.git
cd Mbolo-miniapp
npm install
cp .env.example .env
nano .env          # colle ton BOT_TOKEN
./demarrer.sh
```

`./demarrer.sh` monte un tunnel, écrit son adresse dans `WEBAPP_URL`, puis lance le serveur au premier plan. Sans tunnel joignable, il démarre quand même le serveur : le bot répondra, seule la mini app restera inaccessible. Quelques secondes après, il confirme que la mini app est bien servie :

```
Tunnel actif, mini app déjà joignable : https://xxxx.trycloudflare.com
Mbolo écoute sur le port 3000
Bot @ton_bot démarré (interrogation longue)
--- Mini app joignable sur https://xxxx.trycloudflare.com ---
```

| Commande | À quoi ça sert |
|---|---|
| `./demarrer.sh` | essaie les tunnels à tour de rôle jusqu'à en trouver un joignable |
| `./demarrer.sh ssh` | force localhost.run, si ton réseau bloque `trycloudflare.com` |
| `./demarrer-pinggy.sh` | force pinggy, le plus susceptible de passer sur un réseau qui filtre |
| `./tunnel.sh` | monte seulement le tunnel et met `WEBAPP_URL` à jour |
| `./diagnostic.sh` | dit ce qui cloche : jeton, webhook, serveur, adresse publique, doublons de processus |

### Quel tunnel choisir

Trois services gratuits sont câblés, essayés dans cet ordre par `./demarrer.sh`. Celui qui a fonctionné est retenu et réessayé en premier au lancement suivant.

| Service | Adresse | À savoir |
|---|---|---|
| cloudflared | `*.trycloudflare.com` | le plus rapide, mais certains opérateurs ne résolvent pas ce domaine |
| localhost.run | `*.lhr.life` | SSH sur le port 22, rien à installer de plus |
| pinggy | `*.pinggy-free.link` | SSH sur le **port 443** : son trafic ressemble à du HTTPS, donc il passe là où les autres sont bloqués. Le tunnel gratuit **expire au bout de 60 minutes** |

Si aucun ne répond alors que le reste d'Internet fonctionne, c'est en général le DNS de ton opérateur. Sur Android : *Paramètres* → *Connexions* → *Plus de paramètres de connexion* → **DNS privé** → `dns.google`.

> **Le bot n'a pas besoin du tunnel pour répondre.** L'interrogation longue sort vers Telegram : `npm start` seul suffit à ce que `/start` réponde. Le tunnel ne sert qu'à afficher la mini app. C'est pourquoi `./demarrer.sh` démarre le serveur même quand aucun tunnel ne fonctionne.

L'adresse d'un tunnel change à chaque lancement, et les scripts l'écrivent dans `.env` à ta place. Ferme avec Ctrl-C : le tunnel est coupé en même temps que le serveur.

### Voir l'interface sans tunnel

Le serveur tourne sur le téléphone : son navigateur peut donc l'ouvrir directement, sans aucun tunnel. Pratique quand le réseau les bloque tous, ou pour travailler l'interface.

Ajoute ces lignes à `.env`, puis relance :

```
ALLOW_DEV_AUTH=true
SEED_DEMO=true
AUTO_APPROVE=true
```

Ouvre ensuite `http://localhost:3000/?dev_user=1001` dans Chrome. Tout le parcours fonctionne ; seuls les éléments natifs de Telegram (vibrations, bouton Retour, scanner QR) sont remplacés par leurs équivalents web.

> Retire `ALLOW_DEV_AUTH=true` ensuite. Avec un tunnel actif, n'importe qui ayant l'adresse pourrait se faire passer pour n'importe quel compte.

---

## Tester dans Telegram sans tunnel : héberger le serveur

Quand aucun tunnel ne passe sur ton réseau, fais tourner le serveur chez un hébergeur : Telegram y accède comme n'importe quel utilisateur, et l'adresse ne change plus.

Vérifie d'abord que ton réseau atteint le domaine visé. Une adresse inexistante doit répondre autre chose que `000` :

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mbolo-inexistant.fly.dev/
```

Si tu obtiens `000`, c'est le résolveur DNS du téléphone qui bloque, et changer d'hébergeur n'y fera rien : règle le **DNS privé** d'Android sur `dns.google` (Paramètres → Connexions → Plus de paramètres de connexion).

### Fly.io

`Dockerfile` et `fly.toml` sont à la racine. La machine s'arrête quand personne ne s'en sert et redémarre à la requête suivante, en une seconde ou deux. Un volume garde la base et les photos d'un déploiement à l'autre. Une carte bancaire est demandée à l'inscription, même sans dépense.

**Depuis un navigateur, sans ligne de commande** — utile depuis un téléphone, où `flyctl` ne s'installe pas :

1. Crée un compte sur https://fly.io, puis un jeton dans **Account** → **Tokens**.
2. Sur GitHub : **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Ajoute `FLY_API_TOKEN`, `BOT_TOKEN` et `ADMIN_CHAT_ID` — ce dernier est l'identifiant du groupe Telegram qui recevra les selfies à valider : crée le groupe, ajoute-y ton bot, envoie `/id` dedans. Sans lui, le déploiement s'arrête avant de construire quoi que ce soit. Facultatif : `ADMIN_KEY` (généré sinon).
3. Onglet **Actions** → **Déployer sur Fly** → **Run workflow**. Pour une **première installation**, saisis un nom d'app libre (ils sont uniques dans le monde entier) et une région : `ams` Amsterdam, `cdg` Paris, `jnb` Johannesburg, `mad` Madrid — puis reporte ces deux valeurs dans les `default` du workflow, pour n'avoir plus jamais à les retaper.
4. Au bout de trois à cinq minutes, l'app répond sur `https://<ton-app>.fly.dev`.
5. Dans Telegram : `/start` → **Ouvrir Mbolo**.

Le workflow crée l'app, le volume et les adresses IP publiques s'ils manquent, pose les secrets, puis déploie. Relance-le à chaque fois que tu veux publier une nouvelle version : **pour une mise à jour, laisse les deux champs tels quels** et appuie sur le bouton vert. Un nom d'app qui n'existe pas arrête le script avant toute modification — rien n'est déployé nulle part, mais rien n'est publié non plus.

**En ligne de commande**, avec `deployer-fly.sh`. Le script crée l'app, le volume et les adresses IP publiques s'ils manquent, pose les secrets, déploie, puis vérifie que `/health` répond. Relançable sans risque : il ne recrée pas ce qui existe, et s'arrête avant toute modification si le jeton est invalide.

```bash
curl -fsSL https://fly.io/install.sh | sh          # une seule fois
export FLY_API_TOKEN=...                          # https://fly.io, Account, Tokens
export BOT_TOKEN=...                              # jeton BotFather
./deployer-fly.sh mon-app cdg
```

Sous Windows, la même chose dans PowerShell :

```powershell
iwr https://fly.io/install.ps1 -useb | iex
$env:FLY_API_TOKEN = "..."
$env:BOT_TOKEN = "..."
bash ./deployer-fly.sh mon-app cdg
```

C'est ce même script qu'exécute le workflow GitHub : une seule logique, donc pas de dérive entre les deux chemins.

Pas besoin de `WEBAPP_URL` : le serveur déduit l'adresse de `FLY_APP_NAME`, que Fly fournit.

> **Adresse publique toute neuve.** Sans IP publique, `<ton-app>.fly.dev` ne se résout nulle part : l'app démarre et `/health` répond en interne, mais ni Telegram ni personne ne peut la joindre. Le script s'en charge. Juste après la première allocation, Telegram met parfois une quinzaine de minutes à résoudre le nom, et le journal affiche `setWebhook failed: Failed to resolve host`. Rien à faire : le serveur réessaie tout seul, à intervalles croissants sur une dizaine de minutes, et le journal affiche `Bot en mode webhook (tentative 3)` dès que Telegram accepte. Si la reprise s'épuise, le webhook est reposé au démarrage suivant — et toute visite de la mini app réveille la machine, donc relance le démarrage. Vérifie l'état avec `flyctl ips list -a <ton-app>` et `flyctl logs -a <ton-app>`.

> Crée de préférence un **jeton limité à l'application** (Fly propose des jetons de déploiement à portée réduite) plutôt qu'un jeton de compte : en cas de fuite, il ne donne accès qu'à cette app, et se révoque sans toucher au reste.

### Render

Alternative sans carte bancaire, moins confortable : le service dort après 15 minutes et met 30 à 60 secondes à se réveiller, et l'offre gratuite n'a pas de disque persistant, donc les données de test disparaissent à chaque redéploiement.

Sur https://dashboard.render.com : **New** → **Web Service** → dépôt `BacBacta/Mbolo-miniapp`, **Build command** `npm ci`, **Start command** `npm start`, **Instance type** Free. Variables : `BOT_TOKEN`, `ADMIN_CHAT_ID`, `ADMIN_KEY`, `USE_WEBHOOK=true`, `NODE_ENV=production`. Laisse `WEBAPP_URL` vide : le serveur prend `RENDER_EXTERNAL_URL`. Le fichier `render.yaml` décrit le même service pour un déploiement en **Blueprint**.

### À savoir, quel que soit l'hébergeur

- **Un webhook refusé n'est pas définitif.** Si Telegram refuse l'adresse au démarrage (nom pas encore résolu, réseau coupé), le serveur réessaie en arrière-plan à intervalles croissants — 5 s, 15 s, 30 s, 1 min, 2 min, 5 min — sans retarder le démarrage. La route du webhook est montée dès le départ, donc les messages arrivent dès que Telegram accepte l'adresse.
- **Ne lance pas en même temps le serveur sur ton téléphone** avec `USE_WEBHOOK=false` : il retirerait le webhook, et le serveur hébergé ne recevrait plus rien de Telegram.
- **Si le groupe de modération devient injoignable, tu le sais.** Au démarrage, le serveur interroge `ADMIN_CHAT_ID` et écrit dans le journal vers quel groupe partent les selfies — ou, en cas d'échec, que plus personne ne peut être vérifié et quoi vérifier (bot membre du groupe, identifiant rendu par `/id`). Il ne s'arrête pas pour autant : une panne passagère de Telegram ne doit pas coucher l'app. Et si un selfie ou une photo ne part pas, l'envoi est défait et la personne est invitée à réessayer, plutôt que de la laisser attendre sept jours une décision que personne ne peut prendre.
- **La modération des selfies n'est pas facultative en ligne.** `AUTO_APPROVE` valide sans qu'un humain regarde : il est ignoré dès que `NODE_ENV=production`, sinon l'app marquerait « vérifié » des gens que personne n'a vus. Et comme un selfie doit bien aller quelque part, le serveur **refuse de démarrer en production sans `ADMIN_CHAT_ID`** plutôt que de laisser tout le monde en attente sans le dire. `SEED_DEMO` reste à `false` sauf sur une machine de démonstration : de vraies personnes écriraient à des profils fictifs.
- **Tout part compressé.** Les fichiers du navigateur sont compressés une fois au démarrage avec `zlib` (aucune dépendance ajoutée), les réponses de l'API à la volée au-delà de 1 Ko. Mesuré : le premier chargement passe de 125 494 à 36 068 octets, `styles.css` de 39 651 à 8 878, une réponse de découverte de 2 392 à 535.
- **Le premier écran ne dépend plus d'un serveur tiers.** Le SDK Telegram est chargé avec `defer` : sans cela, l'analyse de la page s'arrêtait sur ce script et l'écran « Chargement… » lui-même n'existait pas tant que `telegram.org` n'avait pas répondu. Mesuré : rien dans la page après une seconde et demie avant, l'écran de chargement peint après.
- **Aucun appel ne peut durer indéfiniment.** Douze secondes au plus par appel d'API, deux secondes et demie pour une lecture du stockage Telegram, et l'écran d'échec du démarrage propose « Réessayer » au lieu d'être figé.
- **La discussion ne réexpédie plus le profil.** L'interrogation périodique ne renvoie que les nouveaux messages : 449 octets par appel avant, 39 après, soit environ 342 Ko au lieu de 702 Ko pour une heure de discussion ouverte.

- **Après un déploiement, pas besoin de vider le cache de Telegram.** Le serveur calcule une empreinte du contenu de `app.js`, `tg.js`, `ui.js` et `styles.css`, et la pose sur leurs adresses (`/app.js?v=...`). Une nouvelle version change l'adresse, donc le navigateur la télécharge ; tant que rien ne change, l'adresse reste la même et le cache est conservé, y compris quand la machine s'arrête et repart. Seul `index.html` n'est jamais mis en cache, puisque c'est lui qui porte les nouvelles adresses.
- Les réponses des profils de démonstration et la présence vivent en mémoire : une machine qui s'arrête les perd. Sans conséquence pour un test.

## Pages publiques

`/confidentialite` et `/conditions` sont servies sans compte, hors de Telegram et sans JavaScript : ce sont elles qu'on renseigne dans BotFather et qu'on met en pied de page d'un site. L'application y renvoie depuis l'onglet Profil.

Elles vivent dans `server/legal/`, pas dans `public/`, parce qu'elles portent le nom de l'app (`__APP_NAME__`) : servies en fichiers statiques, elles montreraient le gabarit. Le serveur y injecte le nom et l'empreinte des fichiers, puis les compresse une fois au démarrage, comme la page d'accueil — environ 3 Ko sur le réseau.

Pour les modifier, édite les deux fichiers HTML et change la date en haut de page. `test/pages-publiques.test.js` vérifie qu'elles répondent, qu'elles ne laissent pas fuiter le gabarit, qu'elles se renvoient l'une à l'autre, et que **le délai de suppression du selfie qu'elles annoncent est bien celui que le serveur applique** : une page qui promet autre chose que le code fait échouer la suite.

---

## Changer le nom de l'application

1. Dans `.env`, modifie la ligne `APP_NAME=Mbolo` (ex. `APP_NAME=Imani`).
2. Redémarre le serveur : le nom change dans l'app, les messages du bot et les notifications.
3. Dans @BotFather : `/mybots` → ton bot → **Edit Bot** → **Edit Name** pour le nom affiché en haut de la mini app, puis **Edit About** et **Edit Description** pour les textes de présentation.
4. L'identifiant du bot (`@...`) ne se modifie généralement pas : si tu veux un identifiant assorti au nouveau nom, crée un nouveau bot avec `/newbot` et mets son jeton dans `BOT_TOKEN`.

Avant un lancement public, vérifie que le nom est libre : marque auprès de l'OAPI (Afrique francophone) et de l'ARIPO (Afrique anglophone), nom de domaine, identifiant Telegram et réseaux sociaux.

## Ajouter une langue

L'app parle français et anglais. La langue affichée vient, dans cet ordre : du choix fait dans **Profil → Langue de l'app**, sinon de la langue du Telegram de la personne, sinon du français.

La clé de traduction **est la phrase française**. Une phrase sans traduction s'affiche donc en français, jamais sous forme d'identifiant : une traduction incomplète reste lisible.

Pour ajouter une langue (exemple : le pidgin, code `pcm`) :

1. Copie `public/i18n/en.js` vers `public/i18n/pcm.js` et traduis les valeurs. Ne touche pas aux clés, et garde les `{variables}` telles quelles.
2. Ajoute la langue dans `public/i18n.js` : `pcm: 'Pidgin'` dans `LANGUES`.
3. Ajoute `'pcm'` à la liste `LANGUES` de `server/i18n.js` et traduis-y le dictionnaire des messages du bot (une vingtaine de phrases).
4. Lance `npm test` : un test vérifie que chaque langue déclarée a bien un dictionnaire, et qu'aucune phrase de l'interface ne manque à l'appel.

Le dictionnaire n'est téléchargé que par les personnes qui lisent dans cette langue : ajouter une langue ne coûte rien aux autres.

Côté serveur, `notify()` prend une clé et des variables, jamais une phrase toute faite : le bot écrit à chacun dans **sa** langue, pas dans celle de la personne qui a déclenché la notification.

## Développer sans téléphone

Pour travailler l'interface dans un navigateur classique :

```bash
ALLOW_DEV_AUTH=true npm start
```

Puis ouvre `http://localhost:3000/?dev_user=1001`. Les boutons natifs sont remplacés par une barre en bas de page, le scanner QR par une fenêtre où tu colles le code (ex. `rdv:lieu:palmier`). Change `dev_user` pour simuler une autre personne. Hors Telegram, le thème sombre suit le réglage du système : dans les outils du navigateur, force `prefers-color-scheme: dark` pour le vérifier.

> Ne jamais activer `ALLOW_DEV_AUTH` en production : n'importe qui pourrait se faire passer pour n'importe qui. Le serveur l'ignore automatiquement si `NODE_ENV=production`.

### Si tu ne reçois pas de notification

| Cause | Solution |
|---|---|
| Le serveur ne tourne pas | Sans lui le bot ne répond à rien. Lance `./diagnostic.sh` : l'étape 6 le dit |
| Tu n'as jamais envoyé `/start` au bot | Envoie `/start`, le bot ne peut écrire qu'aux personnes qui l'ont démarré |
| Conversation avec le bot en sourdine | Dans Telegram, ouvre la conversation avec le bot → son nom → active les notifications |
| Tu es encore dans la discussion | Normal : pas de notification pour un message que tu lis déjà. Ferme l'app |
| Plusieurs messages en moins de 2 minutes | Une seule notification par discussion toutes les 2 minutes, pour ne pas t'inonder |
| « Like » déjà annoncé aujourd'hui | Au plus une alerte « tu as plu » par jour |

## Tests automatiques

```bash
npm test
```

Vérifie la validation de la signature Telegram (données modifiées, expirées, mauvais jeton), le filtre anti-arnaque et les notifications (avec un faux Telegram : match, message, présence, non lus, likes, réponses de démo).

La même suite tourne aussi sur PostgreSQL, avec une base à part et un schéma par fichier de test :

```powershell
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/mbolo_test"
npm run test:pg
```

Les deux modes de stockage sont lancés à chaque pull request par GitHub Actions.

### Parcours dans un vrai navigateur

```powershell
npm run e2e
```

Playwright lance le serveur en mode développement, ouvre Chromium à la taille d'un téléphone et refait le parcours : accueil, profil, selfie, vérification, découverte, match, discussion, pages publiques. Treize tests, environ deux minutes et demie.

Ils disent ce que `npm test` ne peut pas dire — qu'un écran s'affiche, qu'un bouton existe, qu'un message refusé explique quoi corriger, et que **le champ de saisie survit à l'arrivée d'un message pendant la frappe** (règle 16 : sinon le clavier se fermerait au milieu d'un mot).

`npm run e2e:ui` ouvre l'inspecteur pour rejouer un test pas à pas. En cas d'échec en CI, la trace et la capture d'écran sont conservées sept jours dans les artefacts de l'exécution.

La première fois, il faut le navigateur : `npx playwright install chromium`.

---

## Stockage : fichier JSON ou PostgreSQL

L'application écrit dans l'un des deux, selon `DATABASE_URL` :

| `DATABASE_URL` | Stockage | Pour quoi |
|---|---|---|
| vide | `DATA_DIR/db.json`, écriture atomique | développer, et une bêta sur une seule machine |
| renseignée | PostgreSQL, migrations au démarrage | production : plusieurs instances, sauvegardes, transactions |

Le reste du serveur ne sait pas lequel des deux il utilise : `server/store.js` choisit, `server/store.json.js` et `server/store.pg.js` offrent la même interface. Le message de démarrage dit lequel est actif.

Les migrations vivent dans `server/db/migrations/`, en SQL, appliquées une seule fois chacune et dans l'ordre de leur nom, chacune dans sa transaction, notées dans la table `schema_migrations`. Deux instances qui démarrent ensemble ne s'entre-appliquent pas : un verrou consultatif PostgreSQL entoure le tout. Pour ajouter une migration, dépose un fichier `002-....sql` à côté du premier ; ne modifie jamais un fichier déjà appliqué.

`DATABASE_SCHEMA` permet de loger plusieurs installations dans une même base (un schéma par environnement). Vide, c'est `public`.

### Reprendre un `db.json` existant

```powershell
$env:DATABASE_URL="postgres://..."
node "scripts/import-json.js" "data/db.json"
```

Le script applique d'abord les migrations, puis recopie comptes, balayages, matchs, messages, blocages, signalements, rendez-vous **et les événements de mesure** — ceux-là ne se reconstituent pas, les oublier à la bascule effacerait l'entonnoir pour toujours. Il refuse de partir si la base porte déjà des comptes — relance avec `--force` pour compléter un import interrompu : chaque ligne est écrite sans écraser ce qui existe, donc une reprise ne crée pas de doublon.

Les photos et les selfies ne passent pas par la base : ce sont des fichiers de `DATA_DIR/uploads`, à copier tels quels vers le volume de la nouvelle machine.

Puis le contrôle, qui dit si la bascule peut avoir lieu :

```powershell
node "scripts/etat-stockage.js" "data/db.json"
```

Il compare les deux stockages table par table et **sort en erreur** dès que la base porte moins que le fichier. C'est le seul garde-fou contre un import qui a écrit « 0 importé(s) sur 41 » au milieu d'une page de texte, et que personne ne relit ce jour-là. Il compte ce que chaque table sait distinguer, pas les lignes du fichier : deux balayages de la même paire n'écrivent qu'une ligne, et il ne faut pas y voir une perte.

### Basculer la production sans fenêtre à vide

`flyctl postgres attach` pose `DATABASE_URL` et redémarre l'application aussitôt : entre ce redémarrage et la fin de l'import, la production tourne sur une base **vide**. Personne ne retrouve son compte, et quelqu'un qui en recrée un pendant ce temps écrit dans la base que l'import s'apprête à remplir.

`basculer-postgres.sh` évite cette fenêtre en attachant la base sous un nom que le serveur ignore (`DATABASE_URL_FUTURE`), en important, en vérifiant, **et en ne renommant qu'après** :

```powershell
$env:FLY_API_TOKEN = "..."
./basculer-postgres.sh preparer mbolo-miniapp mbolo-db   # la production ne bouge pas
./basculer-postgres.sh basculer mbolo-miniapp mbolo-db   # un redémarrage, et c'est fait
./basculer-postgres.sh verifier mbolo-miniapp mbolo-db   # ne fait que lire
```

Le même script se lance depuis l'onglet **Actions** de GitHub (travail **PostgreSQL**), sans ligne de commande. Le jeton doit être un **jeton d'organisation** : un jeton de déploiement limité à une app ne peut pas créer de base. Détail complet dans [`DEPLOIEMENT.md`](DEPLOIEMENT.md).

---

## Mettre en ligne (bêta fermée)

> **Guide pas à pas : [`DEPLOIEMENT.md`](DEPLOIEMENT.md).** Du compte vide à l'application que des gens utilisent, avec les contrôles à faire après chaque déploiement, le passage à PostgreSQL, et un tableau des pannes courantes. Cette section-ci n'en est que le résumé.

N'importe quel hébergeur Node.js avec **stockage persistant** convient (VPS, Railway, Fly.io, Render avec disque, etc.).

Variables à définir chez l'hébergeur :

```
NODE_ENV=production
BOT_TOKEN=...
WEBAPP_URL=https://ton-domaine
ADMIN_CHAT_ID=...
ADMIN_KEY=une-longue-cle-aleatoire
WEB_SESSION_SECRET=une-autre-longue-cle-aleatoire
VENUE_SECRET=une-troisieme-longue-cle-aleatoire
EVENTS_RETENTION_DAYS=180
USE_WEBHOOK=true
AUTO_APPROVE=false
SEED_DEMO=false
ALLOW_DEV_AUTH=false
```

Avec `USE_WEBHOOK=true`, Telegram envoie les messages du bot directement à ton serveur au lieu que le bot aille les chercher.

**Important sur le stockage** : sans `DATABASE_URL`, les données sont dans `data/db.json` et les photos dans `data/uploads/` (ou dans le dossier indiqué par `DATA_DIR`). Si ton hébergeur efface le disque à chaque redéploiement, tu perds tout. Monte un volume persistant sur `data/`. Avec `DATABASE_URL`, les données vont dans PostgreSQL et seules les photos restent sur le disque : c'est le mode à retenir en production, et il est obligatoire avant tout paiement. Voir la section « Stockage : fichier JSON ou PostgreSQL ».

---

## Avant d'ouvrir à de vraies personnes

Ce prototype sert à une **bêta fermée**. La liste ci-dessous sépare ce que le code tient déjà de ce qui attend une décision ou une démarche humaine — la seconde est la seule qui demande du travail.

### Ce que le code tient déjà, sans compter sur la vigilance

| | Où |
|---|---|
| `AUTO_APPROVE` n'a **aucun effet** en production : aucun selfie n'est validé sans qu'un humain le voie | `server/config.js`, `test/production.test.js` |
| Le serveur **refuse de démarrer** en production sans `ADMIN_CHAT_ID` : pas de vérification muette | `server/index.js` |
| Le groupe de modération est **interrogé au démarrage** : un bot absent du groupe se voit au déploiement | `server/bot.js` |
| Un selfie ou une photo qui ne part pas est **défait**, et la personne invitée à réessayer | `server/routes.js`, `test/moderation.test.js` |
| `SEED_DEMO=false` dans `fly.toml` et `render.yaml` : pas de profils fictifs devant de vraies personnes | `test/production.test.js` |
| Limitation du nombre de requêtes par compte et par action | `server/limites.js`, `test/limites.test.js`, `test/limites-instances.test.js` |
| Les pages `/confidentialite` et `/conditions` existent, sont lisibles sans compte, et **disent ce que le code fait vraiment** | `server/legal/`, `test/pages-publiques.test.js` |
| Le flou d'arrière-plan **se coupe tout seul** sur un appareil qui le rend mal — mémoire annoncée, puis durée réelle entre deux images | `public/ui.js`, `test/verre.test.js`, `e2e/verre.spec.js` |

### Ce qui t'attend

Aucune de ces trois choses ne peut être faite depuis le code.

- [ ] **Renseigner les deux pages dans BotFather.** `/mybots` → ton bot → *Bot Settings*, entrée de politique de confidentialité. Les adresses : `https://<ton-app>.fly.dev/confidentialite` et `/conditions`. Il se peut qu'il n'y ait pas de champ dédié aux **conditions d'utilisation** : dans ce cas, mets le lien dans la description du bot — l'app y renvoie déjà depuis l'onglet Profil, donc l'accès reste assuré.
- [ ] **Faire relire les deux textes par un juriste camerounais.** Ils décrivent fidèlement le traitement, relevé dans le code et non de mémoire, mais ce n'est pas un avis juridique.
- [ ] **Déclarer le traitement à l'Autorité de protection des données** (loi n° 2024/017, applicable depuis le 23 juin 2026). Publier une politique ne remplace pas la déclaration. Tu traites des photos (jusqu'à trois par personne, chacune modérée avant d'être montrée), **des enregistrements de voix** (présentation facultative de 15 s, modérée avant d'être entendue, utilisée pour rien d'autre — ni comparaison, ni identification, ni transcription), des données de vie intime (intention de rencontre, et en « relation sérieuse » deux réponses facultatives sur le mariage et les enfants), des données biométriques, un horodatage de dernière activité (montré aux autres par tranche seulement), la tranche d'âge recherchée, le pays et la ville déclarés, la zone de recherche et la langue de lecture — le tout effacé avec le compte. Le fuseau horaire transite pour deviner le pays au premier lancement, sans être stocké ni journalisé ; aucune coordonnée GPS n'est demandée. **Vérifie aussi où sont hébergées les données** : les transferts hors du Cameroun sont encadrés par la même loi.

### Ce qui demande une organisation, pas du code

- [ ] **Quelqu'un qui regarde le groupe de modération chaque jour.** Depuis que la validation automatique n'existe plus en production, **personne ne s'inscrit tant qu'un humain n'a pas tranché** : c'est désormais le goulot d'étranglement de l'inscription.
- [x] ~~**Passer à PostgreSQL**~~ : fait le 13 septembre 2026. La production tourne sur `mbolo-pg` (Fly non géré), les 58 lignes du fichier JSON ont été importées — événements de mesure compris — et vérifiées par `scripts/etat-stockage.js` avant que la base ne prenne son nom définitif.
- [ ] **Poser `BACKUP_SECRET` pour allumer les sauvegardes.** Le mécanisme est en place — travail **Sauvegarde** chaque nuit, copie chiffrée sur le volume et dans les artefacts GitHub, restauration éprouvée par `test/sauvegarde.test.js` à chaque `npm run test:pg`. Il ne manque que le secret, et **rien ne se sauvegarde tant qu'il n'est pas posé** : `flyctl secrets set BACKUP_SECRET="$(openssl rand -hex 32)"`. **Garde-le ailleurs que sur la machine** — il ouvre les copies, et lui seul. Marche à suivre complète, restauration comprise, dans [`DEPLOIEMENT.md`](DEPLOIEMENT.md).

### Entretien du dépôt

- [ ] **Supprimer les branches fusionnées** — il y en a une quarantaine. Onglet *Branches* → filtre *Merged*. Puis coche **Automatically delete head branches** dans *Settings → General* pour que les suivantes disparaissent seules.

### À propos de `MATCH_POLICY`

Par défaut (`romance_opposite`), le mode **Relation sérieuse** ne met en relation que des femmes et des hommes, et l'app ne collecte aucune donnée d'orientation. Ce choix répond au cadre pénal camerounais (article 347-1 du Code pénal et loi de 2010 sur la cybercriminalité) et au risque documenté de pièges tendus via les applications de rencontre : stocker ce type de données pourrait mettre des utilisateurs en danger en cas de fuite ou de réquisition. Si tu déploies dans un autre pays, adapte ce paramètre avec un juriste local. Le mode Amitié n'est pas concerné. Attention : le réglage est global au serveur, pas par pays. Depuis que l'app est ouverte à tous les pays, une même instance applique donc la même règle à quelqu'un qui cherche à Yaoundé et à quelqu'un qui cherche à Paris.

---

## Organisation du code

```
mbolo-miniapp/
├── server/
│   ├── index.js      Serveur Express, sécurité, QR codes des lieux
│   ├── config.js     Variables d'environnement, lieux partenaires, listes
│   ├── auth.js       Vérification de la signature Telegram (initData)
│   ├── routes.js     API : profil, vérification, découverte, matchs, messages, rendez-vous
│   ├── bot.js        Bot : /start, modération, notifications avec bouton vers le bon écran
│   ├── antiscam.js   Filtre des demandes d'argent et partages de contact
│   ├── jauge.js      Jauge de confiance : la liste des critères, et rien qu'elle
│   ├── lieux.js      Le code d'un lieu : empreinte du secret serveur, jamais servie au client
│   ├── sauvegarde.js Sauvegarde chiffrée de la base : ce qu'elle emporte, ce qu'elle laisse
│   ├── limites.js    Limitation de débit : les règles ; les compteurs sont dans le stockage
│   ├── store.js      Choix du stockage selon DATABASE_URL
│   ├── store.json.js Stockage dans un fichier JSON (défaut, une seule instance)
│   ├── store.pg.js   Stockage PostgreSQL (production), même interface
│   ├── db/           Lanceur de migrations et migrations SQL
│   ├── geo.js        Pays, villes connues, normalisation des villes, fuseau → pays
│   ├── i18n.js       Langue de chaque personne, messages du bot traduits
│   └── seed.js       Profils de démonstration
├── public/
│   ├── index.html    Charge le SDK officiel telegram-web-app.js
│   ├── tg.js         Accès aux fonctions natives Telegram, avec secours hors Telegram
│   ├── app.js        Écrans et logique de l'interface
│   ├── ui.js         Icônes, toast, squelettes de chargement, geste de balayage
│   ├── i18n.js       Choix de la langue, chargement du dictionnaire à la demande
│   ├── i18n/en.js    Dictionnaire anglais (la clé est la phrase française)
│   └── styles.css    Styles basés sur le thème Telegram de chaque utilisateur
├── Dockerfile        Image de l'application (Fly, ou tout hébergeur Docker)
├── deployer-fly.sh   Déploiement sur Fly : app, volume, secrets, contrôle /health
├── fly.toml          Service Fly : port, volume de données, contrôle /health
├── render.yaml       Le même service décrit pour Render
├── scripts/          Import et contrôle de la bascule PostgreSQL, suite de tests sur PostgreSQL
├── test/             Tests automatiques
└── data/             Base et photos (créé automatiquement, ignoré par Git)
```

## Prochaines étapes suggérées

1. **Un code de check-in qui ne se devine pas** : `rdv:lieu:palmier` se déduit de l'identifiant du lieu, donc une arrivée peut être confirmée depuis chez soi. Sans conséquence tant que la liste des lieux est vide — **à corriger avant le premier partenariat**, et impérativement avant de facturer un lieu au rendez-vous confirmé.
2. **Pidgin et autres langues** : le français et l'anglais sont en place, le mécanisme attend les suivantes.
3. **Mode duo complet** : inscription à deux et match entre duos. L'option a été **retirée de l'inscription** en attendant (P1-7) : elle promettait des rencontres à quatre que rien dans le serveur ne sait organiser.
4. **Tableau de bord de modération** web : ce qui reste n'est pas de la lecture — lieux partenaires et rotation des codes QR.
5. **Temps réel** (WebSocket) à la place de l'interrogation toutes les 4 secondes, quand le trafic le justifie.
6. **Version web et paiement par mobile money** : le cahier des charges est écrit, il attend un feu vert.

Le **système de garant** figurait ici ; il est abandonné. Nommer un membre comme répondant d'un autre laisse croire à un recours qui n'existe pas : une personne arnaquée se retournerait vers lui. La jauge de confiance compte donc deux critères, et le dira tant qu'un troisième n'aura pas de vrai mécanisme.
