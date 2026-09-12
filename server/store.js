// Point d'entrée du stockage. Deux implémentations derrière la même interface :
//
//   DATABASE_URL défini  → PostgreSQL (store.pg.js) : plusieurs instances, sauvegardes, transactions
//   sinon                → fichier JSON (store.json.js) : rien à installer, une seule instance
//
// L'import est dynamique pour que le mode JSON n'ait jamais besoin du paquet pg, ni d'une base
// à portée : `npm start` sans configuration doit continuer à marcher, c'est ce qui rend le
// prototype installable en une commande.
import { config } from './config.js';

const impl = config.databaseUrl ? await import('./store.pg.js') : await import('./store.json.js');

export const store = impl.store;
export const newId = impl.newId;
// Ce qu'ont fait les migrations. Elles sont déjà passées quand cette ligne s'exécute : store.pg.js
// les attend à son import, donc personne ne peut interroger une table absente. En mode JSON il n'y
// a rien à migrer.
export const pret = impl.pret || { appliquees: 0, total: 0 };
export const modeStockage = config.databaseUrl ? 'postgres' : 'json';
