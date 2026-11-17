// Rendu serveur des pages publiques d'Orbite (/pseudo) :
// titre, description, aperçu social, données structurées et contenu lisible sans JavaScript.
const fs = require('fs');
const path = require('path');

const { sql, SITE, SLUG_RE, okImg, absImg, cleanUrl } = require('./_lib');

let TEMPLATE = null;
function template() {
  if (!TEMPLATE) TEMPLATE = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  return TEMPLATE;
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const jsonForScript = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
function safeUrl(u) {
  u = String(u || '').trim(); if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try { const p = new URL(u); return ['http:', 'https:', 'mailto:', 'tel:'].includes(p.protocol) ? p.href : ''; } catch (e) { return ''; }
}
const pretty = u => String(u || '').replace(/^https?:\/\//, '').replace(/^mailto:|^tel:/, '').replace(/\/$/, '');

function headFor({ title, desc, url, image, imageAlt, large, robots, jsonld, type }) {
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${robots}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Orbite">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta name="twitter:card" content="${large ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
${jsonld ? `<script type="application/ld+json">${jsonForScript(jsonld)}</script>` : ''}`;
}

function bodyFor(slug, c) {
  const name = clip(c.name || slug, 40);
  const links = (Array.isArray(c.links) ? c.links : []).slice(0, 40);
  const cover = okImg(c.cover), avatar = okImg(c.avatar);
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const items = links.map((l, i) => {
    const href = safeUrl(l && l.url); const t = clip(l && l.title, 60) || 'Sans titre'; const img = okImg(l && l.img);
    return `<a class="card" ${href ? `href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow ugc"` : 'role="link" aria-disabled="true"'} style="--d:${i + 4}"><span class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : esc((t[0] || '?').toUpperCase())}</span><span class="ct"><span class="t">${esc(t)}</span><span class="u mono">${esc(pretty(l && l.url))}</span></span><span class="arrow" aria-hidden="true">↗</span><span class="glare"></span></a>`;
  }).join('');
  const sites = (Array.isArray(c.sites) ? c.sites : []).slice(0, 12).map(x => ({ ...x, url: cleanUrl(x && x.url) })).filter(x => x.url);
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const siteCards = sites.map(x => { const h = host(x.url), n = clip(x.title, 60) || h;
    return `<a class="site" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer nofollow ugc"><div class="sframe"><div class="sbar"><i></i><i></i><i></i><u>${esc(h)}</u></div><div class="sshot"><span class="ph">${esc(n)}</span><img src="/api/shot?u=${encodeURIComponent(x.url)}" alt="Aperçu de ${esc(n)}" loading="lazy" class="ok"></div></div><div class="scap"><div class="ct"><span class="t">${esc(n)}</span>${x.desc ? `<span class="d">${esc(clip(x.desc, 120))}</span>` : ''}</div><span class="arrow" aria-hidden="true">↗</span></div></a>`; }).join('');
  const sitesBlock = `<section class="sites" id="sites" aria-label="Sites" style="--d:4"${sites.length ? '' : ' hidden'}>${sites.length ? `<div class="sites-h"><b>${esc(clip(c.sitesTitle, 40) || 'Mes sites')}</b><span>${sites.length} site${sites.length > 1 ? 's' : ''}</span></div><div class="sites-track${sites.length === 1 ? ' solo' : ''}">${siteCards}</div>` : ''}</section>`;
  return `<main class="wrap gutter${cover ? ' has-cover' : ''}" id="wrap">
  <div class="cover" id="cover"${cover ? '' : ' hidden'}><img id="coverImg" alt="Couverture de ${esc(name)}"${cover ? ` src="${esc(cover)}"` : ''}></div>
  <header class="profile">
    <div class="avatar" id="avatar" style="--d:0">${avatar ? `<img src="${esc(avatar)}" alt="Photo de ${esc(name)}">` : `<span>${esc(initials)}</span>`}</div>
    <h1 id="name" style="--d:1">${esc(name)}</h1>
    <p class="bio" id="bio" style="--d:2"${c.bio ? '' : ' hidden'}>${esc(clip(c.bio, 160))}</p>
    <p class="meta mono" style="--d:3"><i></i><span id="metaTxt">@${esc(slug)} · ${links.length} lien${links.length > 1 ? 's' : ''}</span></p>
  </header>
  ${sitesBlock}
  <nav class="links" id="links" aria-label="Liens de ${esc(name)}">${items || '<div class="empty">Aucun lien pour l’instant.</div>'}</nav>
  <div class="made"><a href="/" id="madeLink">✦ Crée ta propre Orbite</a></div>
</main>`;
}

module.exports = async (req, res) => {
  const raw = String((req.query && req.query.slug) || '').toLowerCase();
  const slug = raw.replace(/[^a-z0-9_-]/g, '');
  let html = template();
  let row = null, dbError = false;

  if (SLUG_RE.test(slug)) {
    try {
      const rows = await sql`select slug, config, user_id, updated_at from pages where slug = ${slug}`;
      row = rows[0] || null;
    } catch (e) { dbError = true; console.error('[orbite page]', e && e.message); }
  }

  const url = `${SITE}/${slug}`;
  let head;
  if (row) {
    const c = row.config || {};
    const name = clip(c.name || row.slug, 40);
    const bio = clip(c.bio, 160);
    const links = (Array.isArray(c.links) ? c.links : []);
    const titles = links.map(l => clip(l && l.title, 30)).filter(Boolean).slice(0, 4).join(', ');
    const desc = clip(bio ? `${bio} — Tous les liens de ${name} sur Orbite.` : `Tous les liens de ${name} (@${row.slug})${titles ? ' : ' + titles : ''}. Page Orbite.`, 158);
    const image = absImg(c.cover) || absImg(c.avatar) || `${SITE}/og.png`;
    const sameAs = links.map(l => safeUrl(l && l.url)).filter(u => /^https?:/.test(u)).slice(0, 20);
    head = headFor({
      title: `${name} (@${row.slug}) · Orbite`,
      desc, url, image, imageAlt: `Page de liens de ${name}`,
      large: !!okImg(c.cover) || image.endsWith('/og.png'),
      robots: 'index,follow,max-image-preview:large', type: 'profile',
      jsonld: {
        '@context': 'https://schema.org', '@type': 'ProfilePage', url, name: `${name} (@${row.slug})`,
        inLanguage: 'fr-FR', dateModified: row.updated_at,
        isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#site`, url: `${SITE}/`, name: 'Orbite' },
        mainEntity: { '@type': 'Person', name, alternateName: '@' + row.slug, url, description: bio || undefined, image: absImg(c.avatar) || undefined, sameAs: sameAs.length ? sameAs : undefined }
      }
    });
    html = html
      .replace(/<!--WRAP-->[\s\S]*?<!--\/WRAP-->/, bodyFor(row.slug, c))
      .replace('id="loading">', 'id="loading" hidden>')
      .replace('<script defer src="https://cdnjs', `<script>window.__PAGE__=${jsonForScript({ slug: row.slug, config: c })};</script>\n<script defer src="https://cdnjs`);
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  } else {
    head = headFor({
      title: SLUG_RE.test(slug) ? `@${slug} est libre · Orbite` : 'Page introuvable · Orbite',
      desc: 'Cette page Orbite n’existe pas encore. Réserve ce pseudo et crée ta page de liens en 3D, gratuitement.',
      url, image: `${SITE}/og.png`, imageAlt: 'Orbite, page de liens en 3D', large: true,
      robots: 'noindex,follow', type: 'website', jsonld: null
    });
    res.statusCode = dbError ? 503 : 404;
    res.setHeader('Cache-Control', dbError ? 'no-store' : 'public, s-maxage=30');
  }

  html = html.replace(/<!--SEO-->[\s\S]*?<!--\/SEO-->/, head);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
};
