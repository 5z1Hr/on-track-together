const $ = (s) => document.querySelector(s);
const storeKey = 'onTrack.v1';
const today = () => new Date().toISOString().slice(0, 10);
let data = JSON.parse(localStorage.getItem(storeKey) || 'null') || { task: 'Finish the thing that matters', thoughts: [], sessions: [] };
data.sessions ||= []; data.thoughts ||= []; data.grove ||= [];
data.species ||= 'oak';
const species = { oak:{emoji:'🌳',name:'Oak'}, pine:{emoji:'🌲',name:'Pine'}, cherry:{emoji:'🌸',name:'Cherry blossom'}, sunflower:{emoji:'🌻',name:'Sunflower'}, tulip:{emoji:'🌷',name:'Tulip'}, cactus:{emoji:'🌵',name:'Cactus'} };
let selected = 25, remaining = selected * 60, running = false, tick = null, endAt = 0, sound = true;
let pipWindow = null;
let circle = JSON.parse(localStorage.getItem('onTrack.circle') || 'null');
let circlePoll = null;
let account = JSON.parse(localStorage.getItem('onTrack.account') || 'null'), authMode = 'login', avatarData = '', cloudTimer = null;
const save = () => { localStorage.setItem(storeKey, JSON.stringify(data)); clearTimeout(cloudTimer); if (account?.token) cloudTimer = setTimeout(saveCloud, 500); };
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const escapeHtml = (s) => s.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

function renderTimer() {
  remaining = Math.max(0, remaining);
  $('#timer').textContent = fmt(remaining);
  const pct = (1 - remaining / (selected * 60)) * 100;
  $('#railFill').style.width = pct + '%'; $('#train').style.left = pct + '%';
  const stage = pct === 0 ? 0 : pct < 25 ? 1 : pct < 60 ? 2 : pct < 90 ? 3 : 4;
  $('#plantStage').dataset.stage = stage;
  $('#speciesArt').textContent = species[data.species]?.emoji || '🌳';
  $('#growthLabel').textContent = ['A seed is waiting', 'Roots are taking hold', 'A small thing is growing', 'Nearly in bloom', 'Fully grown'][stage];
  document.title = `${fmt(remaining)} — ${data.task}`;
  updatePip(stage);
}

function renderThoughts() {
  const box = $('#thoughts'); box.innerHTML = ''; $('#thoughtCount').textContent = data.thoughts.length;
  if (!data.thoughts.length) { box.innerHTML = '<div class="empty-state"><span>⌁</span><p>Stray thoughts go here.<br>They’ll still exist when you’re done.</p></div>'; return; }
  data.thoughts.forEach((t, i) => { const row = document.createElement('div'); row.className = 'thought'; row.innerHTML = `<p>${escapeHtml(t.text)}</p><time>${t.time}</time><button aria-label="Remove thought">×</button>`; row.querySelector('button').onclick = () => { data.thoughts.splice(i, 1); save(); renderThoughts(); }; box.append(row); });
}

function renderGrove() {
  const grove = $('#grove'); grove.innerHTML = '';
  $('#forestCount').textContent = data.grove.filter((p) => !p.withered).length;
  if (!data.grove.length) { grove.innerHTML = '<div class="grove-empty">Finish your first track to plant something here.</div>'; return; }
  data.grove.slice().reverse().slice(0, 18).forEach((p) => { const plant = document.createElement('div'); plant.className = 'grove-tree' + (p.withered ? ' withered' : ''); plant.title = `${p.task} · ${species[p.species]?.name || 'Oak'}`; plant.innerHTML = `<div class="mini-tree">${p.withered ? '🥀' : (species[p.species]?.emoji || '🌳')}</div><b class="mini-mins">${p.minutes}m</b><span>${p.date.slice(5)}</span>`; grove.append(plant); });
}

function renderStats() {
  const sessions = data.sessions, todays = sessions.filter((s) => s.date === today());
  $('#todayMinutes').textContent = todays.reduce((a, s) => a + s.minutes, 0); $('#sessionCount').textContent = sessions.length;
  const dates = [...new Set(sessions.map((s) => s.date))].sort().reverse(); let streak = 0, d = new Date();
  for (let i = 0; i < 365; i++) { const key = d.toISOString().slice(0, 10); if (dates.includes(key)) streak++; else if (i > 0 || !dates.length) break; d.setDate(d.getDate() - 1); }
  $('#streak').textContent = streak; const bars = $('#weekBars'); bars.innerHTML = ''; let total = 0;
  for (let i = 6; i >= 0; i--) { const day = new Date(); day.setDate(day.getDate() - i); const key = day.toISOString().slice(0, 10), mins = sessions.filter((s) => s.date === key).reduce((a, s) => a + s.minutes, 0); total += mins; const b = document.createElement('div'); b.className = 'bar' + (i === 0 ? ' today' : ''); b.style.height = Math.max(5, Math.min(48, mins / 2)) + 'px'; b.innerHTML = `<span>${day.toLocaleDateString([], { weekday: 'narrow' })}</span>`; bars.append(b); }
  $('#weekTotal').textContent = total + ' MIN'; renderGrove();
}

