// Sert une image hébergée par Orbite : /m/<id>
const { sql } = require('./_lib');

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) { res.statusCode = 404; return res.end(); }
  try {
    const r = await sql`select mime, encode(data, 'base64') as b64 from media where id = ${id}`;
    if (!r.length) { res.statusCode = 404; res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.end(); }
    res.statusCode = 200;
    res.setHeader('Content-Type', r[0].mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(Buffer.from(r[0].b64, 'base64'));
  } catch (e) {
    res.statusCode = 503; res.end();
  }
};
