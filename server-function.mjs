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

const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>WaterOnUs Admin</title>
<style>
:root{--ink:#0F172A;--sec:#334155;--mut:#475569;--line:#E2E8F0;--acc:#0369A1;--acc-d:#075985;--bg:#F8FAFC;--sky:#E0F2FE}
[hidden]{display:none!important}*{box-sizing:border-box}body{margin:0;font:16px/1.55 'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased}
header{background:#fff;border-bottom:1px solid var(--line);padding:0 24px;min-height:68px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;position:sticky;top:0;z-index:5}
header strong{font-size:22px;font-weight:800;letter-spacing:-.03em}header strong b{color:var(--acc)}header strong small{font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--mut);margin-left:10px}
main{max-width:1000px;margin:0 auto;padding:28px 16px 64px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;margin:0 0 16px;box-shadow:0 1px 2px rgba(15,23,42,.05),0 8px 24px rgba(15,23,42,.05)}
button,select,input,textarea{font:inherit;color:inherit}button{min-height:44px;padding:0 18px;border-radius:12px;border:1.5px solid var(--line);background:#fff;color:var(--ink);font-weight:700;cursor:pointer;transition:background-color .18s,border-color .18s}button:hover{border-color:#94A3B8}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
button.p{background:var(--acc);border-color:var(--acc);color:#fff}button.p:hover{background:var(--acc-d);border-color:var(--acc-d)}button.d{border-color:#FCA5A5;color:#B42318}button.d:hover{background:#FEF2F2}
input,select,textarea{border:1.5px solid #CBD5E1;border-radius:10px;padding:10px 12px;min-height:44px;width:100%;background:#fff}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.tag{display:inline-block;padding:3px 12px;border-radius:999px;background:var(--sky);color:var(--acc-d);font-size:13px;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-top:12px}
.grid figure{margin:0;border:1px solid var(--line);border-radius:12px;padding:8px;background:var(--bg)}.grid img{width:100%;height:140px;object-fit:contain;background:#fff;border-radius:8px}
.mut{color:var(--mut);font-size:14px}h3{margin:0 0 6px;letter-spacing:-.02em}.err{color:#B42318;font-weight:600}
</style></head><body>
<header><strong>Water<b>OnUs</b><small>Admin</small></strong><span class="row" id="tools" hidden><select id="filter" aria-label="Filter by status" style="width:auto"><option value="">All</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="done">Done</option></select><button id="refresh">Refresh</button><button id="logout">Log out</button></span></header>
<main><div id="login" class="card"><h3>Admin login</h3><p class="mut">Enter the admin password.</p><form id="lf" class="row"><label style="flex:1 1 240px">Password<input id="pw" type="password" autocomplete="current-password" required></label><button class="p" type="submit">Log in</button></form><p id="lerr" class="err" role="alert"></p></div><div id="settings" class="card" hidden><h3>Website 3D model</h3><p class="mut">The 500 ml bottle is always shown. Turn this on to also show the gable-top carton model on the website.</p><label class="row" style="gap:8px"><input id="showCarton" type="checkbox" style="width:auto"> <span>Show the carton model on the website</span></label><p id="setMsg" class="mut" role="status"></p></div><div id="list" hidden></div></main>
<script>
const $=(i)=>document.getElementById(i);let pw=sessionStorage.getItem('aq_admin')||'';
const KIND={advertise:'Advertising',partner:'Manufacturing partner',distribute:'Distributor',investor:'Investor',general:'General'};
const DL={business_type:'Business type',advertising:'Advertising',budget:'Budget',timeline:'Timeline',delivery_city:'Delivery city',products:'Products',venue_type:'Venue type',address:'Address',daily_traffic:'Daily foot traffic',monthly_volume:'Monthly cartons',event:'For an event',loading_dock:'Loading dock',why:'Why'};
const PN={mockup:'Mockup preview',frontUp:'Front upper',frontLow:'Front lower',rightUp:'Right upper',rightLow:'Right lower',backUp:'Back upper',leftUp:'Left upper',leftLow:'Left lower',bFront:'Bottle front (whole side)',bRight:'Bottle right (whole side)',bLeft:'Bottle left (whole side)',bFrontUp:'Bottle front upper',bFrontLow:'Bottle front lower',bRightUp:'Bottle right upper',bRightLow:'Bottle right lower',bBackUp:'Bottle back upper',bLeftUp:'Bottle left upper',bLeftLow:'Bottle left lower'};
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+pw},body:JSON.stringify(body||{})});if(r.status===401)throw new Error('401');if(!r.ok)throw new Error('Request failed');return r.json()}
function el(t,props,...kids){const e=document.createElement(t);Object.assign(e,props||{});for(const k of kids)e.append(k);return e}
async function load(){try{const d=await api('/api/admin/list',{status:$('filter').value});$('login').hidden=true;$('tools').hidden=false;$('list').hidden=false;$('settings').hidden=false;loadSettings();render(d.enquiries)}catch(e){if(e.message==='401'){sessionStorage.removeItem('aq_admin');pw='';$('login').hidden=false;$('tools').hidden=true;$('list').hidden=true;$('settings').hidden=true;}else{$('list').hidden=false;$('list').replaceChildren(el('p',{className:'err',textContent:'Could not load enquiries.'}))}}}
async function loadSettings(){try{const s=await api('/api/admin/settings',{});$('showCarton').checked=!!s.show_carton}catch{}}
$('showCarton').onchange=async()=>{$('setMsg').textContent='Saving…';try{const s=await api('/api/admin/settings',{show_carton:$('showCarton').checked});$('showCarton').checked=!!s.show_carton;$('setMsg').textContent=s.show_carton?'Carton model is now visible on the website.':'Carton model is now hidden.'}catch{$('setMsg').textContent='Could not save.';loadSettings()}};
function render(items){const root=$('list');root.replaceChildren();if(!items.length){root.append(el('div',{className:'card'},el('p',{className:'mut',textContent:'No enquiries yet.'})));return}
for(const q of items){const c=el('div',{className:'card'});
c.append(el('div',{className:'row'},el('span',{className:'tag',textContent:KIND[q.kind]||q.kind}),el('span',{className:'tag',textContent:q.status}),el('span',{className:'mut',textContent:new Date(String(q.created_at).replace(' ','T')).toLocaleString()+'  ·  Ref '+q.id.slice(0,8).toUpperCase()})));
c.append(el('h3',{textContent:q.name+(q.company?' — '+q.company:'')}));
const contact=[];if(q.phone){contact.push(el('a',{href:'tel:'+q.phone.replace(/[^0-9+]/g,''),textContent:q.phone}))}if(q.email){contact.push(el('a',{href:'mailto:'+q.email,textContent:q.email}))}
const cp=el('p',{className:'mut'});contact.forEach((a,i)=>{if(i)cp.append('  ·  ');cp.append(a)});c.append(cp);
if(q.partner_type)c.append(el('p',{className:'mut',textContent:'Partner type: '+q.partner_type}));
if(q.panels.length)c.append(el('p',{textContent:'Panels: '+q.panels.map((p)=>PN[p]||p).join(', ')}));
for(const k of Object.keys(q.details||{})){c.append(el('p',{className:'mut',style:'margin:2px 0',textContent:(DL[k]||k)+': '+(q.details[k]===true?'Yes':q.details[k]===false?'No':q.details[k])}))}
if(q.message)c.append(el('p',{style:'white-space:pre-wrap',textContent:q.message}));
if(q.artworks.length){const g=el('div',{className:'grid'});c.append(el('p',{className:'mut',textContent:q.artworks.length+' artwork file(s)'}),g);
for(const a of q.artworks){const f=el('figure');const cap=el('figcaption',{className:'mut',textContent:(PN[a.panel]||a.panel)+' · '+Math.round(a.size_bytes/1024)+' KB'});const img=el('img',{alt:'Artwork for '+(PN[a.panel]||a.panel)});f.append(img,cap);g.append(f);
api('/api/admin/artwork',{id:a.id}).then((d)=>{const bin=atob(d.data);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);const url=URL.createObjectURL(new Blob([u8],{type:d.content_type}));img.src=url;const dl=el('a',{href:url,download:a.filename,textContent:'Download'});cap.append('  ',dl)}).catch(()=>{cap.textContent+=' (failed to load)'})}}
const st=el('select',{ariaLabel:'Status'});for(const s of ['new','reviewed','done'])st.append(el('option',{value:s,textContent:s,selected:s===q.status}));
const note=el('textarea',{rows:2,placeholder:'Admin note (private)',value:q.admin_note||''});
const save=el('button',{className:'p',textContent:'Save'});const del=el('button',{className:'d',textContent:'Delete'});
save.onclick=async()=>{save.textContent='Saving…';try{await api('/api/admin/update',{id:q.id,status:st.value,note:note.value});save.textContent='Saved'}catch{save.textContent='Failed'}setTimeout(()=>{save.textContent='Save'},1500)};
del.onclick=async()=>{if(!confirm('Delete this enquiry and its artwork permanently?'))return;try{await api('/api/admin/delete',{id:q.id});load()}catch{del.textContent='Failed'}};
c.append(el('div',{className:'row',style:'margin-top:12px'},st,del,save),el('div',{style:'margin-top:10px'},note));root.append(c)}}
$('lf').onsubmit=(e)=>{e.preventDefault();pw=$('pw').value;$('lerr').textContent='';api('/api/admin/list',{}).then(()=>{sessionStorage.setItem('aq_admin',pw);$('pw').value='';load()}).catch(()=>{pw='';$('lerr').textContent='Wrong password.'})};
$('logout').onclick=()=>{sessionStorage.removeItem('aq_admin');pw='';$('list').hidden=true;$('settings').hidden=true;$('tools').hidden=true;$('login').hidden=false};
$('refresh').onclick=load;$('filter').onchange=load;if(pw)load();
</script></body></html>`;

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (request.method === 'POST' && path === '/api/enquiry') return await createEnquiry(request);
    if (request.method === 'GET' && path === '/admin') return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob:; connect-src 'self'; form-action 'self'" } });
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
