// Pages publiques : /confidentialite et /conditions (P0-8).
//
// Elles doivent être lisibles sans compte, hors de Telegram et sans JavaScript : c'est à elles
// que renvoient BotFather et le site. Le serveur est donc lancé pour de vrai, comme en production,
// plutôt que d'interroger un Express monté pour le test — ce sont ses routes qu'on vérifie, et
// notamment qu'elles ne sont pas avalées par le « tout le reste » qui sert l'app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const { config } = await import('../server/config.js');

const portLibre = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

const PORT = await portLibre();
const APP_NAME = 'Odo-test-pages';
const serveur = spawn(process.execPath, ['server/index.js'], {
  stdio: 'ignore',
  env: {
    ...process.env,
    DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-pages-')),
    BOT_TOKEN: '123456:TEST_TOKEN',
    WEBAPP_URL: 'https://exemple.test',
    APP_NAME,
    SEED_DEMO: 'false',
    USE_WEBHOOK: 'false',
    NODE_ENV: 'development',
    ADMIN_CHAT_ID: '',
    DATABASE_URL: '',
    PORT: String(PORT),
  },
});
test.after(() => serveur.kill());

const base = `http://localhost:${PORT}`;
// Le démarrage lit les fichiers et les compresse : on attend qu'il réponde plutôt qu'un délai fixe.
for (let i = 0; i < 100; i += 1) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* pas encore prêt */ }
  await new Promise((r) => setTimeout(r, 100));
}

const page = async (chemin) => {
  const r = await fetch(base + chemin);
  return { status: r.status, type: r.headers.get('content-type') || '', html: await r.text() };
};

test('les deux pages répondent en HTML, sans compte ni Telegram', async () => {
  for (const chemin of ['/confidentialite', '/conditions']) {
    const p = await page(chemin);
    assert.equal(p.status, 200, chemin);
    assert.match(p.type, /text\/html/, chemin);
    // Aucun en-tête d'authentification n'a été envoyé : c'est tout l'intérêt de ces pages.
    assert.match(p.html, /<h1>/, `${chemin} sert bien un document`);
  }
});

test('le nom de l\'app est injecté, jamais le gabarit', async () => {
  for (const chemin of ['/confidentialite', '/conditions']) {
    const { html } = await page(chemin);
    assert.ok(!html.includes('__APP_NAME__'), `${chemin} ne doit pas montrer le gabarit du nom`);
    assert.ok(!html.includes('__ASSET_V__'), `${chemin} ne doit pas montrer le gabarit de l'empreinte`);
    assert.ok(html.includes(APP_NAME), `${chemin} porte le nom configuré`);
  }
  // Le nom n'est écrit en dur nulle part (règle 12) : le fichier source, lui, ne le contient pas.
  // Le nom interdit est lu dans .env.example, et pas recopié ici : ce test portait « Mbolo » en
  // dur, si bien qu'il aurait cessé de garder quoi que ce soit le jour du changement de nom —
  // il aurait laissé passer le nouveau nom écrit en clair, sans rien dire. Un garde-fou qui
  // nomme lui-même ce qu'il interdit meurt au premier renommage.
  const nomProduit = fs.readFileSync('.env.example', 'utf8').match(/^APP_NAME=(.+)$/m)?.[1].trim();
  assert.ok(nomProduit, '.env.example doit porter APP_NAME : c\'est de là que vient le nom interdit ici');
  for (const f of ['confidentialite.html', 'conditions.html']) {
    const source = fs.readFileSync(path.join('server', 'legal', f), 'utf8');
    assert.ok(!new RegExp(`\\b${nomProduit}\\b`).test(source), `${f} ne doit pas écrire le nom de l'app en dur`);
  }
});

test('les pages se renvoient l\'une à l\'autre et vers l\'app', async () => {
  const conf = await page('/confidentialite');
  const cond = await page('/conditions');
  assert.match(conf.html, /href="\/conditions"/);
  assert.match(cond.html, /href="\/confidentialite"/);
  assert.match(conf.html, /href="\/"/);
  assert.match(cond.html, /href="\/"/);
});

