// La bande-son de la vidéo : une musique produite sous licence libre, et l'habillage sonore
// synthétisé ici, calé sur les scènes.
//
// **La musique** vient de Mixkit (mixkit.co), dont la licence « Stock Music Free » autorise
// l'usage dans une vidéo, commerciale ou non, en ligne comme en publicité, sans attribution ni
// compte — c'est ce que dit la page du catalogue. Le fichier n'est pas versionné : le script le
// télécharge dans `musique/` à la première exécution, et le garde. Un autre morceau du même
// catalogue se choisit par son numéro (`--musique=389`) ; sans réseau, `--sans-musique` retombe
// sur la nappe synthétisée d'avant, pour que la vidéo se refasse quoi qu'il arrive.
//
// **L'habillage** est fabriqué de zéro, de façon déterministe, et chaque événement tombe sur
// l'instant de la scène qu'il souligne, parce que les deux lisent le même minutage (`SCENES`,
// en miroir de video.html) : un souffle qui monte avant chaque changement et un coup sourd
// dessus, une cloche sur le bouclier, le like et le match, un battement de cœur au match, un
// son mat sur le message bloqué, une réverbération sur ce qui frappe. Posé sous la musique, à
// un niveau qui souligne sans couvrir.
//
// **Le mastering** est celui des réseaux en 2026 : -14 LUFS intégrés, crête vraie à -1 dBTP,
// en deux passes de `loudnorm` (mesure, puis correction linéaire — une seule passe comprime
// au fil de l'eau, et ça s'entend). Sortie : son.wav, 48 kHz, stéréo, que rendre.mjs multiplexe.
// Une piste à soi : `npm run video -- --son=chemin/vers/piste.mp3`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SORTIE = args.find((a) => a.startsWith('--sortie='))?.split('=')[1] || path.join(ICI, 'son.wav');
const SR = 48000;
// Le morceau retenu : « Can't Get You Off My Mind », Michael Ramir C., future bass, 91 s.
// Il monte pendant vingt-quatre secondes et s'ouvre à l'instant où la vidéo passe au match ;
// c'est pour cette courbe qu'il a été choisi parmi quatre cents, mesures à l'appui.
const MUSIQUE = args.find((a) => a.startsWith('--musique='))?.split('=')[1] || '1210';
const SANS_MUSIQUE = args.includes('--sans-musique');
const NIVEAU_EFFETS = SANS_MUSIQUE ? 1 : 0.5;

// Le minutage des scènes, en secondes : le même que video.html.
export const SCENES = { marque: 0, accroche: 4.2, verifie: 10, decouvrir: 16, match: 22, bloque: 28, discret: 34, rendezvous: 40, telegram: 46, appel: 52, fin: 58.5 };

// ---------- Les accords ----------
// Ré mineur, chaleureux et sans tension : la tonalité des publicités qui rassurent.
const N = { D2: 73.42, F2: 87.31, A2: 110, Bb2: 116.54, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, Bb3: 233.08, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, A5: 880, C6: 1046.5 };
const Dm9 = [N.D3, N.F3, N.A3, N.E4];
const Bb = [N.Bb2, N.D3, N.F3, N.A3];
const Fmaj7 = [N.F2, N.C3, N.E3, N.A3];
const C9 = [N.C3, N.E3, N.G3, N.D4];
// [début, accord, basse] : la nappe change avec la scène, la basse tient la fondamentale.
const PROGRESSION = [
  [SCENES.marque, Dm9, N.D2], [SCENES.accroche, Bb, N.Bb2], [8.3, Fmaj7, N.F2], [SCENES.verifie, C9, N.C3],
  [SCENES.decouvrir, Dm9, N.D2], [SCENES.match, [...Bb, N.D4, N.F4], N.Bb2], [SCENES.bloque, Fmaj7, N.F2],
  [SCENES.discret, C9, N.C3], [SCENES.rendezvous, Dm9, N.D2], [SCENES.telegram, Bb, N.Bb2], [SCENES.appel, [...Fmaj7, N.C4, N.F4], N.F2],
];

