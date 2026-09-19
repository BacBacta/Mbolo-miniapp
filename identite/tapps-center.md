# Odo · fiche pour le Telegram Apps Center

Le Telegram Apps Center (`tapps.center`, catalogue `@tapps_bot`) est l'annuaire tenu par
l'écosystème TON. **On y dépose une app par le bot de modération `@app_moderation_bot`**
(« Telegram Apps Moderation »), pas par le catalogue lui-même. Il n'est pas le Mini App Store de Telegram (celui-là se règle dans BotFather, voir
`identite/textes-botfather.md`), et il ne demande aucune intégration blockchain : Odo y entre tel
quel, sans jeton ni portefeuille — la règle 8 de `CLAUDE.md` ne bouge pas.

**Le dépôt se fait depuis ton compte Telegram**, dans `@app_moderation_bot` : personne d'autre ne
peut le faire à ta place. Ouvre le bot, appuie sur Démarrer, choisis d'ajouter une app, et réponds
aux questions une par une avec les champs ci-dessous. Tout ce que le formulaire demande est ci-dessous, prêt à coller. La modération
prend de trois à huit jours. Les libellés exacts des menus du bot ne sont pas documentés
publiquement ; ce qui est sûr, c'est la liste des champs.

> **Le 19 septembre 2026, le dépôt est en pause.** `tapps.center` n'affiche plus que « Something new
> is coming. We're building the next chapter for apps on TON & Telegram », sans lien de dépôt, et
> `@app_moderation_bot` ne répond pas. Aucune date de réouverture n'est annoncée. La fiche reste
> prête pour ce jour-là ; en attendant, le repli est FindMini.app, en bas de ce fichier.

## Avant d'appuyer sur « Envoyer »

- [ ] La **Main Mini App** est activée dans BotFather (`/mybots` → Bot Settings → Configure
      Mini App → Enable Mini App, adresse `https://mbolo-miniapp.fly.dev`). Sans elle, la fiche
      du bot n'a pas de bouton « Launch app ».
- [ ] Le bot répond à `/start` en anglais à qui a Telegram en anglais : c'est le cas
      (`server/i18n.js`, la langue de qui reçoit). Le modérateur verra « Hi … Odo lets you meet
      verified people from your city… ».
- [ ] Les deux pages publiques répondent : `https://mbolo-miniapp.fly.dev/confidentialite` et
      `https://mbolo-miniapp.fly.dev/conditions`. Elles sont demandées.
- [ ] Les trois points de « Avant d'ouvrir à de vraies personnes » du README : un annuaire amène
      des inconnus.

## Les champs

**Nom** : `Odo`

**Accroche** (une ligne) :

- EN : `Verified people, face to face.`
- FR : `Des rencontres vérifiées, face à face.`

**Catégorie** : Social / Dating (prends « Social » si « Dating » n'existe pas).

**Description** — l'anglais d'abord, c'est la langue de la modération :

```
Odo is where real people meet, in French-speaking Africa first.

Every profile is verified with a selfie and a requested gesture, checked by a real person. No money requests get through the chats: amounts, payment methods and phone numbers are blocked. Your username and phone number stay hidden.

The first meet-up happens in a public place, and someone you trust can be told where and when.

18 and over only. Light on data: nothing loads unless you ask for it. Works in French, English, Spanish, Portuguese, Swahili, Russian and Ukrainian.
```

```
Odo, ce sont des rencontres entre personnes réelles, d'abord en Afrique francophone.

Chaque profil est vérifié par un selfie avec un geste demandé, regardé par une vraie personne. Aucune demande d'argent ne passe dans les discussions : montants, moyens de paiement et numéros sont bloqués. Ton pseudo et ton numéro restent cachés.

Le premier rendez-vous se fait dans un lieu public, et une personne de confiance peut être prévenue.

Réservé aux 18 ans et plus. Léger en data : rien ne se charge sans que tu le demandes. En français, anglais, espagnol, portugais, swahili, russe et ukrainien.
```

**Lien de l'app** : `https://t.me/<ton_bot>/<nom_de_la_mini_app>` (le lien `t.me` de la Main Mini
App, tel que BotFather le donne). **Lien du bot** : `https://t.me/<ton_bot>`.

