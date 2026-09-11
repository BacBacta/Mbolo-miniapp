# Mbolo : rencontres vérifiées, face à face

**Mbolo** signifie « salut, bienvenue » dans plusieurs langues d'Afrique centrale. C'est le mot qu'on dit en arrivant, au moment où deux personnes se rencontrent pour de vrai : c'est exactement la promesse de l'app. Il est court, se prononce de la même façon en français et en anglais, et se retient du premier coup.

> Le nom se change sans toucher au code : variable `APP_NAME` dans `.env` (voir « Changer le nom de l'application »).

Prototype déployable d'une mini app de rencontres pensée pour l'Afrique francophone : profils vérifiés par selfie, demandes d'argent bloquées, rendez-vous dans des lieux publics partenaires avec confirmation d'arrivée par QR code, mode économie de data.

Ce dépôt contient tout ce qu'il faut pour la tester sur ton propre téléphone en une heure environ.

---

## Ce que fait l'application

| Fonction | Comment c'est fait |
|---|---|
| Connexion sans mot de passe | Identité Telegram, signature vérifiée côté serveur (`server/auth.js`) |
| Profil 18+ | Âge contrôlé, ni numéro ni lien accepté dans le profil |
| Vérification par selfie | Geste aléatoire, selfie envoyé à ta discussion de modération avec les boutons Valider / Refuser, puis **supprimé** |
| Découverte | Profils vérifiés de la même ville et de la même intention, 20 par jour |
| Match et discussion | Discussion plein écran, heure des messages, compteur de non lus, pseudos Telegram jamais montrés |
| Notifications | Le bot prévient d'un match, d'un message ou d'un like (« tu as plu à quelqu'un », une fois par jour), mais pas si la personne lit déjà la discussion |
| Onglet Profil | Aperçu de son profil tel que les autres le voient, modification, test des notifications, paramètres |
| Anti-arnaque | Demandes d'argent bloquées ; liens, numéros et pseudos bloqués avant 10 messages (`server/antiscam.js`) |
| Rendez-vous sûr | Lieux partenaires uniquement, arrivée confirmée par le scanner QR natif de Telegram |
| Signalement | Bloque immédiatement et prévient la modération |
| Données personnelles | Suppression complète du compte depuis les paramètres |

Éléments natifs Telegram utilisés : bouton principal et secondaire, bouton Retour, bouton Paramètres, popups, retour haptique, scanner de QR code, confirmation de fermeture, stockage Telegram, autorisation d'écriture, couleurs du thème de l'utilisateur.

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
Profils de démonstration chargés : 6
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

**Quels profils de démo vas-tu voir ?**

| Ton choix | Profils affichés |
|---|---|
| Relation sérieuse, femme | Junior |
| Relation sérieuse, homme | Carine |
| Amitié | Brice, Nadège |
| Sortie en duo | Mireille, Stéphane |

## Étape 5 : tester le QR code d'arrivée

1. Mets une valeur à `ADMIN_KEY` dans `.env` et redémarre.
2. Sur ton ordinateur, ouvre `https://TON-ADRESSE/qr/palmier.png?key=TA_CLE`.
3. Dans la discussion Mbolo sur ton téléphone, appuie sur **Je suis arrivé(e) : scanner le code** et vise l'écran.

Lieux disponibles : `palmier`, `etudiants`, `lac` (Yaoundé) et `wouri` (Douala). Ils se modifient dans `server/config.js`.

## Étape 6 : activer la vraie modération des selfies

1. Crée un groupe Telegram privé « Modération Mbolo » et ajoute ton bot.
2. Envoie `/id` dans le groupe : le bot répond l'identifiant (ex. `-1001234567890`).
3. Dans `.env` : `ADMIN_CHAT_ID=-1001234567890` et `AUTO_APPROVE=false`.
4. Redémarre. Chaque nouveau selfie arrive dans le groupe avec le geste demandé et deux boutons : **Valider** ou **Refuser**. Le selfie est supprimé du serveur dès la décision.

## Étape 7 (facultative) : faire de Mbolo l'app principale du bot

Dans @BotFather : `/mybots` → ton bot → **Bot Settings** → **Configure Mini App** → active-la avec ton `WEBAPP_URL`. Tu obtiens :

- un bouton « Ouvrir l'app » sur le profil du bot ;
- des liens directs `https://t.me/TON_BOT?startapp=ref_123` à partager ;
- la personnalisation de l'écran de chargement (icône, couleurs).

Pense aussi à renseigner ta **politique de confidentialité** dans BotFather (obligatoire dès que tu collectes des données).

---

## Changer le nom de l'application

1. Dans `.env`, modifie la ligne `APP_NAME=Mbolo` (ex. `APP_NAME=Imani`).
2. Redémarre le serveur : le nom change dans l'app, les messages du bot, les notifications et les avantages des lieux partenaires.
3. Dans @BotFather : `/mybots` → ton bot → **Edit Bot** → **Edit Name** pour le nom affiché en haut de la mini app, puis **Edit About** et **Edit Description** pour les textes de présentation.
4. L'identifiant du bot (`@...`) ne se modifie généralement pas : si tu veux un identifiant assorti au nouveau nom, crée un nouveau bot avec `/newbot` et mets son jeton dans `BOT_TOKEN`.

