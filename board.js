/* Events Available: the month board and PDF viewer, shared by the public page and the admin page. */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const today = new Date();
const thisKey = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
const todayIso = thisKey + '-' + String(today.getDate()).padStart(2,'0');
const $ = id => document.getElementById(id);
const PREF = 'eventsAvailable.tab';

// Shared state. The admin page sets manage/onEdit/pending.
const EA = { items: [], loaded: false, loadError: false, tab: 'upcoming', manage: false, onEdit: null, pending: [] };
try { if (localStorage.getItem(PREF) === 'past') EA.tab = 'past'; } catch(e){}
if (location.hash === '#past') EA.tab = 'past'; else if (location.hash === '#upcoming') EA.tab = 'upcoming';

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function prettyDate(isoStr, long){ const [y,m,d]=isoStr.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString(undefined, long?{weekday:'long',month:'long',day:'numeric',year:'numeric'}:{weekday:'short',month:'short',day:'numeric'}); }
function minutes(tm){ const x = /(\d{1,2}):(\d{2}) ([AP])M/.exec(tm||''); if(!x) return 9999; return (+x[1]%12 + (x[3]==='P'?12:0))*60 + +x[2]; }
function sessionsOf(it){
  if (Array.isArray(it.sessions)) return it.sessions;
  return it.date ? [{ date: it.date, times: it.time ? [it.time] : [], label: '' }] : [];
}
function kindOf(n){ return n >= 3 ? 'schedule' : n === 2 ? 'multi' : 'single'; }
function thumbSrc(it){ return it._thumbData || it.thumb || ''; }

