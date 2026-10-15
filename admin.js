/* Events Available admin: unlock with a GitHub key, add and edit flyers, save them to the repository. */
const CFG_KEY = 'eventsAvailable.github';
const API = 'https://api.github.com';
let cfg = null, notes = [], busy = false;

/* ---------- notices ---------- */
function note(msg, kind){ notes.push({ msg, kind }); drawNotes(); }
function clearNotes(){ notes = []; drawNotes(); }
function drawNotes(){ $('notices').innerHTML = notes.map(n=>'<div class="notice'+(n.kind?' '+n.kind:'')+'">'+esc(n.msg)+'</div>').join(''); }

/* ---------- GitHub API ---------- */
function loadCfg(){ try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch(e){ return null; } }
function saveCfg(c){ try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); return true; } catch(e){ return false; } }
function repoPath(){ return '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo); }

async function gh(path, opts, c){
  c = c || cfg;
  opts = opts || {};
  const r = await fetch(API + path, Object.assign({}, opts, {
    headers: Object.assign({ 'Authorization': 'Bearer ' + c.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {}),
  }));
  if (!r.ok){ const e = new Error('GitHub ' + r.status); e.status = r.status; try { e.detail = (await r.json()).message; } catch(_){} throw e; }
  if (r.status === 204) return null;
  return (opts.raw ? r.text() : r.json());
}

function ghError(e){
  const s = e && e.status;
  if (s === 401) return 'Your access key no longer works (it may have expired). Click “Lock this device”, then unlock again with a new key.';
  if (s === 403 || s === 404) return 'GitHub refused the change. Make sure the key has Contents: Read and write access to this repository.';
  if (s === 409 || s === 422) return 'The site changed while you were saving. Reload this page and try again.';
  if (!s) return 'Could not reach GitHub. Check your connection and try again.';
  return 'GitHub returned an error (' + s + '). Try again in a moment.';
}

function bytesToB64(bytes){
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function textToB64(s){ return bytesToB64(new TextEncoder().encode(s)); }

async function fetchList(){
  try {
    const txt = await gh(repoPath() + '/contents/flyers.json?ref=' + encodeURIComponent(cfg.branch), { headers: { 'Accept': 'application/vnd.github.raw+json' }, raw: true });
    return (JSON.parse(txt) || {}).flyers || [];
  } catch(e){ if (e.status === 404) return []; throw e; }
}

// One commit with every changed file: [{ path, b64 } | { path, remove: true }]
async function commitFiles(files, message){
  const ref = await gh(repoPath() + '/git/ref/heads/' + encodeURIComponent(cfg.branch));
  const baseSha = ref.object.sha;
  const base = await gh(repoPath() + '/git/commits/' + baseSha);
  const tree = [];
  for (const f of files){
    if (f.remove){ tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue; }
    const blob = await gh(repoPath() + '/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.b64, encoding: 'base64' }) });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const t = await gh(repoPath() + '/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
  const c = await gh(repoPath() + '/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [baseSha] }) });
  await gh(repoPath() + '/git/refs/heads/' + encodeURIComponent(cfg.branch), { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
}

function listFile(list){
  const clean = list.map(it=>{ const o = {}; for (const k in it) if (k[0] !== '_') o[k] = it[k]; return o; });
  return { path: 'flyers.json', b64: textToB64(JSON.stringify({ flyers: clean }, null, 2) + '\n') };
}

// Re-reads the latest list from GitHub, applies the change, and saves it with any extra files in one commit.
async function saveChange(apply, extraFiles, message){
  busy = true; clearNotes(); note('Saving to GitHub…');
  try {
    const latest = await fetchList();
    const next = apply(latest);
    await commitFiles((extraFiles || []).concat([listFile(next)]), message);
    const local = new Map(EA.items.map(it=>[it.id, it]));
    EA.items = next.map(it=>{ const l = local.get(it.id); return l ? Object.assign({}, it, { _thumbData: l._thumbData, _pdfData: l._pdfData }) : it; });
    clearNotes(); note('Saved. The public page shows the change in about a minute.', 'ok');
    renderBoard();
    return true;
  } catch(e){
    clearNotes(); note(ghError(e), 'warn');
    return false;
  } finally { busy = false; }
}

/* ---------- unlock ---------- */
function guessRepo(){
  const host = location.hostname, parts = location.pathname.split('/').filter(Boolean);
  const m = /^([^.]+)\.github\.io$/i.exec(host);
  if (!m) return { owner: '', repo: '' };
  const first = parts[0] && !/\.html?$/i.test(parts[0]) ? parts[0] : '';
  return { owner: m[1], repo: first || (m[1] + '.github.io') };
}

function showSetup(){
  const g = guessRepo();
  $('cfg-owner').value = (cfg && cfg.owner) || g.owner;
  $('cfg-repo').value = (cfg && cfg.repo) || g.repo;
  $('cfg-token').value = '';
  $('setup').hidden = false; $('board').hidden = true; $('ownerbar').hidden = true; $('ownerActions').hidden = true;
  EA.manage = false;
}

$('cfg-save').addEventListener('click', async ()=>{
  const c = { owner: $('cfg-owner').value.trim(), repo: $('cfg-repo').value.trim(), token: $('cfg-token').value.trim() };
  $('cfg-err').textContent = '';
  if (!c.owner || !c.repo || !c.token){ $('cfg-err').textContent = 'Fill in all three fields.'; return; }
  $('cfg-save').disabled = true; $('cfg-save').textContent = 'Checking…';
  try {
    const info = await gh('/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo), {}, c);
    if (!info.permissions || !info.permissions.push){ $('cfg-err').textContent = 'This key can read the repository but cannot change it. Give it Contents: Read and write access.'; return; }
    c.branch = info.default_branch || 'main';
    if (!saveCfg(c)) $('cfg-err').textContent = 'This browser would not save the key, so you will need to unlock again next time.';
    cfg = c; startEditing();
  } catch(e){
    $('cfg-err').textContent = e.status === 401 ? 'GitHub did not accept this key. Copy it again and paste it in.'
      : e.status === 404 ? 'Repository not found, or this key has no access to it. Check the username and repository name, and that the key includes this repository.'
      : ghError(e);
  } finally { $('cfg-save').disabled = false; $('cfg-save').textContent = 'Unlock editing'; }
});

$('lockBtn').addEventListener('click', ()=>{
  try { localStorage.removeItem(CFG_KEY); } catch(e){}
  cfg = null; EA.items = []; clearNotes(); showSetup();
});

async function startEditing(){
  $('setup').hidden = true; $('board').hidden = false; $('ownerbar').hidden = false; $('ownerActions').hidden = false;
  $('ownerbarText').innerHTML = '<b>Editing unlocked on this device</b> for ' + esc(cfg.owner + '/' + cfg.repo) + '. Changes go live on the public page about a minute after you save.';
  EA.manage = true; EA.onEdit = openEditor; EA.loaded = false; renderBoard();
  try { EA.items = await fetchList(); EA.loaded = true; }
  catch(e){ EA.loaded = true; EA.loadError = true; note(ghError(e), 'warn'); }
  renderBoard();
}

/* ---------- adding PDFs ---------- */
async function pageLines(page){
  const tc = await page.getTextContent();
  const rows = [];
  for (const it of tc.items){
    if (!it.str || !it.str.trim()) continue;
    const y = it.transform[5], x = it.transform[4];
    let row = rows.find(r=>Math.abs(r.y - y) <= 3);
    if (!row){ row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str });
  }
  rows.sort((a,b)=>b.y - a.y);
  return rows.map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.s).join(' ').replace(/\s+/g,' ').trim()).join('\n');
}

async function readPdf(file){
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  let text = '';
  for (let p=1; p<=Math.min(pdf.numPages, 4); p++) text += await pageLines(await pdf.getPage(p)) + '\n';
  const page1 = await pdf.getPage(1);
  const scale = 440 / page1.getViewport({ scale: 1 }).width;
  const vp = page1.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
  await page1.render({ canvasContext: ctx, viewport: vp }).promise;
  const thumbData = c.toDataURL('image/jpeg', 0.75);
  return { bytes, thumbData, found: detectSessions(text, today), noText: text.trim().length < 5 };
}

function newId(){ return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function addFiles(fileList){
  if (!EA.manage || busy) return;
  const files = [...fileList].filter(f=>f.type==='application/pdf' || /\.pdf$/i.test(f.name));
  if (!files.length) return;
  if (!window.pdfjsLib){ note('The PDF reader did not load. Check your connection and reload the page.', 'warn'); return; }
  clearNotes();
  EA.pending = files.map(f=>f.name); renderBoard();
  const added = [], uploads = [];
  for (const f of files){
    if (f.size > 25 * 1024 * 1024){ note('"' + f.name + '" is over 25 MB. Save a smaller copy of the flyer and add that instead.', 'warn'); continue; }
    try {
      const r = await readPdf(f);
      const id = newId();
      const item = { id, name: f.name, pdf: id + '.pdf', thumb: id + '.jpg',
        sessions: r.found.sessions, extras: r.found.extras, noText: r.noText, added: new Date().toISOString(),
        _thumbData: r.thumbData, _pdfData: r.bytes };
      added.push(item);
      uploads.push({ path: item.pdf, b64: bytesToB64(r.bytes) }, { path: item.thumb, b64: r.thumbData.split(',')[1] });
    } catch(e){ note('Could not read "' + f.name + '". It may be password-protected or damaged.', 'warn'); }
  }
  EA.pending = []; renderBoard();
  if (!added.length) return;
  const warnings = notes.slice();
  const ok = await saveChange(list=>list.concat(added.map(a=>{ const o = Object.assign({}, a); delete o._thumbData; delete o._pdfData; return o; })),
    uploads, added.length === 1 ? 'Add flyer: ' + added[0].name : 'Add ' + added.length + ' flyers');
  if (ok){
    // keep local previews for cards that are not live yet
    added.forEach(a=>{ const it = EA.items.find(x=>x.id === a.id); if (it){ it._thumbData = a._thumbData; it._pdfData = a._pdfData; } });
    warnings.forEach(w=>notes.push(w)); drawNotes(); renderBoard();
  }
}

$('file').addEventListener('change', e=>{ addFiles(e.target.files); e.target.value=''; });
let dragDepth = 0;
window.addEventListener('dragenter', e=>{ if (EA.manage && [...(e.dataTransfer?.types||[])].includes('Files')){ dragDepth++; $('drop').hidden=false; } });
window.addEventListener('dragleave', ()=>{ dragDepth=Math.max(0,dragDepth-1); if(!dragDepth) $('drop').hidden=true; });
window.addEventListener('dragover', e=>e.preventDefault());
window.addEventListener('drop', e=>{ e.preventDefault(); dragDepth=0; $('drop').hidden=true; if (e.dataTransfer?.files) addFiles(e.dataTransfer.files); });

/* ---------- editor ---------- */
let editing = null, removeArmed = false, rows = [], rowSeq = 0;
function openEditor(it){
  editing = it; removeArmed = false; $('ed-remove').textContent = 'Remove flyer'; $('ed-err').textContent = '';
  const src = thumbSrc(it);
  $('ed-img').innerHTML = src ? '<img alt="First page of '+esc(it.name)+'" src="'+esc(src)+'">' : '';
  $('ed-title').textContent = it.name;
  const ss = sessionsOf(it);
  $('ed-found').textContent = it.noText ? 'No readable text in this PDF. It may be a scanned image, so add the dates by hand. Visitors will not see it until it has a date.'
    : ss.length ? 'Found '+ss.length+' date'+(ss.length>1?'s':'')+'. Checked dates show on the board. Untick any that are wrong, or fix the times and names.'
    : 'No event date found in the text. Add one by hand. Visitors will not see it until it has a date.';
  rows = ss.map(s=>Object.assign({ on:true, k:rowSeq++ }, s))
    .concat((it.extras||[]).map(s=>Object.assign({ on:false, k:rowSeq++ }, s)));
  if (!rows.length) rows.push({ on:true, date:'', times:[], label:'', k:rowSeq++ });
  drawRows();
  $('overlay').hidden = false;
  const first = $('srows').querySelector('input[type=date]'); if (first) first.focus();
}
function drawRows(){
  $('srows').innerHTML = rows.map((r,i)=>
    '<div class="srow'+(r.on?'':' off')+'" data-i="'+i+'">'+
      '<input type="checkbox" class="s-on" id="s-on-'+r.k+'" aria-label="Show this date on the board"'+(r.on?' checked':'')+'>'+
      '<input type="date" class="s-date" id="s-date-'+r.k+'" aria-label="Date" value="'+esc(r.date)+'">'+
      '<input type="text" class="s-times" id="s-times-'+r.k+'" aria-label="Times" placeholder="Times, e.g. 10:00 AM, 2:00 PM" value="'+esc((r.times||[]).join(', '))+'">'+
      '<input type="text" class="s-label" id="s-label-'+r.k+'" aria-label="Event name" placeholder="Event name (optional)" value="'+esc(r.label||'')+'">'+
      '<button type="button" class="btn small danger s-del">Delete</button>'+
      ((r.source || r.reason) ? '<div class="src">'+(r.reason==='deadline'?'<b>Looks like a deadline or posted date, so it is off.</b> ':'')+(r.source?'Found in: “'+esc(r.source)+'”':'')+'</div>' : '')+
    '</div>').join('');
}
function syncRows(){
  [...$('srows').children].forEach(el=>{
    const r = rows[+el.dataset.i];
    r.on = el.querySelector('.s-on').checked;
    r.date = el.querySelector('.s-date').value;
    r.times = el.querySelector('.s-times').value.split(/[,;]/).map(x=>x.trim()).filter(Boolean);
    r.label = el.querySelector('.s-label').value.trim();
  });
}
$('srows').addEventListener('change', e=>{ if (e.target.classList.contains('s-on')){ syncRows(); e.target.closest('.srow').classList.toggle('off', !e.target.checked); } });
$('srows').addEventListener('click', e=>{ if (!e.target.classList.contains('s-del')) return; syncRows(); rows.splice(+e.target.closest('.srow').dataset.i, 1); drawRows(); });
$('ed-add').addEventListener('click', ()=>{ syncRows(); rows.push({ on:true, date:'', times:[], label:'', k:rowSeq++ }); drawRows(); const d = $('srows').lastElementChild.querySelector('.s-date'); if (d) d.focus(); });

function closeEditor(){ $('overlay').hidden = true; editing = null; }
$('ed-save').addEventListener('click', async ()=>{
  if (!editing || busy) return;
  syncRows();
  const clean = r => ({ date: r.date, times: r.times, label: r.label, source: r.source || '' });
  const sessions = rows.filter(r=>r.on && r.date).map(clean).sort((a,b)=>a.date.localeCompare(b.date));
  const extras = rows.filter(r=>!r.on && r.date).map(r=>Object.assign(clean(r), { reason: r.reason || '' }));
  const id = editing.id, name = editing.name;
  $('ed-save').disabled = true; $('ed-save').textContent = 'Saving…';
  const ok = await saveChange(list=>list.map(it=>{ if (it.id !== id) return it; const c = Object.assign({}, it, { sessions, extras }); delete c.date; delete c.time; return c; }), [], 'Update dates: ' + name);
  $('ed-save').disabled = false; $('ed-save').textContent = 'Save';
  if (ok) closeEditor(); else $('ed-err').textContent = 'Not saved. See the message at the top of the page.';
});
$('ed-open').addEventListener('click', ()=>{ const it = editing; closeEditor(); openViewer(it, 0); });
$('ed-cancel').addEventListener('click', closeEditor);
$('ed-remove').addEventListener('click', async ()=>{
  if (!editing || busy) return;
  if (!removeArmed){ removeArmed = true; $('ed-remove').textContent = 'Click again to remove'; return; }
  const it = editing;
  $('ed-remove').disabled = true;
  const gone = [it.pdf, it.thumb].filter(p=>p && /^f[a-z0-9-]+\.(pdf|jpg)$/.test(p)).map(p=>({ path: p, remove: true }));
  let ok = await saveChange(list=>list.filter(x=>x.id !== it.id), gone, 'Remove flyer: ' + it.name);
  if (!ok && gone.length){ ok = await saveChange(list=>list.filter(x=>x.id !== it.id), [], 'Remove flyer: ' + it.name); }   // files may already be gone
  $('ed-remove').disabled = false;
  if (ok) closeEditor(); else $('ed-err').textContent = 'Not removed. See the message at the top of the page.';
});
$('overlay').addEventListener('click', e=>{ if (e.target===$('overlay')) closeEditor(); });
document.addEventListener('keydown', e=>{ if (e.key==='Escape' && $('vOverlay').hidden && !$('overlay').hidden) closeEditor(); });

/* ---------- start ---------- */
cfg = loadCfg();
if (cfg && cfg.token) startEditing(); else showSetup();
