# Identité visuelle

Tout ce dossier est **fabriqué**, jamais dessiné à la main. `brand/generer.js` produit les SVG et
les PNG à partir de trois choses : les couleurs de `public/styles.css`, les lettres figées dans
`brand/traces.js`, et le Chromium de Playwright déjà installé pour les tests de bout en bout.

```powershell
npm run logo
```

Un test (`test/marque.test.js`) vérifie que les couleurs du logo sont toujours celles de la feuille
de style, et que les SVG du dépôt sont bien ceux que le générateur produit aujourd'hui. Si tu
modifies `generer.js` sans relancer `npm run logo`, `npm test` te le dit.

## L'idée

Dans l'app, l'aura — le dégradé rose, ambre, violet — n'a le droit d'apparaître qu'à trois
endroits : le match, l'anneau autour d'un avatar vérifié, et le stamp du « J'aime ». Le logo est
donc l'anneau du profil vérifié, appliqué à la marque elle-même.

L'initiale est un **O**, c'est-à-dire déjà un anneau. Deux constructions en sortent, et les deux
sont produites :

| Dossier | Construction | Quand |
|---|---|---|
| `lettre/` | La lettre **est** l'anneau, peinte de l'aura. Rien d'autre. | **Par défaut.** Un seul objet, et le O de Fraunces garde ses pleins et ses déliés, donc il se lit comme une lettre, pas comme un cercle |
| `anneau/` | La lettre est posée au centre d'un anneau séparé | Gardée pour comparaison. Avec un O, l'anneau et la lettre font deux cercles concentriques : la forme se répète au lieu de se renforcer |

## Où va chaque fichier

Les PNG de `png/lettre/` sont prêts à envoyer. Les SVG de `svg/lettre/` sont la source : ils se
redimensionnent sans perte, pour une impression ou une affiche.

| Fichier | Destination |
|---|---|
| `avatar-app-512.png` | Photo de profil du bot. Dans @BotFather : `/setuserpic`. Sert aussi d'icône de la mini app |
| `avatar-moderation-512.png` | Photo du groupe privé de modération, celui de `ADMIN_CHAT_ID`. L'ambre est la couleur de la confiance dans l'app |
| `avatar-communaute-512.png` | Photo du groupe ouvert aux membres de la bêta. Le rose est la couleur du « J'aime » |
| `avatar-annonces-512.png` | Photo du canal d'annonces public. La version claire, os et encre |
| `presentation-640x360.png` | Image de présentation demandée par @BotFather pour la mini app |
| `logo-horizontal-sombre.png` | Verrouillage horizontal sur fond sombre, fond transparent |
| `logo-horizontal-clair.png` | Le même sur fond clair |
| `../logotype-os.png` | Le nom seul, sans la marque |

Pour poser une photo de groupe dans Telegram : ouvrir le groupe, toucher son nom, **Modifier**,
puis l'icône d'appareil photo. Telegram découpe lui-même un cercle dans le carré, et tout le dessin
tient dans le cercle inscrit, donc rien n'est coupé.

Les PNG en 1024 ne sont pas versionnés : ils pèsent près d'un mégaoctet chacun à cause du grain, et
`npm run logo` les refait en quelques secondes quand une impression en a besoin.

## Changer le nom

Le nom vit dans une seule constante, `MARQUE` en haut de `generer.js`. En changer demande deux
gestes :

1. régénérer `brand/traces.js` avec la nouvelle initiale et le nouveau mot, en suivant l'en-tête de
   ce fichier — il faut les deux polices et `opentype.js` ;
2. mettre `MARQUE.nom`, `MARQUE.mot` et `MARQUE.lettre` à jour, puis `npm run logo`.

Le nom de l'app côté serveur ne vit pas ici : c'est la variable d'environnement `APP_NAME`.

## Les polices

Aucune police n'est embarquée ni requise. Les lettres du logo sont des **tracés**, extraits une
fois et figés dans `brand/traces.js`, ce qu'un test vérifie. Les deux familles sont sous licence
SIL Open Font License 1.1, qui autorise cet usage :

- **Fraunces** (144pt, Soft, SemiBold), undercase type — le monogramme et le logotype ;
- **Manrope** (Medium, SemiBold), Mikhail Sharanda — la signature et l'étiquette de la bêta.

## Ce qui reste à faire hors du code

Le nom retenu doit faire l'objet d'une **recherche d'antériorité à l'OAPI**, dont le siège est à
Yaoundé, avant tout dépôt. Un dépôt y couvre dix-sept pays d'un coup. Le domaine et le pseudo du
bot se réservent le jour du choix, pas après.
