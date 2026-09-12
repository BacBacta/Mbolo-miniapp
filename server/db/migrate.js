// Lanceur de migrations, en une page plutôt qu'une dépendance de plus.
//
// Les fichiers de migrations/ sont appliqués dans l'ordre de leur nom, une seule fois chacun, et
// notés dans schema_migrations. Chaque fichier passe dans sa propre transaction : une migration
// qui échoue ne laisse pas la base à moitié transformée.
//
// Un verrou consultatif PostgreSQL entoure le tout : deux instances qui démarrent en même temps
// ne doivent pas appliquer la même migration deux fois.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const VERROU = 8_140_325; // un entier arbitraire, mais stable : c'est ce qui identifie le verrou

export async function migrer(pool, journal = console.log, schema = '') {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [VERROU]);
    // Le schéma est créé avant tout le reste : le search_path posé à la connexion ne peut pas
    // désigner un schéma absent. Le nom a déjà été filtré par config.js.
    if (schema) {
      await client.query(`create schema if not exists ${schema}`);
      await client.query(`set search_path to ${schema}`);
    }
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const { rows } = await client.query('select name from schema_migrations');
    const faites = new Set(rows.map((r) => r.name));
    const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.sql')).sort();

    let appliquees = 0;
    for (const nom of fichiers) {
      if (faites.has(nom)) continue;
      const sql = fs.readFileSync(path.join(DOSSIER, nom), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [nom]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Migration ${nom} échouée : ${e.message}`);
      }
      journal(`Migration appliquée : ${nom}`);
      appliquees += 1;
    }
    return { appliquees, total: fichiers.length };
  } finally {
    await client.query('select pg_advisory_unlock($1)', [VERROU]).catch(() => {});
    client.release();
  }
}