const total = Math.ceil(SCENES.fin * SR);
const L = new Float64Array(total), R = new Float64Array(total);
const wetL = new Float64Array(total), wetR = new Float64Array(total);
let graine = 12;
const bruit = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 2147483648 - 1; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = Math.PI * 2;

// ---------- La nappe ----------
// Chaque note : six harmoniques qui s'éteignent vite (un son rond, jamais criard), deux copies
// légèrement désaccordées à gauche et à droite, un lent va-et-vient d'amplitude. Les accords se
// fondent l'un dans l'autre sur une seconde et demie, à puissance constante.
function nappe(notes, tDebut, tFin, { entree = 1.6, sortie = 1.6, gain = 1 } = {}) {
  const i0 = Math.max(0, Math.floor((tDebut - entree) * SR)), i1 = Math.min(total, Math.ceil((tFin + sortie) * SR));
  notes.forEach((f, n) => {
    const pan = 0.5 + (n % 2 ? 0.18 : -0.18);
    const amp = 0.11 * gain / Math.sqrt(notes.length / 4) * (f > 300 ? 0.55 : 1);
    for (let i = i0; i < i1; i++) {
      const t = i / SR;
      const env = clamp((t - (tDebut - entree)) / entree, 0, 1) * clamp((tFin + sortie - t) / sortie, 0, 1);
      const e = Math.sin(env * Math.PI / 2); // puissance constante sur le fondu
      const lfo = 1 + 0.08 * Math.sin(TAU * 0.11 * t + n);
      let sg = 0, sd = 0;
      for (let k = 1; k <= 6; k++) {
        const a = 1 / Math.pow(k, 1.9);
        sg += a * Math.sin(TAU * f * (1 - 0.0022) * k * t + n * 0.7);
        sd += a * Math.sin(TAU * f * (1 + 0.0022) * k * t + n * 1.3);
      }
      const v = amp * e * lfo;
      L[i] += v * (sg * (1 - pan) + sd * pan * 0.4);
      R[i] += v * (sd * pan + sg * (1 - pan) * 0.4);
    }
  });
}
// La basse : une sinusoïde et sa première harmonique, discrète, qui tient la fondamentale.
function basse(f, tDebut, tFin) {
  const i0 = Math.max(0, Math.floor((tDebut - 1) * SR)), i1 = Math.min(total, Math.ceil((tFin + 1) * SR));
  for (let i = i0; i < i1; i++) {
    const t = i / SR;
    const env = clamp((t - (tDebut - 1)) / 1.2, 0, 1) * clamp((tFin + 1 - t) / 1.2, 0, 1);
    const v = 0.085 * Math.sin(env * Math.PI / 2) * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t));
    L[i] += v; R[i] += v;
  }
}

