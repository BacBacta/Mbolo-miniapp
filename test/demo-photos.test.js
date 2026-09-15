// Les images des profils de démonstration, telles que l'app les sert avec SEED_DEMO=true.
//
// Elles n'ont pas toujours eu de fabrique : c'étaient des fichiers, et le jour où on les a
// trouvées mal calibrées — l'initiale posée trop haut, les cercles en travers de la lettre — il
// n'y avait aucun moyen de les refaire. `npm run demo-photos` les refait maintenant, et ce
// fichier fige ce qu'elles doivent rester.
//
// La règle du bas est celle qui compte, et elle vient d'une vraie régression : en les
// régénérant, les trois photos d'un même profil sont devenues identiques. Une fiche en porte
// jusqu'à trois et toucher la carte passe à la suivante — le geste n'aurait plus rien changé à
// l'écran, et rien n'aurait prévenu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'demo-photos');
const fichiers = fs.readdirSync(DIR).filter((f) => f.endsWith('.jpg')).sort();

// La taille d'un JPEG se lit dans son en-tête, sans dépendance : on saute de marqueur en
// marqueur jusqu'au cadre (SOF0…SOF3), qui porte la hauteur puis la largeur.
function taille(octets) {
  let i = 2;
  while (i < octets.length) {
    if (octets[i] !== 0xff) return null;
    const marqueur = octets[i + 1];
    if (marqueur >= 0xc0 && marqueur <= 0xc3) return { h: octets.readUInt16BE(i + 5), l: octets.readUInt16BE(i + 7) };
    i += 2 + octets.readUInt16BE(i + 2);
  }
  return null;
}

test('chaque image est un JPEG au format de la carte', () => {
  assert.ok(fichiers.length >= 20, `des images attendues dans server/demo-photos (${fichiers.length} trouvées)`);
  for (const f of fichiers) {
    assert.match(f, /^demo-[a-z]+-\d+\.jpg$/, `nom inattendu : ${f} — la fabrique en tire le prénom et le numéro`);
    const t = taille(fs.readFileSync(path.join(DIR, f)));
    // 640 × 800, soit le 4/5 de .card-photo : l'image remplit la carte sans être rognée.
    assert.deepEqual(t, { l: 640, h: 800 }, `${f} n'est pas au format 4/5 attendu`);
  }
});

test('les photos d\'un même profil ne se ressemblent pas', () => {
  const parProfil = new Map();
  for (const f of fichiers) {
    const [, prenom] = f.match(/^demo-([a-z]+)-\d+\.jpg$/);
    if (!parProfil.has(prenom)) parProfil.set(prenom, []);
    parProfil.get(prenom).push(fs.readFileSync(path.join(DIR, f)).toString('base64'));
  }
  const multiples = [...parProfil].filter(([, images]) => images.length > 1);
  assert.ok(multiples.length, 'au moins un profil doit porter plusieurs photos, sinon le changement de photo ne se teste nulle part');
  for (const [prenom, images] of multiples) {
    assert.equal(new Set(images).size, images.length,
      `les photos de ${prenom} sont identiques : toucher la carte pour changer de photo ne se verrait pas`);
  }
});
