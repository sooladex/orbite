// Aperçu (capture d'écran) d'un site ajouté dans « Mes sites » : GET /api/shot?u=<adresse>
// La capture est faite par Microlink (repli : thum.io), puis gardée en base 7 jours
// pour ne pas refaire la capture à chaque visite.
const { sql, currentUser, cleanUrl } = require('./_lib');

const FRESH_MS = 7 * 24 * 3600 * 1000;
const MAX_BYTES = 3 * 1024 * 1024;
let tableReady = null;

function ensureTable() {
  if (!tableReady) tableReady = sql`create table if not exists shots (url text primary key, mime text not null, data bytea not null, fetched_at timestamptz not null default now())`
    .catch(e => { tableReady = null; throw e; });
  return tableReady;
}

async function grab(src, headers) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 22000);
  try {
    const r = await fetch(src, { headers: headers || {}, redirect: 'follow', signal: ctl.signal });
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2000 || buf.length > MAX_BYTES) return null;
    return { mime: type, buf };
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function capture(url) {
  const key = process.env.MICROLINK_API_KEY;
  const q = new URLSearchParams({
    url, screenshot: 'true', meta: 'false', embed: 'screenshot.url',
    'screenshot.type': 'jpeg', 'viewport.width': '1280', 'viewport.height': '800', waitForTimeout: '2500'
  });
  return (await grab(`https://${key ? 'pro' : 'api'}.microlink.io/?${q}`, key ? { 'x-api-key': key } : null))
      || (await grab(`https://image.thum.io/get/width/1280/crop/800/noanimate/${url}`));
}

function send(res, mime, buf, cache) {
  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', cache);
  res.end(buf);
}

module.exports = async (req, res) => {
  const url = cleanUrl(req.query && req.query.u);
  if (!url) { res.statusCode = 400; return res.end(); }
  try {
    await ensureTable();
    const row = (await sql`select mime, encode(data, 'base64') as b64, fetched_at from shots where url = ${url}`)[0];
    const fresh = row && (Date.now() - new Date(row.fetched_at).getTime() < FRESH_MS);
    if (fresh) return send(res, row.mime, Buffer.from(row.b64, 'base64'), 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');

    // Pas de capture pour n'importe quelle adresse : seulement les sites présents sur une page Orbite,
    // ou demandés par quelqu'un de connecté (aperçu immédiat dans l'éditeur).
    const listed = (await sql`select 1 from pages where config->'sites' @> ${JSON.stringify([{ url }])}::jsonb limit 1`).length > 0;
    if (!listed && !(await currentUser(req))) { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); return res.end(); }

    const shot = await capture(url);
    if (shot) {
      await sql`insert into shots (url, mime, data, fetched_at) values (${url}, ${shot.mime}, decode(${shot.buf.toString('base64')}, 'base64'), now())
                on conflict (url) do update set mime = excluded.mime, data = excluded.data, fetched_at = now()`;
      return send(res, shot.mime, shot.buf, 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    }
    if (row) return send(res, row.mime, Buffer.from(row.b64, 'base64'), 'public, max-age=600, s-maxage=3600');
    res.statusCode = 502; res.setHeader('Cache-Control', 'no-store'); return res.end();
  } catch (e) {
    console.error('[orbite shot]', e && e.message);
    res.statusCode = 503; res.setHeader('Cache-Control', 'no-store'); return res.end();
  }
};