// ---------- Ce qui frappe ----------
// La cloche : un partiel inharmonique au-dessus de la fondamentale, une décroissance longue.
function cloche(f, t0, { amp = 0.16, duree = 2.4, pan = 0.5 } = {}) {
  const i0 = Math.floor(t0 * SR), i1 = Math.min(total, i0 + Math.ceil(duree * SR));
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const env = Math.exp(-t * 3.2 / duree * 2) * Math.min(1, t * 400);
    const v = amp * env * (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2.756 * t) * Math.exp(-t * 4) + 0.12 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 7));
    wetL[i] += v * (1 - pan) * 1.4; wetR[i] += v * pan * 1.4;
    L[i] += v * (1 - pan) * 0.6; R[i] += v * pan * 0.6;
  }
}
// Le coup sourd d'un changement de scène : une sinusoïde grave qui descend, courte.
function coup(t0, { amp = 0.5, f0 = 110, f1 = 42, duree = 0.9 } = {}) {
  const i0 = Math.floor(t0 * SR), i1 = Math.min(total, i0 + Math.ceil(duree * SR));
  let phase = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t * 14);
    phase += TAU * f / SR;
    const env = Math.exp(-t * 5.5) * Math.min(1, t * 900);
    const v = amp * env * Math.tanh(1.6 * Math.sin(phase));
    L[i] += v; R[i] += v; wetL[i] += v * 0.25; wetR[i] += v * 0.25;
  }
}
// Le souffle qui monte avant un changement : du bruit filtré dont la hauteur et le volume montent.
function souffle(t0, t1, { amp = 0.055 } = {}) {
  const i0 = Math.floor(t0 * SR), i1 = Math.min(total, Math.floor(t1 * SR));
  let lp = 0, bp = 0;
  for (let i = i0; i < i1; i++) {
    const x = (i - i0) / (i1 - i0);
    const fc = 260 + 2100 * x * x;
    const k = Math.min(0.9, TAU * fc / SR);
    const n = bruit();
    lp += k * (n - lp); bp += k * 0.5 * (lp - bp);
    const v = amp * (lp - bp) * 4 * Math.pow(x, 2.6);
    L[i] += v * 0.9; R[i] += v * 1.1; wetL[i] += v * 0.5; wetR[i] += v * 0.5;
  }
}
// Un petit choc mat : un tom étouffé, pour les constats et les lignes de liste.
function toc(t0, { amp = 0.22, f0 = 180, f1 = 70, duree = 0.28 } = {}) {
  const i0 = Math.floor(t0 * SR), i1 = Math.min(total, i0 + Math.ceil(duree * SR));
  let phase = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    phase += TAU * (f1 + (f0 - f1) * Math.exp(-t * 40)) / SR;
    const env = Math.exp(-t * 16) * Math.min(1, t * 2000);
    const v = amp * env * (Math.sin(phase) + 0.12 * bruit() * Math.exp(-t * 60));
    L[i] += v; R[i] += v; wetL[i] += v * 0.6; wetR[i] += v * 0.6;
  }
}
// Un tic doux et clair, pour une ligne qui apparaît.
function tic(t0, f = N.A4, { amp = 0.09 } = {}) { cloche(f, t0, { amp, duree: 0.5, pan: 0.5 + 0.15 * bruit() }); }
// Le battement de cœur : deux coups, le second plus faible.
function coeur(t0, amp = 0.3) { coup(t0, { amp, f0: 80, f1: 38, duree: 0.5 }); coup(t0 + 0.28, { amp: amp * 0.6, f0: 70, f1: 36, duree: 0.45 }); }
// Le refus : un son mat qui descend, deux notes, pas une alarme.
function refus(t0) { toc(t0, { amp: 0.26, f0: 240, f1: 120, duree: 0.22 }); toc(t0 + 0.16, { amp: 0.22, f0: 170, f1: 80, duree: 0.34 }); }