function setRunning(v) { running = v; $('#startText').textContent = v ? 'PAUSE' : 'START FOCUS'; $('#startIcon').textContent = v ? 'Ⅱ' : '▶'; $('#statusText').textContent = v ? 'growing something' : 'ready when you are'; $('#timerCaption').textContent = v ? 'STAY HERE. LET IT GROW.' : 'PLANT YOUR INTENTION. PROTECT YOUR TIME.'; document.body.classList.toggle('running', v); syncCircle(); }
function start() { if (running) { clearInterval(tick); setRunning(false); return; } $('#plantStage').classList.remove('withered'); endAt = Date.now() + remaining * 1000; setRunning(true); tick = setInterval(() => { remaining = Math.ceil((endAt - Date.now()) / 1000); renderTimer(); if (remaining <= 0) complete(); }, 250); }
function complete() { clearInterval(tick); setRunning(false); const plant = { date: today(), minutes: selected, task: data.task, species:data.species, at: Date.now(), withered: false }; data.sessions.push(plant); data.grove.push(plant); save(); renderStats(); syncCircle(); chime(); showToast(`Your ${species[data.species].name.toLowerCase()} is fully grown — it joined the grove.`); remaining = selected * 60; renderTimer(); }
function reset() { const hadGrowth = remaining < selected * 60 && remaining > 0; clearInterval(tick); setRunning(false); if (hadGrowth) { const elapsed = Math.max(1, Math.round((selected * 60 - remaining) / 60)); data.grove.push({ date: today(), minutes: elapsed, task: data.task, species:data.species, at: Date.now(), withered: true }); save(); $('#plantStage').classList.add('withered'); renderGrove(); showToast('This plant withered. The next seed is ready.'); setTimeout(() => $('#plantStage').classList.remove('withered'), 1600); } remaining = selected * 60; renderTimer(); }
function chime() { if (!sound) return; const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 660; g.gain.setValueAtTime(.12, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .8); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + .8); }
function showToast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); }

function updatePip(stage) { if (!pipWindow || pipWindow.closed) return; const q=(s)=>pipWindow.document.querySelector(s); q('.pip-plant').textContent=species[data.species]?.emoji||'🌳'; q('.pip-plant').style.transform=`scale(${[.08,.3,.55,.78,1][stage]})`; q('.pip-time').textContent=fmt(remaining); q('.pip-task').textContent=data.task; q('.pip-state').textContent=running?'GROWING NOW':'READY TO GROW'; q('.pip-toggle').textContent=running?'PAUSE':'FOCUS'; }
async function openMiniGarden(){
  if (!('documentPictureInPicture' in window)) return showToast('Floating garden needs a current version of Chrome.');
  if (pipWindow && !pipWindow.closed) return pipWindow.focus();
  pipWindow=await documentPictureInPicture.requestWindow({width:320,height:390});
  pipWindow.document.head.innerHTML=`<title>Mini Garden</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f1e8;color:#17231c;font-family:ui-monospace,SFMono-Regular,monospace;display:grid;place-items:center;height:100vh}.mini{width:100%;height:100%;text-align:center;padding:18px;background:radial-gradient(#c9cabf 1px,transparent 1px);background-size:18px 18px}.pip-top{display:flex;justify-content:space-between;font-size:9px;letter-spacing:.12em}.pip-state{color:#58702a}.pip-task{font:600 16px system-ui;margin:18px 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.garden{height:150px;background:linear-gradient(#dff2d5 0 72%,#d8d0b7 72%);border:1px solid #17231c;display:grid;place-items:end center;overflow:hidden}.pip-plant{font-size:92px;line-height:1;transform-origin:center bottom;transition:transform .8s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 7px 0 rgba(23,35,28,.12))}.pip-time{font-size:48px;letter-spacing:-.08em;margin:12px 0}.pip-toggle{border:0;background:#17231c;color:#f3f1e8;padding:11px 26px;font:10px inherit;box-shadow:4px 4px 0 #c9f545;cursor:pointer}</style>`;
  pipWindow.document.body.innerHTML='<div class="mini"><div class="pip-top"><b>↗ ON TRACK</b><span class="pip-state"></span></div><div class="pip-task"></div><div class="garden"><div class="pip-plant"></div></div><div class="pip-time"></div><button class="pip-toggle"></button></div>';
  pipWindow.document.querySelector('.pip-toggle').onclick=start;
  pipWindow.addEventListener('pagehide',()=>pipWindow=null);
  renderTimer();
}

