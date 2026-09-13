# Identité visuelle

Tout ce dossier est **fabriqué**, jamais dessiné à la main. `brand/generer.js` produit les SVG et
les PNG à partir de trois choses : les couleurs de `public/styles.css`, les lettres figées dans
`brand/traces.js`, et le Chromium de Playwright déjà installé pour les tests de bout en bout.

```powershell
npm run logo
```

Un test (`test/marque.test.js`) vérifie que les couleurs du logo sont toujours celles de la feuille
de style, que les lettres sont des tracés et non du texte, et que les SVG du dépôt sont bien ceux
que le générateur produit aujourd'hui. Si tu modifies `generer.js` sans relancer `npm run logo`,
`npm test` te le dit.

## L'idée

Le logo est **l'avatar vérifié de l'app elle-même**. Dans l'app, un avatar est un carré arrondi sur
le dégradé violet-encre des photos, avec l'initiale en os ; une personne vérifiée y gagne une
bordure d'aura, le dégradé rose, ambre, violet. Le logo prend ces trois éléments et leur donne de
la matière, avec le vocabulaire des icônes d'app :

- un **squircle** à courbure continue, comme les icônes d'iOS, pas un rectangle aux coins arrondis ;
- une **face éclairée par le haut** : dégradé vertical sur les trois tons de photo de l'app, reflet
  en haut à gauche, liseré de lumière sur l'arête supérieure, ombre intérieure au pied ;
- un **anneau qui rayonne** : la bordure nette, une lueur qui déborde, un fil de lumière sur son
  bord intérieur ;
- une **initiale en léger relief** : dégradé blanc vers os, arête haute éclairée, ombre portée
  courte ;
- derrière, **l'encre maillée** : deux nappes de couleur floutées, une grille de points qui
  s'efface vers les bords, une vignette et un grain fin.

## Les quatre usages

Une seule construction. Ce qui change est l'anneau, avec le sens que l'app donne à sa couleur.

| Fichier | Anneau | Destination |
|---|---|---|
| `avatar-app-512.png` | Aura, la bordure d'une personne vérifiée | Photo de profil du bot. Dans @BotFather : `/setuserpic`. Sert aussi d'icône de la mini app |
| `avatar-moderation-512.png` | Ambre, la couleur de la confiance dans l'app | Photo du groupe privé de modération, celui de `ADMIN_CHAT_ID` |
| `avatar-communaute-512.png` | Rose vers ambre, la couleur du « J'aime » | Photo du groupe ouvert aux membres de la bêta |
| `avatar-annonces-512.png` | Aura, sur le thème clair | Photo du canal d'annonces public |

Et autour :

| Fichier | Usage |
|---|---|
| `presentation-640x360.png` | Image de présentation demandée par @BotFather pour la mini app |
| `banniere-1600x900.png` | Image de partage, même composition en plus grand (non versionnée, `npm run logo`) |
| `logo-horizontal-sombre.png`, `logo-horizontal-clair.png` | Verrouillage horizontal, fond transparent ; `-sur-encre` et `-sur-os` sont les mêmes avec leur fond |
| `marque-*-512.png` | L'icône seule, fond transparent, pour la poser sur autre chose |
| `logotype-os.png` | Le nom seul |
| `svg/monogramme-*.svg` | Le logo en une couleur : tampon, filigrane, gravure |
| `svg/favicon.svg` | Pour un onglet de navigateur |

Les SVG de `svg/` sont la source : ils se redimensionnent sans perte, pour une impression ou une
affiche. Les PNG en 1024, l'affiche en 1280 et la bannière en 1600 ne sont pas versionnés, parce
que le grain les rend lourds et que `npm run logo` les refait en quelques secondes.

Pour poser une photo de groupe dans Telegram : ouvrir le groupe, toucher son nom, **Modifier**,
puis l'icône d'appareil photo. Telegram découpe lui-même un cercle dans le carré, et l'icône avec
sa lueur tient dans le cercle inscrit, donc rien n'est coupé.

## Changer le nom

Le nom vit dans une seule constante, `MARQUE` en haut de `generer.js`. En changer demande deux
gestes :

1. régénérer `brand/traces.js` avec la nouvelle initiale et le nouveau mot, en suivant l'en-tête de
   ce fichier — il faut les polices et `opentype.js` ;
2. mettre `MARQUE.nom`, `MARQUE.mot` et `MARQUE.lettre` à jour, puis `npm run logo`.

Le nom de l'app côté serveur ne vit pas ici : c'est la variable d'environnement `APP_NAME`.

## Les polices

Aucune police n'est embarquée ni requise. Les lettres du logo sont des **tracés**, extraits une
fois et figés dans `brand/traces.js`, ce qu'un test vérifie. Le logotype est en Fraunces 500, la
graisse que l'app charge pour son identité ; le monogramme en 600, qui tient mieux en petit. Les
deux familles sont sous licence SIL Open Font License 1.1, qui autorise cet usage :

- **Fraunces** (144pt, Soft), undercase type — le monogramme et le logotype ;
- **Manrope** (Medium, SemiBold), Mikhail Sharanda — la signature et l'étiquette de la bêta.

## Ce qui reste à faire hors du code

Le nom retenu doit faire l'objet d'une **recherche d'antériorité à l'OAPI**, dont le siège est à
Yaoundé, avant tout dépôt. Un dépôt y couvre dix-sept pays d'un coup. Le domaine et le pseudo du
bot se réservent le jour du choix, pas après.