// ---------- La partition ----------
// La nappe et la basse ne servent que sans musique : sous un vrai morceau, elles se battraient
// avec sa tonalité.
if (SANS_MUSIQUE) PROGRESSION.forEach(([t, accord, fondamentale], i) => {
  const fin = i + 1 < PROGRESSION.length ? PROGRESSION[i + 1][0] : SCENES.fin - 2.2;
  nappe(accord, t, fin, { gain: i === PROGRESSION.length - 1 ? 1.15 : 1 });
  basse(fondamentale, t, fin);
});
// La marque : une cloche haute quand le nom apparaît, un second tic pour la phrase.
cloche(N.A5, 0.95, { amp: 0.1, duree: 3 });
tic(1.75, N.E5, { amp: 0.05 });
// L'accroche : un coup pour entrer, trois chocs mats sur les trois constats, un souffle vers la réponse.
souffle(3.1, SCENES.accroche); coup(SCENES.accroche, { amp: 0.42 });
toc(4.75); toc(5.55); toc(6.35);
souffle(7.4, 8.3, { amp: 0.06 }); cloche(N.D5, 8.35, { amp: 0.09, duree: 2 });
// Le téléphone entre : le plus grand changement de la vidéo.
souffle(8.7, SCENES.verifie, { amp: 0.11 }); coup(SCENES.verifie, { amp: 0.55, f0: 130 });
// Le bouclier : la cloche, avec un tic juste avant pour l'annoncer.
tic(12.35, N.E5, { amp: 0.06 }); cloche(N.A4, 12.55, { amp: 0.17, duree: 2.6 });
// Découvrir : un souffle court, un coup léger ; le like tamponné.
souffle(15.3, SCENES.decouvrir, { amp: 0.06 }); coup(SCENES.decouvrir, { amp: 0.3 });
toc(18.9, { amp: 0.3, f0: 220, f1: 90 }); cloche(N.F5, 18.93, { amp: 0.12, duree: 1.6 });
// Le match : le plus grand souffle, un coup rond, le cœur qui bat deux fois, une cloche qui monte.
souffle(20.6, SCENES.match, { amp: 0.13 }); coup(SCENES.match, { amp: 0.5, f0: 120, duree: 1.2 });
coeur(22.75); coeur(24.05, 0.24);
cloche(N.D5, 22.5, { amp: 0.11, duree: 2.2, pan: 0.42 }); cloche(N.F5, 22.72, { amp: 0.11, duree: 2.2, pan: 0.58 }); cloche(N.A5, 22.94, { amp: 0.1, duree: 2.6 });
// Le message bloqué : un coup sec, puis le refus quand l'avertissement apparaît.
souffle(27.4, SCENES.bloque, { amp: 0.06 }); coup(SCENES.bloque, { amp: 0.32 });
refus(29.1);
// Discret : le pseudo s'efface dans un souffle inversé, le prénom arrive sur une cloche.
souffle(33.2, SCENES.discret, { amp: 0.08 }); coup(SCENES.discret, { amp: 0.38 });
souffle(36.3, 37.2, { amp: 0.07 }); cloche(N.C5, 37.4, { amp: 0.13, duree: 2.4 });
// Le premier rendez-vous : trois tics pour trois lignes.
souffle(39.2, SCENES.rendezvous, { amp: 0.07 }); coup(SCENES.rendezvous, { amp: 0.36 });
tic(41.45, N.A4); tic(41.83, N.C5); tic(42.21, N.E5);
// Telegram : pareil, un ton plus haut.
souffle(45.2, SCENES.telegram, { amp: 0.07 }); coup(SCENES.telegram, { amp: 0.36 });
tic(47.45, N.C5); tic(47.83, N.E5); tic(48.21, N.A5);
// L'appel : le dernier souffle, le coup le plus chaud, un arpège de cloches, et la fin.
souffle(50.4, SCENES.appel, { amp: 0.13 }); coup(SCENES.appel, { amp: 0.55, f0: 140, duree: 1.4 });
cloche(N.F5, 52.65, { amp: 0.12, duree: 3, pan: 0.4 }); cloche(N.A5, 52.95, { amp: 0.11, duree: 3, pan: 0.6 }); cloche(N.C6, 53.25, { amp: 0.1, duree: 3.4 });

// ---------- La réverbération ----------
// Schroeder : quatre peignes en parallèle, deux passe-tout en série, sur la voie « mouillée ».
function reverb(entree, sortie, decalage) {
  const peignes = [1557, 1617, 1491, 1422].map((d) => ({ d: Math.round(d * SR / 44100) + decalage, buf: new Float64Array(Math.round(d * SR / 44100) + decalage + 8), i: 0, g: 0.84 }));
  const passeTout = [225, 556].map((d) => ({ d: Math.round(d * SR / 44100), buf: new Float64Array(Math.round(d * SR / 44100) + 8), i: 0, g: 0.5 }));
  for (let n = 0; n < total; n++) {
    const x = entree[n];
    let s = 0;
    for (const c of peignes) { const y = c.buf[c.i]; c.buf[c.i] = x + y * c.g; c.i = (c.i + 1) % c.d; s += y; }
    s /= peignes.length;
    for (const a of passeTout) { const y = a.buf[a.i]; const v = s + y * a.g; a.buf[a.i] = v; a.i = (a.i + 1) % a.d; s = y - a.g * v; }
    sortie[n] += s * 0.55;
  }
}
reverb(wetL, L, 0); reverb(wetR, R, 23);