// Ces promesses ne sont pas de la prose : chacune correspond à un comportement du code, et
// CLAUDE.md interdit de les affaiblir. Si l'une disparaît de la page, c'est soit que la page ment,
// soit que le produit a changé sans qu'on le dise.
test('la politique de confidentialité dit ce que le code fait vraiment', async () => {
  const { html } = await page('/confidentialite');
  const dit = (motif, quoi) => assert.match(html, motif, `la page doit parler de : ${quoi}`);
  dit(/orientation sexuelle/i, "l'orientation n'est pas collectée");
  dit(/ethnique/i, "l'appartenance ethnique n'est pas collectée");
  dit(/jamais montré aux autres membres/i, 'le selfie reste privé');
  dit(/supprim/i, 'la suppression du compte');
  dit(/GPS/, "la position GPS n'est pas demandée");
  dit(/2024\/017/, 'la loi camerounaise applicable');
  dit(/18 ans/, "l'exclusion des mineurs");
  // Les délais annoncés doivent être ceux appliqués, sinon la page promet une chose et le
  // serveur en fait une autre. On ne se contente pas d'en trouver un juste : la page en porte
  // plusieurs, il suffirait d'en oublier un pour qu'elle mente sans que rien ne le dise. Chaque
  // durée citée doit donc valoir l'un des délais que le serveur applique vraiment — et chacun
  // de ces délais doit être cité au moins une fois, sinon la page tait ce qu'elle doit dire.
  const EN_LETTRES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
  const formes = (n) => [String(n), EN_LETTRES[n]].filter(Boolean);
  // « le nombre de jours qu'il a duré » n'annonce aucune durée : le mot qui précède « jours »
  // n'est pas toujours un nombre. On ne laisse passer que ça — tout ce qui ressemble à un
  // nombre, en chiffres ou en lettres, doit correspondre à un délai réellement appliqué.
  const NOMBRES = new Set([...EN_LETTRES, 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
    'vingt', 'vingts', 'trente', 'quarante', 'cinquante', 'soixante', 'cent', 'cents', 'mille']);
  const estUnNombre = (mot) => /^\d+$/.test(mot) || NOMBRES.has(mot.toLowerCase());
  const delais = {
    'suppression du selfie': Math.round(config.verificationTtlMs / 86400e3),
    'conservation des événements de mesure': config.eventsRetentionDays,
  };
  const attendues = new Set(Object.values(delais).flatMap(formes));
  const citees = [...html.matchAll(/([\wÀ-ÿ]+)\s+jours/g)].map((m) => m[1]).filter(estUnNombre);
  assert.ok(citees.length > 0, 'la page doit annoncer les délais appliqués');
  for (const c of citees) {
    assert.ok(attendues.has(c), `la page annonce « ${c} jours », qui ne correspond à aucun délai appliqué : ${JSON.stringify(delais)}`);
  }
  for (const [quoi, n] of Object.entries(delais)) {
    assert.ok(formes(n).some((f) => citees.includes(f)), `la page ne dit nulle part le délai de ${quoi} (${n} jours)`);
  }
});

test('les conditions disent les règles qui font bannir', async () => {
  const { html } = await page('/conditions');
  for (const [motif, quoi] of [[/18 ans/, "l'âge minimum"], [/argent/i, "l'interdiction de l'argent"],
    [/chantage/i, 'le chantage'], [/lieux publics/i, 'les lieux publics'], [/bloquer/i, 'le blocage']]) {
    assert.match(html, motif, `les conditions doivent parler de : ${quoi}`);
  }
});

// Une page servie en fichier statique montrerait le gabarit au lieu du nom : elles vivent donc
// hors de public/. Ce test fige la raison, pas seulement l'emplacement.
// La politique de sécurité de contenu n'autorise aucun script en ligne : toute l'interface passe
// par innerHTML, et le jour où un champ échappe à esc(), un script injecté ne doit rien pouvoir
// exécuter ni envoyer (audit/09-revue-code.md, I8). Un « onload » en ligne ou un <script> sans src
// serait bloqué par le navigateur, donc c'est ici qu'on refuse qu'ils reviennent.
test("la politique de sécurité de contenu est complète, et rien n'est en ligne", async () => {
  const r = await fetch(`${base}/`);
  const csp = r.headers.get('content-security-policy') || '';
  for (const regle of ["default-src 'self'", "script-src 'self' https://telegram.org", "connect-src 'self'", "base-uri 'none'", 'frame-ancestors']) {
    assert.ok(csp.includes(regle), `la CSP doit porter « ${regle} » : ${csp}`);
  }
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'aucun script en ligne');
  for (const chemin of ['/', '/confidentialite', '/conditions', '/moderation']) {
    const html = await (await fetch(base + chemin)).text();
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), `${chemin} : un <script> sans src`);
    assert.ok(!/\son[a-z]+=["']/.test(html), `${chemin} : un gestionnaire en ligne (onload, onclick…)`);
    assert.equal((await fetch(base + chemin)).headers.get('content-security-policy'), csp, `${chemin} porte la même politique`);
  }
  // Le script du schéma clair/sombre est bien servi à part.
  assert.equal((await fetch(`${base}/scheme.js`)).status, 200);
});

test('les pages ne sont pas servies aussi en fichiers bruts', async () => {
  for (const chemin of ['/legal/confidentialite.html', '/confidentialite.html']) {
    const { html } = await page(chemin);
    assert.ok(!html.includes('__APP_NAME__'), `${chemin} ne doit jamais montrer un gabarit`);
  }
});

