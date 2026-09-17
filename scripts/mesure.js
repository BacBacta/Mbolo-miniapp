// npm run mesure : le banc de performance dans un vrai navigateur (Chromium, taille d'un
// téléphone, processeur bridé ×4, réseau lent). Lance Playwright sur e2e/banc.spec.js avec la
// variable qui l'autorise — sans elle, le fichier se saute, pour ne pas allonger `npm run e2e`.
//
// Sous PowerShell : `npm run mesure`, et le résumé s'affiche ; le détail est dans .mesure.json.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const sortie = path.join(process.cwd(), '.mesure.json');
if (fs.existsSync(sortie)) fs.unlinkSync(sortie);
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'test', 'e2e/banc.spec.js'], {
  stdio: 'inherit', env: { ...process.env, MESURE: '1', MESURE_SORTIE: sortie },
});
if (!fs.existsSync(sortie)) { console.error('Aucune mesure écrite.'); process.exit(r.status || 1); }
const m = JSON.parse(fs.readFileSync(sortie, 'utf8'));
const ligne = (nom, v) => console.log(`  ${nom.padEnd(44)} ${String(v).padStart(10)}`);
if (m.chargement) {
  console.log('\nChargement à froid (réseau lent, processeur bridé)');
  ligne('premier écran', `${m.chargement.premierEcranMs} ms`);
  ligne('paquet à l\'écran', `${m.chargement.paquetMs} ms`);
  ligne('à chaud (cache)', `${m.chargement.chaudMs} ms`);
  ligne('octets transférés', `${Math.round(m.chargement.octets / 1024)} Ko`);
  ligne('requêtes', m.chargement.requetes);
  ligne('tâches longues', `${m.chargement.longTasks} (${m.chargement.longTasksMs} ms)`);
}
if (m.navigation) { console.log('\nChanger d\'écran'); for (const n of m.navigation) ligne(n.ecran, `${n.renduMs} ms${n.pireTacheMs ? `, pire tâche ${n.pireTacheMs} ms` : ''}`); }
if (m.balayage) { console.log('\nBalayer une carte (durée d\'image)'); m.balayage.forEach((b, i) => ligne(`essai ${i + 1}`, `p50 ${b.p50} ms · p95 ${b.p95} ms · max ${b.max} ms · ${b.lentes} lente(s)`)); }
if (m.discussion) {
  console.log('\nDiscussion (deux navigateurs)');
  ligne('requêtes au repos, par minute', m.discussion.requetesAuReposParMin);
  ligne('« écrit… » vu par l\'autre', typeof m.discussion.frappeMs === 'number' ? `${m.discussion.frappeMs} ms` : m.discussion.frappeMs);
  ligne('message vu par l\'autre', `${m.discussion.messageMs} ms`);
  ligne('accusé de lecture', typeof m.discussion.luMs === 'number' ? `${m.discussion.luMs} ms` : m.discussion.luMs);
}
if (m.api) { console.log('\nAPI (sans bridage, p50 / p95)'); for (const [c, v] of Object.entries(m.api)) ligne(c, `${v.p50} / ${v.p95} ms`); }
console.log(`\nDétail : ${sortie}`);