async function api(url, options = {}) {
  options.headers = { ...(options.headers || {}), ...(account?.token ? { Authorization: `Bearer ${account.token}` } : {}) };
  const res = await fetch(url, options);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    const sharedUrl = location.hostname === 'localhost' ? 'http://localhost:4174/' : '';
    throw new Error(sharedUrl ? `Accounts need the shared app. Open ${sharedUrl}` : 'This preview has no account server. Open the deployed shared app.');
  }
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || 'Could not connect.');
  return payload;
}
async function saveCloud() { if (!account?.token) return; try { await api('/api/learning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({learning:data})}); } catch { showToast('Cloud save paused — your local copy is safe.'); } }
function showAccount(user) { account.user = user; localStorage.setItem('onTrack.account',JSON.stringify(account)); $('#accountName').textContent=user.nickname; const avatar=$('#accountAvatar'); avatar.textContent=user.avatar?'':user.nickname.slice(0,1).toUpperCase(); avatar.style.backgroundImage=user.avatar?`url(${user.avatar})`:''; $('#displayName').value=user.nickname; }
function closeGate(){ $('#accountGate').classList.add('hidden'); }
async function applyLogin(result) { account={token:result.token,user:result.user}; showAccount(result.user); if(result.user.learning){ data={...data,...result.user.learning}; data.sessions||=[];data.thoughts||=[];data.grove||=[];localStorage.setItem(storeKey,JSON.stringify(data));$('#taskInput').value=data.task;renderTimer();renderThoughts();renderStats(); } else saveCloud(); closeGate(); showToast(`Welcome back, ${result.user.nickname}.`); }
function myPattern() { const todays = data.sessions.filter((s) => s.date === today()); const dates = [...new Set(data.sessions.map((s) => s.date))].sort().reverse(); let streak = 0, d = new Date(); for (let i = 0; i < 365; i++) { if (dates.includes(d.toISOString().slice(0,10))) streak++; else if (i > 0 || !dates.length) break; d.setDate(d.getDate()-1); } return { todayMinutes: todays.reduce((a,s)=>a+s.minutes,0), sessions: data.sessions.length, streak }; }
function renderFriends(room) { const box = $('#friends'); box.innerHTML = ''; room.members.forEach((m) => { const row = document.createElement('div'); row.className = 'friend'; const status = m.focusing ? `<span class="focus-pill"></span>FOCUSING · ${escapeHtml(m.task || 'quietly')}` : `RESTING · ${m.sessions} TOTAL SESSIONS`; const photo=m.avatar?` photo" style="background-image:url('${m.avatar}')`:'"'; row.innerHTML = `<div class="friend-avatar${photo}">${m.avatar?'':escapeHtml(m.name.slice(0,1).toUpperCase())}</div><div><strong>${escapeHtml(m.name)}</strong><small>${status}</small></div><div class="friend-stats"><b>${m.todayMinutes}m</b><span>TODAY · ${m.streak}🔥</span></div>`; box.append(row); }); }
async function syncCircle() { if (!circle) return; const pattern = myPattern(); try { const room = await api('/api/status', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...circle, ...pattern, focusing:running, task:data.task }) }); $('#circleLive').textContent = `${room.members.length} ONLINE`; $('#circleLive').classList.add('on'); renderFriends(room); } catch { $('#circleLive').textContent = 'RECONNECTING'; $('#circleLive').classList.remove('on'); } }
async function joinCircle(name, code) { const joined = await api('/api/join', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, code, id:circle?.id }) }); circle = { id:joined.id, name, code:joined.room.code }; localStorage.setItem('onTrack.circle', JSON.stringify(circle)); $('#joinForm').hidden = true; $('#circleRoom').hidden = false; $('#activeRoom').textContent = circle.code; renderFriends(joined.room); clearInterval(circlePoll); circlePoll = setInterval(syncCircle, 5000); syncCircle(); }

