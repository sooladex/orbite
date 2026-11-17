// API d'Orbite : comptes, pages, images, visites. Une seule route : POST /api/app?op=…
const crypto = require('crypto');
const L = require('./_lib');
const { sql, json } = L;

const MAX_IMG = 900 * 1024; // octets après décodage

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
  // Protection contre les requêtes envoyées depuis un autre site
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Origine refusée.' });
  if (!/application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'JSON attendu.' });

  const op = String((req.query && req.query.op) || '');
  const b = await body(req);

  try {
    switch (op) {
      case 'check-slug': {
        const s = String(b.slug || '').toLowerCase();
        const prob = L.slugProblem(s); if (prob) return json(res, 200, { free: false, problem: prob });
        const r = await sql`select 1 from pages where slug = ${s}`;
        return json(res, 200, { free: !r.length });
      }

      case 'signup':
      case 'login': {
        const email = String(b.email || '').trim().toLowerCase();
        const pw = String(b.password || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json(res, 400, { error: 'Cette adresse e-mail n’est pas valide.' });
        if (pw.length < 6 || pw.length > 200) return json(res, 400, { error: 'Le mot de passe doit faire au moins 6 caractères.' });
        if (op === 'signup') {
          const exists = await sql`select 1 from users where email = ${email}`;
          if (exists.length) return json(res, 409, { error: 'Un compte existe déjà avec cet e-mail. Connecte-toi.' });
          const id = crypto.randomUUID();
          await sql`insert into users (id, email, pass_hash) values (${id}, ${email}, ${L.hashPassword(pw)})`;
          await L.newSession(res, id);
          return json(res, 200, { user: { id, email } });
        }
        const r = await sql`select id, email, pass_hash from users where email = ${email}`;
        if (!r.length || !L.checkPassword(pw, r[0].pass_hash)) { await new Promise(x => setTimeout(x, 400)); return json(res, 401, { error: 'E-mail ou mot de passe incorrect.' }); }
        await L.newSession(res, r[0].id);
        return json(res, 200, { user: { id: r[0].id, email: r[0].email } });
      }

      case 'logout': {
        const t = L.readCookie(req, L.COOKIE);
        if (t) await sql`delete from sessions where token_hash = ${L.sha(t)}`;
        L.clearSession(res);
        return json(res, 200, { ok: true });
      }

      case 'view': {
        const s = String(b.slug || '').toLowerCase();
        if (L.SLUG_RE.test(s)) await sql`update pages set views = views + 1 where slug = ${s}`;
        return json(res, 200, { ok: true });
      }
    }

    // Tout ce qui suit demande d'être connecté
    const user = await L.currentUser(req);
    if (!user) return json(res, 401, { error: 'Connecte-toi pour continuer.' });

    switch (op) {
      case 'me': {
        const p = await sql`select slug, config, views from pages where user_id = ${user.id}`;
        return json(res, 200, { user, page: p[0] || null });
      }
      case 'claim': {
        const s = String(b.slug || '').toLowerCase();
        const prob = L.slugProblem(s); if (prob) return json(res, 400, { error: prob });
        const cfg = (b.config && typeof b.config === 'object') ? b.config : {};
        try {
          await sql`insert into pages (id, user_id, owner_email, slug, config) values (${crypto.randomUUID()}, ${user.id}, ${user.email}, ${s}, ${JSON.stringify(cfg)}::jsonb)`;
        } catch (e) {
          if (/user_id/.test(String(e.message))) return json(res, 409, { error: 'Tu as déjà une page.' });
          return json(res, 409, { error: 'Ce pseudo vient d’être pris. Essaie-en un autre.' });
        }
        return json(res, 200, { ok: true, slug: s });
      }
      case 'save': {
        const cfg = (b.config && typeof b.config === 'object') ? b.config : {};
        // « Mes sites » : 12 au maximum, adresses normalisées (elles servent de clé aux aperçus)
        if (Array.isArray(cfg.sites)) cfg.sites = cfg.sites.slice(0, 12).map(x => ({
          title: String((x && x.title) || '').slice(0, 60), url: L.cleanUrl(x && x.url), desc: String((x && x.desc) || '').slice(0, 120)
        }));
        const txt = JSON.stringify(cfg);
        if (txt.length > 60000) return json(res, 413, { error: 'Page trop lourde.' });
        const r = await sql`update pages set config = ${txt}::jsonb, updated_at = now() where user_id = ${user.id} returning slug`;
        return r.length ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Page introuvable.' });
      }
      case 'rename': {
        const s = String(b.slug || '').toLowerCase();
        const prob = L.slugProblem(s); if (prob) return json(res, 400, { error: prob });
        try { await sql`update pages set slug = ${s}, updated_at = now() where user_id = ${user.id}`; }
        catch (e) { return json(res, 409, { error: 'Ce pseudo est déjà pris.' }); }
        return json(res, 200, { ok: true, slug: s });
      }
      case 'delete': {
        await sql`delete from users where id = ${user.id}`; // supprime aussi page, images et sessions
        L.clearSession(res);
        return json(res, 200, { ok: true });
      }
      case 'upload': {
        const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
        if (!m) return json(res, 400, { error: 'Image illisible.' });
        if (m[2].length * 0.75 > MAX_IMG) return json(res, 413, { error: 'Image trop lourde.' });
        const n = await sql`select count(*)::int as n from media where user_id = ${user.id}`;
        if (n[0].n >= 60) return json(res, 429, { error: 'Limite de 60 images atteinte.' });
        const id = crypto.randomUUID();
        await sql`insert into media (id, user_id, mime, data) values (${id}, ${user.id}, ${'image/' + m[1]}, decode(${m[2]}, 'base64'))`;
        return json(res, 200, { url: '/m/' + id });
      }
    }
    return json(res, 404, { error: 'Action inconnue.' });
  } catch (e) {
    console.error('[orbite api]', op, e && e.message);
    return json(res, 500, { error: 'Le serveur a rencontré un problème. Réessaie dans un instant.' });
  }
};