// La page ne décrit pas un produit en général : elle décrit ce que **ce serveur** fait. Sous la
// politique par défaut, il n'apparie que femme et homme et ne demande à personne quel genre il
// cherche ; sous une politique levée, il le demande, et ce choix indique l'orientation. Une page
// qui garderait « nous ne collectons aucune donnée d'orientation » dans le second cas mentirait
// — dans un document que la loi 2024/017 rend opposable. Les deux versions vivent donc dans le
// fichier, entre marqueurs, et on vérifie ici que la bonne part, entière, et que l'autre ne
// laisse aucune trace.
test('la page dit la vérité de la politique sous laquelle le serveur tourne', async () => {
  const port = await portLibre();
  const ouvert = spawn(process.execPath, ['server/index.js'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-pages-ouvert-')),
      BOT_TOKEN: '123456:TEST_TOKEN', WEBAPP_URL: 'https://exemple.test', APP_NAME,
      SEED_DEMO: 'false', USE_WEBHOOK: 'false', NODE_ENV: 'development',
      ADMIN_CHAT_ID: '', DATABASE_URL: '', PORT: String(port), MATCH_POLICY: 'open',
    },
  });
  try {
    let html = '';
    for (let i = 0; i < 60 && !html; i++) {
      await new Promise((r) => setTimeout(r, 200));
      html = await fetch(`http://127.0.0.1:${port}/confidentialite`).then((r) => r.text()).catch(() => '');
    }
    assert.ok(html, 'le serveur doit répondre');

    // Ce que la page doit dire quand le choix existe.
    assert.match(html, /ce choix indique ton orientation sexuelle/i,
      "la page doit dire ce que le choix révèle, au lieu de le présenter comme un réglage anodin");
    assert.match(html, /genre des personnes que tu veux voir/i, 'et le compter parmi les données gardées');
    assert.match(html, /jamais montré aux autres membres/i, 'et dire qui le voit');

    // Et surtout, ce qu'elle ne doit plus dire.
    assert.ok(!/aucune donnée d'orientation sexuelle/i.test(html),
      "sous cette politique, la promesse serait fausse : c'est elle qu'on vient de lever");

    // Les marqueurs sont un mécanisme, pas du texte : rien ne doit en arriver au navigateur.
    assert.ok(!/SI_GENRE/.test(html), 'aucun marqueur ne doit fuir dans la page');

    // Les promesses qui ne dépendent pas de la politique tiennent toujours.
    for (const motif of [/ethnique/i, /jamais montré aux autres membres/i, /GPS/, /2024\/017/, /18 ans/]) {
      assert.match(html, motif, `cette promesse ne dépend pas de la politique : ${motif}`);
    }
  } finally {
    ouvert.kill();
  }
});

// Même mécanique, pour la vérification. Sous « gate », les conditions promettent qu'on ne voit
// personne tant qu'un humain n'a pas tranché ; sous « badge », cette phrase est fausse — on entre
// avec un profil, et le selfie vérifié donne un bouclier. Un document opposable qui garderait la
// promesse d'origine décrirait un autre produit que celui qui tourne.
test('les conditions disent la vérité de la politique de vérification', async () => {
  const lire = async (politique) => {
    const port = await portLibre();
    const proc = spawn(process.execPath, ['server/index.js'], {
      stdio: 'ignore',
      env: {
        ...process.env,
        DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), `rencontres-pages-verif-${politique}-`)),
        BOT_TOKEN: '123456:TEST_TOKEN', WEBAPP_URL: 'https://exemple.test', APP_NAME,
        SEED_DEMO: 'false', USE_WEBHOOK: 'false', NODE_ENV: 'development',
        ADMIN_CHAT_ID: '', DATABASE_URL: '', PORT: String(port), VERIFICATION_POLICY: politique,
      },
    });
    try {
      let html = '';
      for (let i = 0; i < 60 && !html; i++) {
        await new Promise((r) => setTimeout(r, 200));
        html = await fetch(`http://127.0.0.1:${port}/conditions`).then((r) => r.text()).catch(() => '');
      }
      assert.ok(html, `le serveur doit répondre (${politique})`);
      return html;
    } finally {
      proc.kill();
    }
  };

  const porte = await lire('gate');
  assert.match(porte, /tu ne vois personne et personne ne te voit/i, 'la porte, telle qu\'elle est promise par défaut');
  assert.ok(!/bouclier/i.test(porte), 'et pas un mot du badge, qui n\'existe pas sous cette politique');

  const badge = await lire('badge');
  assert.ok(!/tu ne vois personne et personne ne te voit/i.test(badge), 'sous « badge », cette promesse serait fausse');
  assert.match(badge, /sans être vérifié/i, 'la page doit dire ce qu\'on peut faire sans le badge');
  assert.match(badge, /proposer un rendez-vous/i, 'et ce qu\'il faut le badge pour faire');

  for (const html of [porte, badge]) {
    assert.ok(!/SI_VERIF/.test(html), 'aucun marqueur ne doit fuir dans la page');
    assert.ok(!/SI_GENRE/.test(html), 'ni ceux de l\'autre politique');
    assert.match(html, /18 ans/, 'les promesses qui ne dépendent pas de la politique tiennent toujours');
  }
});