**Icône** : `identite/odo-photo-1024.png` (1024 × 1024).

**Captures** — six emplacements, dans cet ordre, dossier `identite/tapps-center/` (786 × 1454,
thème sombre, prises sur `main` le 18 septembre 2026) :

| # | Fichier | Ce qu'elle montre |
|---|---|---|
| 1 | `01-accueil.png` | L'accueil et les quatre promesses |
| 2 | `02-carte.png` | Le paquet : photo d'abord, la question, « Vérifié », les trois ronds |
| 3 | `03-verification.png` | Le selfie avec un geste tiré au hasard |
| 4 | `04-match.png` | L'écran de match |
| 5 | `05-discussion.png` | La discussion, avec la ligne de déblocage des liens et numéros |
| 6 | `06-se-proteger.png` | « Te protéger de cette personne » : retirer, bloquer, signaler |

**Les mêmes six écrans en anglais** sont dans `identite/tapps-center/en/`, mêmes noms, même taille
(786 × 1454), l'interface en anglais et la politique de la production (`badge`, « Vérifié » seul).
Trois textes y ont été traduits à la main dans la capture, parce qu'ils ne viennent pas des
dictionnaires : la réponse du profil de démonstration, sa réponse dans la discussion, et **le
geste de vérification** — qui, au moment des captures, n'existait qu'en français ; il est traduit
dans les six langues depuis le 19 septembre 2026, et les captures lui sont désormais fidèles.

Les profils des captures sont ceux de démonstration, à initiales : il n'y a pas encore de portraits
(audit 15, constat K). Si tu préfères de vrais visages, prends les captures sur ton téléphone avec
des membres qui ont accepté — jamais une banque d'images.

**Politique de confidentialité** : `https://mbolo-miniapp.fly.dev/confidentialite`
**Conditions d'utilisation** : `https://mbolo-miniapp.fly.dev/conditions`
**Contact** : ton adresse, ou le bot (`/aide`).

**Blockchain / jeton** : aucun. Si le formulaire exige d'en choisir un, réponds « none » ou
« not a Web3 app » : l'annuaire accepte les apps sans Web3.

## Repli : FindMini.app

`https://www.findmini.app/submit/` — un annuaire tiers de mini apps (6 600 apps), gratuit, mis en
ligne sous 24 h, formulaire web depuis le téléphone. Il refuse « les apps 18+ » au sens du contenu
adulte : Odo est réservé aux adultes, ce n'est pas la même chose, et la description longue le dit
par la vérification, les lieux publics et l'argent bloqué — pas par le seul mot « 18+ ».

| Champ | Quoi mettre |
|---|---|
| Bot/App Start link | le lien `t.me` de la Main Mini App, tel que BotFather le donne |
| App Name | `Odo` |
| Profile picture | `identite/tapps-center/icone-512.png` (512 × 512, 186 Ko — l'icône de 1024 px pèse un peu plus d'un mégaoctet, la limite du formulaire) |
| Screenshots | les six captures de `identite/tapps-center/en/` (l'interface en anglais), toutes en 786 × 1454 : le formulaire exige la même taille pour toutes |
| Short description in English (20 mots) | la phrase courte de la fiche anglaise (16 mots) |
| Short description in Russian | vide, ou la même phrase dans le dictionnaire russe de l'app |
| Full description in English | la description de la fiche anglaise |
| TON blockchain | décoché |
| Interface languages | EN, RU, ES, PT, et « Others » pour le français, le swahili et l'ukrainien |
| Additional links | les deux pages publiques, et le lien du bot |
| Developer's Telegram contact | ton pseudo Telegram ; il n'est pas publié |

Les images se téléchargent sur le téléphone depuis GitHub (« Raw » sur chaque fichier de
`identite/tapps-center/`), puis se choisissent depuis la galerie.

## Ce qui peut faire refuser

- Une fiche du bot incomplète (pas de photo, pas de description, pas de Main Mini App).
- Un `/start` qui ne répond pas, ou pas en anglais pour un client en anglais.
- Des captures qui montrent autre chose que l'app.
- Une app de rencontres peut demander une mention 18+ : elle est déjà sur l'accueil, dans la
  description et dans les conditions.