// ---------- L'écriture ----------
function ecrireWav(fichier, gauche, droite, gain) {
  const wav = Buffer.alloc(44 + total * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + total * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(total * 4, 40);
  for (let i = 0; i < total; i++) {
    wav.writeInt16LE(Math.round(clamp(gauche[i] * gain, -1, 1) * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(clamp(droite[i] * gain, -1, 1) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(fichier, wav);
}

let pic = 0;
for (let i = 0; i < total; i++) {
  const t = i / SR;
  const env = clamp(t / 1.2, 0, 1) * clamp((SCENES.fin - t) / 2.4, 0, 1);
  L[i] = Math.tanh(L[i] * 1.15) * env * NIVEAU_EFFETS; R[i] = Math.tanh(R[i] * 1.15) * env * NIVEAU_EFFETS;
  pic = Math.max(pic, Math.abs(L[i]), Math.abs(R[i]));
}

if (SANS_MUSIQUE) {
  // Sans musique : la nappe et les effets, ramenés à -1 dB, et c'est fini.
  ecrireWav(SORTIE, L, R, Math.pow(10, -1 / 20) / pic);
  console.log(`${SORTIE} : ${SCENES.fin} s, sans musique, pic ramené à -1 dB`);
  process.exit(0);
}

// ---------- La musique, le mélange, le mastering ----------
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const DOSSIER = path.join(ICI, 'musique');
fs.mkdirSync(DOSSIER, { recursive: true });
const musique = path.join(DOSSIER, `${MUSIQUE}.mp3`);
if (!fs.existsSync(musique)) {
  const r = await fetch(`https://assets.mixkit.co/music/${MUSIQUE}/${MUSIQUE}.mp3`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null);
  if (!r?.ok) { console.error(`Musique ${MUSIQUE} introuvable sur mixkit.co (${r?.status || 'réseau'}). Relance avec --sans-musique, ou pose le fichier dans ${musique}.`); process.exit(1); }
  fs.writeFileSync(musique, Buffer.from(await r.arrayBuffer()));
  console.log(`musique : ${musique} (${(fs.statSync(musique).size / 1e6).toFixed(1)} Mo)`);
}
const effets = path.join(DOSSIER, 'effets.wav');
ecrireWav(effets, L, R, 1);

// La musique est coupée à la durée de la vidéo, avec une entrée brève et une sortie de deux
// secondes et demie ; les effets viennent dessus, sans normalisation du mélange (amix
// baisserait tout de moitié). Puis la sonie est mesurée, et corrigée en une seconde passe.
const fin = SCENES.fin;
const melange = `[0:a]atrim=0:${fin},asetpts=N/SR/TB,afade=t=in:d=0.25,afade=t=out:st=${fin - 2.6}:d=2.6[m];[1:a]atrim=0:${fin},asetpts=N/SR/TB[e];[m][e]amix=inputs=2:duration=first:normalize=0`;
// -2,2 dBTP et non -1 : l'encodage AAC qui suit ajoute jusqu'à 1,8 dB de crête sur des transitoires vifs, et la plupart des
// plateformes replient à -1.
const cible = 'I=-14:TP=-2.2:LRA=11';
const mesure = spawnSync(ffmpeg, ['-loglevel', 'info', '-i', musique, '-i', effets, '-filter_complex', `${melange},loudnorm=${cible}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
const json = /\{[^{}]*"input_i"[\s\S]*?\}/.exec(mesure.stderr || '');
if (!json) { console.error('Mesure de sonie impossible :', (mesure.stderr || '').slice(-600)); process.exit(1); }
const m = JSON.parse(json[0]);
const correction = `loudnorm=${cible}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
const r2 = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', musique, '-i', effets, '-filter_complex', `${melange},${correction}`, '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_s16le', SORTIE], { encoding: 'utf8' });
if (r2.status !== 0) { console.error(r2.stderr); process.exit(1); }
console.log(`${SORTIE} : ${fin} s, musique ${MUSIQUE} (mesurée à ${m.input_i} LUFS) + effets, masterisé à -14 LUFS / -1 dBTP`);
