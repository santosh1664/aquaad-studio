import { timingSafeEqual, createHash } from 'node:crypto';

const PANELS = ['frontUp', 'frontLow', 'rightUp', 'rightLow', 'backUp', 'leftUp', 'leftLow', 'bFront', 'bRight', 'bLeft', 'bFrontUp', 'bFrontLow', 'bRightUp', 'bRightLow', 'bBackUp', 'bLeftUp', 'bLeftLow'];
const KINDS = ['advertise', 'partner', 'investor', 'general', 'distribute'];
const DETAIL_KEYS = {
  advertise: ['business_type', 'advertising', 'budget', 'timeline', 'delivery_city'],
  partner: ['business_type', 'products'],
  distribute: ['business_type', 'venue_type', 'address', 'daily_traffic', 'monthly_volume', 'event', 'loading_dock', 'why'],
  investor: [], general: [],
};
const PARTNER_TYPES = ['carton', 'water', 'print'];
async function getSettings() {
  await sql('CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value text NOT NULL)');
  const r = await sql("SELECT value FROM settings WHERE key = 'show_carton'");
  return { show_carton: r.length > 0 && r[0].value === 'true' };
}
const STATUSES = ['new', 'reviewed', 'done'];
const MAX_FILE = 3 * 1024 * 1024;
const MAX_TOTAL = 10 * 1024 * 1024;
const MAX_BODY = 16 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dbUrl = process.env.DATABASE_URL || '';
const dbHost = dbUrl ? new URL(dbUrl).hostname : '';

