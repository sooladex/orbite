// Plan du site généré depuis la base : l'accueil + toutes les pages publiques.
const SITE = (process.env.SITE_URL || 'https://orbite.sooladex.com').replace(/\/$/, '');
const SB_URL = 'https://wcmirrrcpiblcywjfjtl.supabase.co';
const SB_KEY = 'sb_publishable_DCAxCrnRVNXx5tr1APtiiA_DrMpblIP';

module.exports = async (req, res) => {
  let rows = [];
  try {
    const r = await fetch(`${SB_URL}/rest/v1/pages?select=slug,updated_at&order=updated_at.desc&limit=45000`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
    if (r.ok) rows = await r.json();
  } catch (e) {}
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const urls = [`<url><loc>${SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`]
    .concat(rows.map(p => `<url><loc>${x(SITE + '/' + p.slug)}</loc><lastmod>${x(new Date(p.updated_at).toISOString())}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
};
