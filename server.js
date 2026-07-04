const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = __dirname;
const dataDir = process.env.DATA_DIR || root;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'rooms.json');
const accountsFile = path.join(dataDir, 'accounts.json');
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const cloudEnabled = Boolean(supabaseUrl && supabaseKey);
let rooms = {};
let accounts = {};
try { rooms = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch {}
try { accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8')); } catch {}
const cloudHeaders = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' };
async function cloudRead(id) { const res = await fetch(`${supabaseUrl}/rest/v1/ontrack_state?id=eq.${encodeURIComponent(id)}&select=payload`, { headers: cloudHeaders }); if (!res.ok) throw new Error(`Supabase read failed (${res.status})`); const rows = await res.json(); return rows[0]?.payload || {}; }
async function cloudWrite(id, payload) { const res = await fetch(`${supabaseUrl}/rest/v1/ontrack_state`, { method:'POST', headers:{ ...cloudHeaders, Prefer:'resolution=merge-duplicates' }, body:JSON.stringify([{ id, payload, updated_at:new Date().toISOString() }]) }); if (!res.ok) throw new Error(`Supabase write failed (${res.status})`); }
async function loadStorage() { if (!cloudEnabled) return; [rooms, accounts] = await Promise.all([cloudRead('rooms'), cloudRead('accounts')]); console.log('Connected to Supabase persistent storage'); }
const save = () => { try { fs.writeFileSync(dbFile, JSON.stringify(rooms, null, 2)); } catch {} if (cloudEnabled) cloudWrite('rooms', rooms).catch(e => console.error(e.message)); };
const saveAccounts = () => { try { fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2)); } catch {} if (cloudEnabled) cloudWrite('accounts', accounts).catch(e => console.error(e.message)); };
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 20000) reject(new Error('too large')); }); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('bad json')); } }); });
const clean = (v, max = 40) => String(v || '').replace(/[^\w\s-]/g, '').trim().slice(0, max);
const hash = (password, salt) => crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
const makeToken = (u) => `${Buffer.from(u.username).toString('base64url')}.${crypto.createHmac('sha256',u.passwordHash).update(u.username).digest('base64url')}`;
const auth = (req) => { const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), [encoded,signature] = token.split('.'); if(!encoded||!signature) return null; let username=''; try{username=Buffer.from(encoded,'base64url').toString();}catch{return null;} const user=accounts[username]; if(!user) return null; const expected=makeToken(user).split('.')[1]; return signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))?user:null; };
const publicUser = (u) => ({ username:u.username, nickname:u.nickname, avatar:u.avatar || '', learning:u.learning || null });
const roomView = (code) => ({ code, members: Object.values(rooms[code]?.members || {}).filter(m => Date.now() - m.seen < 86400000).sort((a,b) => b.focusing - a.focusing || b.todayMinutes - a.todayMinutes) });

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/register') { const p = await body(req), username = clean(p.nickname,24).toLowerCase().replace(/\s+/g,'-'), nickname = clean(p.nickname,24), password = String(p.password||''), avatar = String(p.avatar||''); if (!nickname || password.length < 6) return json(res,400,{error:'Nickname and a 6+ character password are required.'}); if (accounts[username]) return json(res,409,{error:'That nickname is already taken.'}); if (avatar.length > 700000 || (avatar && !/^data:image\/(png|jpeg|webp);base64,/.test(avatar))) return json(res,400,{error:'Please use a smaller PNG, JPG, or WebP photo.'}); const salt=crypto.randomBytes(16).toString('hex'); accounts[username]={username,nickname,avatar,salt,passwordHash:hash(password,salt),created:Date.now(),learning:null}; saveAccounts(); return json(res,201,{token:makeToken(accounts[username]),user:publicUser(accounts[username])}); }
    if (req.method === 'POST' && req.url === '/api/login') { const p = await body(req), username=clean(p.nickname,24).toLowerCase().replace(/\s+/g,'-'), user=accounts[username]; if (!user || hash(String(p.password||''),user.salt)!==user.passwordHash) return json(res,401,{error:'Nickname or password is incorrect.'}); return json(res,200,{token:makeToken(user),user:publicUser(user)}); }
    if (req.method === 'GET' && req.url === '/api/me') { const user=auth(req); return user?json(res,200,{user:publicUser(user)}):json(res,401,{error:'Please sign in again.'}); }
    if (req.method === 'POST' && req.url === '/api/learning') { const user=auth(req); if(!user) return json(res,401,{error:'Please sign in again.'}); const p=await body(req), learning=p.learning||{}; user.learning={task:clean(learning.task,60),thoughts:Array.isArray(learning.thoughts)?learning.thoughts.slice(0,100):[],sessions:Array.isArray(learning.sessions)?learning.sessions.slice(-1000):[],grove:Array.isArray(learning.grove)?learning.grove.slice(-1000):[],savedAt:Date.now()}; saveAccounts(); return json(res,200,{saved:true}); }
    if (req.method === 'POST' && req.url === '/api/rooms') { const code = crypto.randomBytes(3).toString('hex').toUpperCase(); rooms[code] = { created: Date.now(), members: {} }; save(); return json(res, 201, { code }); }
    if (req.method === 'GET' && req.url === '/api/health') return json(res,200,{ok:true,storage:cloudEnabled?'supabase':'local'});
    if (req.method === 'POST' && req.url === '/api/join') { const p = await body(req), code = clean(p.code, 12).toUpperCase(), signed=auth(req), name = signed?.nickname || clean(p.name, 24); if (!code || !name) return json(res, 400, { error: 'Name and room code are required.' }); rooms[code] ||= { created: Date.now(), members: {} }; const id = signed?.username || clean(p.id, 40) || crypto.randomUUID(); rooms[code].members[id] = { ...(rooms[code].members[id] || {}), id, name, avatar:signed?.avatar||'', seen: Date.now(), focusing: false, task: '', todayMinutes: 0, sessions: 0, streak: 0 }; save(); return json(res, 200, { id, room: roomView(code) }); }
    if (req.method === 'POST' && req.url === '/api/status') { const p = await body(req), code = clean(p.code, 12).toUpperCase(), id = clean(p.id, 40); const member = rooms[code]?.members?.[id]; if (!member) return json(res, 404, { error: 'Join the circle first.' }); Object.assign(member, { name: clean(p.name,24)||member.name, focusing: !!p.focusing, task: clean(p.task,60), todayMinutes: Math.max(0,Number(p.todayMinutes)||0), sessions: Math.max(0,Number(p.sessions)||0), streak: Math.max(0,Number(p.streak)||0), seen: Date.now() }); save(); return json(res, 200, roomView(code)); }
    const match = req.url.match(/^\/api\/rooms\/([A-Za-z0-9_-]+)$/); if (req.method === 'GET' && match) return json(res, rooms[match[1].toUpperCase()] ? 200 : 404, rooms[match[1].toUpperCase()] ? roomView(match[1].toUpperCase()) : { error: 'Circle not found.' });
    const requestPath = decodeURIComponent(req.url.split('?')[0]);
    const urlPath = requestPath === '/' ? '/index.html' : requestPath;
    const file = path.normalize(path.join(root, urlPath)); if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml' }; fs.readFile(file, (err, bytes) => { if (err) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(bytes); });
  } catch (e) { json(res, 400, { error: e.message }); }
});
const port = process.env.PORT || 4174;
loadStorage().then(() => server.listen(port, '0.0.0.0', () => console.log(`On Track shared at http://localhost:${port} (${cloudEnabled?'Supabase':'local'} storage)`))).catch((error) => { console.error(`Could not start: ${error.message}`); process.exit(1); });