$('#startBtn').onclick = start; $('#resetBtn').onclick = reset; $('#editTask').onclick = () => { $('#taskInput').focus(); $('#taskInput').select(); };
$('#taskInput').value = data.task; $('#taskInput').onchange = (e) => { data.task = e.target.value.trim() || 'Untitled focus'; e.target.value = data.task; save(); renderTimer(); };
$('#presets').onclick = (e) => { if (!e.target.dataset.min) return; if (running || remaining < selected * 60) reset(); selected = +e.target.dataset.min; $('#presets .active')?.classList.remove('active'); e.target.classList.add('active'); $('#finishLabel').textContent = selected + ' MIN · TREE'; remaining = selected * 60; renderTimer(); };
$('#thoughtForm').onsubmit = (e) => { e.preventDefault(); const input = $('#thoughtInput'), text = input.value.trim(); if (!text) return; data.thoughts.unshift({ text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }); input.value = ''; save(); renderThoughts(); showToast('Thought parked. Back to growing.'); };
$('#soundBtn').onclick = () => { sound = !sound; $('#soundBtn').textContent = sound ? '♪' : '×'; showToast(sound ? 'Sound on' : 'Sound off'); };
$('#seedPicker').onclick=(e)=>{const key=e.target.dataset.species;if(!key)return;if(running||remaining<selected*60)return showToast('Finish this plant before changing seeds.');data.species=key;$('#seedPicker .active')?.classList.remove('active');e.target.classList.add('active');save();renderTimer();showToast(`${species[key].name} selected.`);};
$('#floatBtn').onclick=openMiniGarden;
document.querySelectorAll('[data-auth]').forEach((btn)=>btn.onclick=()=>{ authMode=btn.dataset.auth; document.querySelectorAll('[data-auth]').forEach(b=>b.classList.toggle('active',b===btn)); $('.account-card').classList.toggle('registering',authMode==='register'); $('#authSubmit').textContent=authMode==='register'?'CREATE MY ACCOUNT':'SIGN IN'; $('#authNote').textContent=authMode==='register'?'Your grove will be backed up to this account.':'New here? Choose “Create account.”'; });
$('#avatarInput').onchange=(e)=>{const file=e.target.files[0];if(!file)return;if(file.size>500000){showToast('Please choose a photo under 500 KB.');return;}const reader=new FileReader();reader.onload=()=>{avatarData=reader.result;$('#avatarPreview').textContent='';$('#avatarPreview').style.backgroundImage=`url(${avatarData})`;};reader.readAsDataURL(file);};
$('#authForm').onsubmit=async(e)=>{e.preventDefault();try{const result=await api(`/api/${authMode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:$('#authName').value.trim(),password:$('#authPassword').value,avatar:authMode==='register'?avatarData:''})});await applyLogin(result);}catch(err){$('#authNote').textContent=err.message;}};
$('#localOnly').onclick=closeGate;$('#accountBtn').onclick=()=>$('#accountGate').classList.remove('hidden');
$('#joinForm').onsubmit = async (e) => { e.preventDefault(); try { await joinCircle($('#displayName').value.trim(), $('#roomCode').value.trim().toUpperCase()); } catch (err) { showToast(err.message); } };
$('#createRoom').onclick = async () => { const name = $('#displayName').value.trim(); if (!name) { $('#displayName').focus(); return showToast('Add your name first.'); } try { const made = await api('/api/rooms', {method:'POST'}); $('#roomCode').value = made.code; await joinCircle(name, made.code); } catch (err) { showToast(err.message); } };
$('#copyInvite').onclick = async () => { const link = `${location.origin}/?room=${circle.code}`; try { await navigator.clipboard.writeText(link); showToast('Invite link copied.'); } catch { showToast(`Circle code: ${circle.code}`); } };
addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#thoughtInput').focus(); } });
const inviteCode = new URLSearchParams(location.search).get('room'); if (inviteCode) $('#roomCode').value = inviteCode.toUpperCase();
if(account?.token){api('/api/me').then(r=>{showAccount(r.user);closeGate();if(r.user.learning){data={...data,...r.user.learning};$('#taskInput').value=data.task;renderTimer();renderThoughts();renderStats();}}).catch(()=>{account=null;localStorage.removeItem('onTrack.account');});}
if (circle) { $('#displayName').value = circle.name; $('#roomCode').value = circle.code; joinCircle(circle.name, circle.code).catch(() => { circle = null; localStorage.removeItem('onTrack.circle'); }); }
document.querySelectorAll('#seedPicker button').forEach(b=>b.classList.toggle('active',b.dataset.species===data.species));
renderTimer(); renderThoughts(); renderStats();