async function sql(query, params = []) {
  const res = await fetch(`https://${dbHost}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': dbUrl },
    body: JSON.stringify({ query, params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('db error: ' + (data.message || res.status));
  return data.rows || [];
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
const asJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function sameSecret(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

let failures = 0;
let failureWindowStart = Date.now();
async function isAdmin(request) {
  const secret = process.env.ADMIN_PASSWORD || '';
  if (!secret) return false;
  if (Date.now() - failureWindowStart > 15 * 60 * 1000) { failures = 0; failureWindowStart = Date.now(); }
  if (failures >= 20) return false;
  const auth = request.headers.get('authorization') || '';
  const ok = auth.startsWith('Bearer ') && sameSecret(auth.slice(7), secret);
  if (!ok) { failures++; await new Promise((r) => setTimeout(r, 600)); }
  return ok;
}

function sniff(buf, type) {
  if (type === 'image/png') return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (type === 'image/jpeg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'image/webp') return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

async function createEnquiry(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Request too large.' }, 413);
  let b;
  try { b = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (b.website) return json({ ok: true }); // honeypot: silently accept bots
  const kind = KINDS.includes(b.kind) ? b.kind : 'general';
  const name = clean(b.name, 120);
  const phone = clean(b.phone, 40);
  const email = clean(b.email, 200);
  const company = clean(b.company, 160);
  const message = clean(b.message, 4000);
  const partnerType = PARTNER_TYPES.includes(b.partnerType) ? b.partnerType : null;
  const details = {};
  const rawDetails = b.details && typeof b.details === 'object' ? b.details : {};
  for (const k of DETAIL_KEYS[kind]) {
    const v = rawDetails[k];
    if (typeof v === 'string' && v.trim()) details[k] = v.trim().slice(0, 600);
    else if (typeof v === 'boolean') details[k] = v;
  }
  if (!name) return json({ error: 'Please enter your name.' }, 400);
  if (!phone && !email) return json({ error: 'Please enter a phone number or an email address.' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please check your email address.' }, 400);
  if (phone && !/^[0-9+()\-\s]{6,40}$/.test(phone)) return json({ error: 'Please check your phone number.' }, 400);
  if (b.consent !== true) return json({ error: 'Please tick the consent box so we can contact you.' }, 400);
  const panels = Array.isArray(b.panels) ? [...new Set(b.panels.filter((p) => PANELS.includes(p)))] : [];
  const arts = Array.isArray(b.artworks) ? b.artworks : [];
  if (arts.length > PANELS.length + 1) return json({ error: 'Too many artwork files.' }, 400);
  if (arts.length && kind !== 'advertise') return json({ error: 'Artwork can only be sent with an advertising enquiry.' }, 400);
  let total = 0;
  const files = [];
  for (const a of arts) {
    const type = a && a.contentType;
    if (!a || !(PANELS.includes(a.panel) || a.panel === 'mockup') || !['image/png', 'image/jpeg', 'image/webp'].includes(type) || typeof a.data !== 'string') return json({ error: 'One of the artwork files is not valid.' }, 400);
    const buf = Buffer.from(a.data, 'base64');
    if (buf.length > MAX_FILE) return json({ error: 'Each artwork file must be 3 MB or smaller.' }, 413);
    total += buf.length;
    if (total > MAX_TOTAL) return json({ error: 'Artwork files are too large in total (10 MB limit).' }, 413);
    if (!sniff(buf, type)) return json({ error: 'One of the artwork files is not a real PNG, JPG or WEBP image.' }, 400);
    files.push({ panel: a.panel, filename: clean(a.filename, 160) || 'artwork', type, size: buf.length, data: a.data });
  }
  const panelLiteral = '{' + panels.map((p) => '"' + p + '"').join(',') + '}';
  const rows = await sql(
    'INSERT INTO enquiries (kind, name, phone, email, company, message, panels, partner_type, details, consent) VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8,$9::jsonb,true) RETURNING id',
    [kind, name, phone || null, email || null, company || null, message || null, panelLiteral, partnerType, JSON.stringify(details)],
  );
  const id = rows[0].id;
  for (const f of files) {
    await sql('INSERT INTO artworks (enquiry_id, panel, filename, content_type, size_bytes, data_b64) VALUES ($1,$2,$3,$4,$5,$6)', [id, f.panel, f.filename, f.type, f.size, f.data]);
  }
  return json({ ok: true, reference: id.slice(0, 8).toUpperCase() });
}

async function adminList(url) {
  const status = STATUSES.includes(url.status) ? url.status : '';
  const rows = await sql(
    `SELECT e.id, e.created_at, e.kind, e.name, e.phone, e.email, e.company, e.message, to_json(e.panels) AS panels, e.partner_type, to_json(e.details) AS details, e.status, e.admin_note,
      COALESCE((SELECT json_agg(json_build_object('id', a.id, 'panel', a.panel, 'filename', a.filename, 'content_type', a.content_type, 'size_bytes', a.size_bytes) ORDER BY a.panel) FROM artworks a WHERE a.enquiry_id = e.id), '[]'::json) AS artworks
     FROM enquiries e WHERE ($1::text = '' OR e.status = $1) ORDER BY e.created_at DESC LIMIT 200`,
    [status],
  );
  return rows.map((r) => ({ ...r, panels: asJson(r.panels) || [], details: asJson(r.details) || {}, artworks: asJson(r.artworks) || [] }));
}

const ADMIN_URL = 'https://santosh1664.github.io/aquaad-studio/admin/';

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (request.method === 'POST' && path === '/api/enquiry') return await createEnquiry(request);
    if (request.method === 'GET' && path === '/admin') return Response.redirect(ADMIN_URL, 302);
    if (request.method === 'GET' && path === '/api/settings') { const r = json(await getSettings()); r.headers.set('cache-control', 'no-store'); return r; }
    if (request.method === 'GET' && path === '/api/health') return json({ ok: true });
    if (path.startsWith('/api/admin/') && request.method === 'POST') {
      if (!(await isAdmin(request))) return json({ error: 'Unauthorized' }, 401);
      let b = {};
      try { b = JSON.parse((await request.text()) || '{}'); } catch { return json({ error: 'Invalid request.' }, 400); }
      if (path === '/api/admin/list') return json({ enquiries: await adminList(b) });
      if (path === '/api/admin/settings') {
        if (typeof b.show_carton === 'boolean') {
          await getSettings();
          await sql("INSERT INTO settings (key, value) VALUES ('show_carton', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [String(b.show_carton)]);
        }
        return json(await getSettings());
      }
      if (path === '/api/admin/artwork') {
        if (!UUID.test(b.id || '')) return json({ error: 'Bad id' }, 400);
        const r = await sql('SELECT content_type, data_b64 FROM artworks WHERE id = $1', [b.id]);
        if (!r.length) return json({ error: 'Not found' }, 404);
        return json({ content_type: r[0].content_type, data: r[0].data_b64 });
      }
      if (path === '/api/admin/update') {
        if (!UUID.test(b.id || '') || !STATUSES.includes(b.status)) return json({ error: 'Bad request' }, 400);
        await sql('UPDATE enquiries SET status = $2, admin_note = $3 WHERE id = $1', [b.id, b.status, clean(b.note, 2000) || null]);
        return json({ ok: true });
      }
      if (path === '/api/admin/delete') {
        if (!UUID.test(b.id || '')) return json({ error: 'Bad id' }, 400);
        await sql('DELETE FROM enquiries WHERE id = $1', [b.id]);
        return json({ ok: true });
      }
    }
    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('handler error', err && err.message);
    return json({ error: 'Something went wrong. Please try again or call us.' }, 500);
  }
}