async function loadPublicList(){
  try {
    const r = await fetch('flyers.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    EA.items = ((await r.json()) || {}).flyers || [];
  } catch(e){ EA.loadError = true; EA.items = []; }
  EA.loaded = true;
}

function renderBoard(){
  const board = $('board');
  if (!EA.loaded){ board.innerHTML = '<div class="empty"><p>Loading events…</p></div>'; return; }
  if (EA.loadError && !EA.items.length){ board.innerHTML = '<div class="empty"><h2>Events could not load</h2><p>Check your connection and reload the page.</p></div>'; return; }
  const m = EA.manage;
  const entries = [], undated = [];
  EA.items.forEach(it=>{
    const ss = sessionsOf(it);
    if (!ss.length){ if (m) undated.push({ it, s:null, i:0, n:0 }); return; }
    ss.forEach((s,i)=>entries.push({ it, s, i, n: ss.length }));
  });
  if (!entries.length && !undated.length && !EA.pending.length){
    board.innerHTML = m
      ? '<div class="empty"><h2>No flyers yet</h2><p>Click <b>Add PDFs</b> or drag PDF flyers onto this page. Each date on a flyer gets its own card under its month.</p><label class="btn primary" for="file">Add PDFs</label></div>'
      : '<div class="empty"><h2>No events posted yet</h2><p>Check back soon. New flyers show up here as soon as they are added.</p></div>';
    return;
  }
  const groups = {};
  entries.forEach(e=>{ const k = e.s.date.slice(0,7); (groups[k] = groups[k] || []).push(e); });
  const sortList = list => list.sort((a,b)=>a.s.date.localeCompare(b.s.date) || minutes((a.s.times||[])[0]) - minutes((b.s.times||[])[0]) || (a.it.name||'').localeCompare(b.it.name||''));
  const monthName = k => { const [y,mo] = k.split('-').map(Number); return MONTHS[mo-1]+' <span class="yr">'+y+'</span>'; };
  const countOf = n => n+(n===1?' event':' events');
  const upKeys = Object.keys(groups).filter(k=>k>thisKey).sort();
  const pastKeys = Object.keys(groups).filter(k=>k<thisKey).sort().reverse();
  const nUp = upKeys.reduce((a,k)=>a+groups[k].length, 0), nPast = pastKeys.reduce((a,k)=>a+groups[k].length, 0);

  // this month, always first
  const cur = sortList(groups[thisKey] || []);
  let html = '<section class="now" aria-labelledby="now-h"><div class="month-head"><span class="eyebrow-now">This month</span><h2 id="now-h">'+monthName(thisKey)+'</h2><span class="count">'+countOf(cur.length)+'</span></div>';
  if (cur.length) html += '<div class="grid">'+cur.map(cardHTML).join('')+'</div>';
  else {
    const next = upKeys.length ? sortList(groups[upKeys[0]])[0] : null;
    html += '<p class="now-empty">No events this month.'+(next ? ' Next up: <b>'+esc(prettyDate(next.s.date, true))+'</b>'+(next.s.label && next.n>1 ? ', '+esc(next.s.label) : '')+'. See the Upcoming tab below.' : '')+'</p>';
  }
  html += '</section>';

  // upcoming (soonest first) / past (most recent first)
  html += '<div class="tabs" role="tablist" aria-label="Other months">'+
    '<button class="tab" role="tab" type="button" data-tab="upcoming" aria-selected="'+(EA.tab==='upcoming')+'">Upcoming ('+nUp+')</button>'+
    '<button class="tab" role="tab" type="button" data-tab="past" aria-selected="'+(EA.tab==='past')+'">Past ('+nPast+')</button></div>';
  const keys = EA.tab === 'upcoming' ? upKeys : pastKeys;
  if (!keys.length) html += '<p class="tab-empty">'+(EA.tab==='upcoming' ? 'No events planned past this month yet.' : 'No past events yet.')+'</p>';
  for (const k of keys){
    const list = EA.tab === 'past' ? sortList(groups[k]).reverse() : sortList(groups[k]);
    html += '<section class="month'+(EA.tab==='past'?' past':'')+'"><div class="month-head"><h2>'+monthName(k)+'</h2><span class="count">'+countOf(list.length)+'</span></div><div class="grid">'+list.map(cardHTML).join('')+'</div></section>';
  }
  if (undated.length){
    html += '<section class="month"><div class="month-head"><h2>Date not found</h2><span class="count">Only you see these. Click one to set its date.</span></div><div class="grid">';
    undated.forEach(e=> html += cardHTML(e));
    html += '</div></section>';
  }
  if (EA.pending.length && m){
    html += '<section class="month"><div class="month-head"><h2>Adding…</h2><span class="count">'+EA.pending.length+' PDF'+(EA.pending.length>1?'s':'')+'</span></div><div class="grid">';
    EA.pending.forEach(p=> html += '<div class="card"><div class="thumb">Reading</div><div class="fname">'+esc(p)+'</div></div>');
    html += '</div></section>';
  }
  board.innerHTML = html;
}

function cardHTML(e){
  const { it, s, i, n } = e;
  const kind = kindOf(n);
  const src = thumbSrc(it);
  const img = src ? '<img alt="" loading="lazy" src="'+esc(src)+'" onerror="this.remove()">' : '';
  const tag = kind==='schedule' ? '<span class="tag">Schedule · '+(i+1)+' of '+n+'</span>' : kind==='multi' ? '<span class="tag">Date '+(i+1)+' of 2</span>' : '';
  const band = (kind!=='single' && s && s.label) ? '<span class="band">'+esc(s.label)+'</span>' : '';
  const date = s ? '<span class="mark">'+esc(prettyDate(s.date))+'</span>' : '<span class="mark none">Add a date</span>';
  const times = s && s.times && s.times.length ? '<span class="times">'+s.times.map(x=>'<span class="time">'+esc(x)+'</span>').join('')+'</span>' : '';
  const aria = (s && s.label && kind!=='single' ? s.label+', ' : '') + (it.name||'Flyer') + (s ? ', '+prettyDate(s.date,true) : '') + (s && s.times && s.times.length ? ', '+s.times.join(' and ') : '');
  const done = s && s.date.slice(0,7) === thisKey && s.date < todayIso;
  return '<button class="card'+(done?' done':'')+'" type="button" data-id="'+esc(it.id)+'" data-i="'+i+'" aria-label="'+esc(aria)+'"><div class="thumb'+(kind==='schedule'?' schedule':'')+'">PDF'+img+tag+band+'</div>'+date+times+'<span class="fname">'+esc(it.name||'')+'</span></button>';
}

$('board').addEventListener('click', e=>{
  const tb = e.target.closest('.tab[data-tab]');
  if (tb){ EA.tab = tb.dataset.tab; try{ localStorage.setItem(PREF, EA.tab); }catch(_){} renderBoard(); const again = document.querySelector('.tab[data-tab="'+EA.tab+'"]'); if (again) again.focus(); return; }
  const card = e.target.closest('.card[data-id]'); if (!card) return;
  const it = EA.items.find(i=>i.id===card.dataset.id); if (!it) return;
  if (EA.manage && EA.onEdit) EA.onEdit(it); else openViewer(it, +card.dataset.i || 0);
});

/* ---------- PDF viewer ---------- */
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let viewToken = 0;
async function openViewer(it, idx){
  const token = ++viewToken;
  const ss = sessionsOf(it), s = ss[idx] || ss[0];
  $('v-title').textContent = (s && s.label && ss.length > 1) ? s.label : (it.name || 'Flyer');
  $('v-meta').innerHTML = (s ? '<span class="mark">'+esc(prettyDate(s.date, true))+'</span>' : '') + (s && s.times && s.times.length ? '<span class="time">'+esc(s.times.join(' · '))+'</span>' : '') + ((s && s.label && ss.length > 1) ? '<span class="fname">from '+esc(it.name||'')+'</span>' : '');
  $('v-all').innerHTML = ss.length > 1 ? '<span>All dates on this flyer:</span>' + ss.map((x,i)=>'<span class="d'+(i===idx?' cur':'')+'">'+esc(prettyDate(x.date))+'</span>').join('') : '';
  $('v-newtab').href = it.pdf;
  $('v-body').innerHTML = '<div class="msg">Opening PDF…</div>';
  $('vOverlay').hidden = false; $('v-close').focus();
  try {
    if (!window.pdfjsLib) throw new Error('no reader');
    const data = it._pdfData ? it._pdfData.slice() : new Uint8Array(await (await fetchOk(it.pdf)).arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    if (token !== viewToken) return;
    $('v-body').innerHTML = '';
    const width = Math.min($('v-body').clientWidth - 32, 820);
    for (let p=1; p<=pdf.numPages; p++){
      if (token !== viewToken) return;
      const page = await pdf.getPage(p);
      const scale = (width / page.getViewport({ scale: 1 }).width) * (window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      c.setAttribute('aria-label', 'Page '+p);
      $('v-body').appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  } catch(e){
    if (token === viewToken) $('v-body').innerHTML = '<div class="msg">This PDF could not be shown here. Try “Open in new tab”.</div>';
  }
}
async function fetchOk(url){ const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r; }
function closeViewer(){ viewToken++; $('vOverlay').hidden = true; $('v-body').innerHTML = ''; }
$('v-close').addEventListener('click', closeViewer);
$('vOverlay').addEventListener('click', e=>{ if (e.target===$('vOverlay')) closeViewer(); });
document.addEventListener('keydown', e=>{ if (e.key==='Escape' && !$('vOverlay').hidden) closeViewer(); });
