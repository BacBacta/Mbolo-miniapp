# Odo : instructions pour l'agent de code

Les instructions de ce dépôt vivent dans **[`CLAUDE.md`](CLAUDE.md)**, et nulle part ailleurs.
Lis-le en entier avant toute modification.

---

## Pourquoi ce fichier ne contient rien d'autre

Il a été une copie de `CLAUDE.md`. Elle a divergé, et pas qu'un peu : figée au **11 septembre
2026**, elle décrivait encore un dépôt sans présentation vocale, sans jauge de confiance, sans
questions de compatibilité, sans espace de modération et sans PostgreSQL — 22 Ko contre 49. Un
agent qui la lisait ne travaillait pas avec des instructions incomplètes, il travaillait avec des
instructions **fausses**.

Deux endroits qui décrivent la même chose finissent toujours par diverger. C'est le raisonnement
de `server/jauge.js`, qui ne tient qu'une seule liste de critères pour la carte, le score et
l'écran d'explication ; et de `server/lieux.js`, où le code d'un lieu n'est transporté nulle part
pour qu'aucune route ne puisse le recopier. Ici, il n'y a qu'un fichier d'instructions.

**Ne recopie pas `CLAUDE.md` ici.** `test/instructions.test.js` le vérifie, pour que ça ne
dépende pas de la vigilance de la prochaine session.