Avant un lancement public, vérifie que le nom est libre : marque auprès de l'OAPI (Afrique francophone) et de l'ARIPO (Afrique anglophone), nom de domaine, identifiant Telegram et réseaux sociaux.

## Développer sans téléphone

Pour travailler l'interface dans un navigateur classique :

```bash
ALLOW_DEV_AUTH=true npm start
```

Puis ouvre `http://localhost:3000/?dev_user=1001`. Les boutons natifs sont remplacés par une barre en bas de page, le scanner QR par une fenêtre où tu colles le code (ex. `rdv:lieu:palmier`). Change `dev_user` pour simuler une autre personne.

> Ne jamais activer `ALLOW_DEV_AUTH` en production : n'importe qui pourrait se faire passer pour n'importe qui. Le serveur l'ignore automatiquement si `NODE_ENV=production`.

### Si tu ne reçois pas de notification

| Cause | Solution |
|---|---|
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

---

## Mettre en ligne (bêta fermée)

N'importe quel hébergeur Node.js avec **stockage persistant** convient (VPS, Railway, Fly.io, Render avec disque, etc.).

Variables à définir chez l'hébergeur :

```
NODE_ENV=production
BOT_TOKEN=...
WEBAPP_URL=https://ton-domaine
ADMIN_CHAT_ID=...
ADMIN_KEY=une-longue-cle-aleatoire
USE_WEBHOOK=true
AUTO_APPROVE=false
SEED_DEMO=false
ALLOW_DEV_AUTH=false
```

Avec `USE_WEBHOOK=true`, Telegram envoie les messages du bot directement à ton serveur au lieu que le bot aille les chercher.

**Important sur le stockage** : les données sont dans `data/db.json` et les photos dans `data/uploads/` (ou dans le dossier indiqué par `DATA_DIR`). Si ton hébergeur efface le disque à chaque redéploiement, tu perds tout. Monte un volume persistant sur `data/`, fais des sauvegardes, et passe à PostgreSQL avant de dépasser quelques centaines d'utilisateurs.

---

## Avant d'ouvrir à de vraies personnes

Ce prototype sert à une **bêta fermée**. Avant un lancement public :

- [ ] **Autorisation de l'Autorité de protection des données** (loi n° 2024/017, applicable depuis le 23 juin 2026) : tu traites des photos, des données de vie intime et des données biométriques.
- [ ] Conditions d'utilisation et politique de confidentialité publiées, et renseignées dans BotFather.
- [ ] `SEED_DEMO=false` et `AUTO_APPROVE=false`.
- [ ] Une équipe de modération disponible chaque jour (selfies et signalements).
- [ ] PostgreSQL à la place du fichier JSON, sauvegardes automatiques.
- [ ] Limitation du nombre de requêtes (anti-spam) et journalisation des signalements.
- [ ] Vérifier où sont hébergées les données (transferts hors du Cameroun encadrés par la loi).
- [ ] Faire relire le fonctionnement par un juriste.

### À propos de `MATCH_POLICY`

Par défaut (`romance_opposite`), le mode **Relation sérieuse** ne met en relation que des femmes et des hommes, et l'app ne collecte aucune donnée d'orientation. Ce choix répond au cadre pénal camerounais (article 347-1 du Code pénal et loi de 2010 sur la cybercriminalité) et au risque documenté de pièges tendus via les applications de rencontre : stocker ce type de données pourrait mettre des utilisateurs en danger en cas de fuite ou de réquisition. Si tu déploies dans un autre pays, adapte ce paramètre avec un juriste local. Les modes Amitié et Sortie en duo ne sont pas concernés.

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
│   ├── store.js      Stockage JSON (à remplacer par PostgreSQL)
│   └── seed.js       Profils de démonstration
├── public/
│   ├── index.html    Charge le SDK officiel telegram-web-app.js
│   ├── tg.js         Accès aux fonctions natives Telegram, avec secours hors Telegram
│   ├── app.js        Écrans et logique de l'interface
│   └── styles.css    Styles basés sur le thème Telegram de chaque utilisateur
├── test/             Tests automatiques
└── data/             Base et photos (créé automatiquement, ignoré par Git)
```

## Prochaines étapes suggérées

1. **Présentation vocale** de 15 secondes sur le profil (plus rassurant qu'une photo seule).
2. **Système de garant** : un membre vérifié se porte garant d'un autre (le 2e segment de la jauge de confiance).
3. **Mode duo complet** : inscription à deux et match entre duos.
4. **Anglais et pidgin** pour les régions anglophones.
5. **Tableau de bord de modération** web (signalements, statistiques, lieux partenaires).
6. **Temps réel** (WebSocket) à la place de l'interrogation toutes les 4 secondes, quand le trafic le justifie.
