
/* ---------- date + session detection ---------- */
const MONTH_IDX = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const WD_IDX = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WD = '(?:((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)\\.?,?\\s+)?';
const ORD = '(?:st|nd|rd|th)?';

function pad(n){ return String(n).padStart(2,'0'); }
function iso(y,m,d){ return y+'-'+pad(m+1)+'-'+pad(d); }
function valid(y,m,d){ const t=new Date(y,m,d); return m>=0&&m<12&&t.getFullYear()===y&&t.getMonth()===m&&t.getDate()===d; }

function fmtTime(h,mi,ap){ return (+h)+':'+(mi||'00')+' '+ap.toUpperCase()+'M'; }
function findTimes(zone){
  const found = [];
  const tr = /\b(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s?m\.?)?\s*(?:[-–—]|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?(?![a-z])/gi;
  let x;
  while ((x = tr.exec(zone))){
    if (+x[1]>12 || +x[4]>12) continue;
    found.push({ s:x.index, e:x.index+x[0].length, txt: fmtTime(x[1],x[2],x[3]||x[6])+' – '+fmtTime(x[4],x[5],x[6]) });
  }
  const ts = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?(?![a-z])|\bnoon\b/gi;
  while ((x = ts.exec(zone))){
    const s = x.index, e = s + x[0].length;
    if (found.some(f=>s<f.e && e>f.s)) continue;
    if (x[1] && +x[1]>12) continue;
    found.push({ s, e, txt: x[1] ? fmtTime(x[1],x[2],x[3]) : '12:00 PM' });
  }
  found.sort((a,b)=>a.s-b.s);
  return found;
}

function detectSessions(text, today){
  today = today || new Date();
  const t = text.replace(/[ \t ]+/g,' ').replace(/ ?\n ?/g,'\n');
  const yc = {}; (t.match(/\b20[2-4]\d\b/g)||[]).forEach(y=>yc[y]=(yc[y]||0)+1);
  const docYear = Object.keys(yc).sort((a,b)=>yc[b]-yc[a])[0];

  function pickYear(m,d,wd){
    if (wd!=null){
      const base = docYear?+docYear:today.getFullYear();
      for (const y of [base, base+1, base-1, base+2]) if (valid(y,m,d) && new Date(y,m,d).getDay()===wd) return y;
    }
    if (docYear) return +docYear;
    let y = today.getFullYear();
    if (new Date(y,m,d) < new Date(today.getFullYear(), today.getMonth(), today.getDate()-60)) y++;
    return y;
  }
  const wdNum = s => s ? WD_IDX[s.toLowerCase().slice(0,3)] : null;
  const fixYear = s => { if(!s) return null; s=+s; return s<100?2000+s:s; };

  const cands = [];
  const add = (start,end,y,m,d)=>{
    if (!valid(y,m,d)) return;
    if (cands.some(c=>start<c.end && end>c.start)) return;
    cands.push({start,end,text:t.slice(start,end).trim(),iso:iso(y,m,d)});
  };
  let r, mm;
  r = new RegExp('\\b'+WD+MON+'\\.? ?(\\d{1,2})'+ORD+'\\b(?: ?[-–—] ?\\d{1,2}'+ORD+'\\b)?(?:,? (\\d{4}))?','gi');
  while ((mm=r.exec(t))){ const m=MONTH_IDX[mm[2].toLowerCase().slice(0,3)], d=+mm[3];
    add(mm.index, mm.index+mm[0].length, mm[4]?+mm[4]:pickYear(m,d,wdNum(mm[1])), m, d); }
  r = new RegExp('\\b'+WD+'(\\d{1,2})'+ORD+' (?:of )?'+MON+'\\b\\.?(?:,? (\\d{4}))?','gi');
  while ((mm=r.exec(t))){ const m=MONTH_IDX[mm[3].toLowerCase().slice(0,3)], d=+mm[2];
    add(mm.index, mm.index+mm[0].length, mm[4]?+mm[4]:pickYear(m,d,wdNum(mm[1])), m, d); }
  r = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  while ((mm=r.exec(t))) add(mm.index, mm.index+mm[0].length, +mm[1], +mm[2]-1, +mm[3]);
  r = new RegExp('\\b'+WD+'(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?\\b','gi');
  while ((mm=r.exec(t))){ const m=+mm[2]-1, d=+mm[3];
    add(mm.index, mm.index+mm[0].length, fixYear(mm[4]) ?? pickYear(m,d,wdNum(mm[1])), m, d); }
  r = /\b(\d{1,2})[.-](\d{1,2})[.-](\d{4}|\d{2})\b/g;
  while ((mm=r.exec(t))) add(mm.index, mm.index+mm[0].length, fixYear(mm[3]), +mm[1]-1, +mm[2]);
  cands.sort((a,b)=>a.start-b.start);

  const SKIP_BEFORE = /\b(rsvp|register|registration|deadline|due|apply|applications?|sign[- ]?ups?|by|before|until|closes?|updated|posted|revised|printed|effective)\b[^a-z0-9\n]*$/i;
  const SKIP_AFTER = /^[^a-z0-9\n]{0,4}(deadline|due)\b/i;
  const tidy = s => s.replace(/\s+/g,' ').replace(/^[\s\-–—|:,;•·@.\/()]+|[\s\-–—|:,;•·@\/(]+$/g,'').replace(/^(at|from|on)\s+/i,'').replace(/\s+(at|from|on)$/i,'').trim();

  // "In person" / "Online" next to a time, or as a column heading above a row of times
  const MODE = /\b(in[- ]person|on[- ]campus|online|virtual(?:ly)?|zoom|teams|hybrid)\b/gi;
  const modeName = w => /person|campus/i.test(w) ? 'In person' : /hybrid/i.test(w) ? 'Hybrid' : 'Online';
  const modesIn = s => { const out = []; let x; MODE.lastIndex = 0; while ((x = MODE.exec(s))){ const n = modeName(x[1]); if (out[out.length-1] !== n) out.push(n); } return out; };
  const lineStart = p => t.lastIndexOf('\n', p-1) + 1;
  const lineEnd = p => { const e = t.indexOf('\n', p); return e < 0 ? t.length : e; };
  function timesIn(a, b){
    const found = findTimes(t.slice(a, b)).map(f=>({ s: a+f.s, e: a+f.e, txt: f.txt }));
    found.forEach((f, k)=>{
      const ls = lineStart(f.s);
      const from = Math.max(ls, k && found[k-1].e > ls ? found[k-1].e : ls);
      const own = t.slice(from, f.s);
      const m = own.length <= 40 ? modesIn(own) : [];
      if (m.length){ f.mode = m[m.length-1]; return; }
      // column headings: the nearest non-empty line above, one heading per time on this line
      const row = found.filter(g=>lineStart(g.s) === ls);
      let above = ls - 1;
      for (let hop = 0; hop < 3 && above > 0; hop++){
        const hs = lineStart(above), heads = modesIn(t.slice(hs, above));
        if (heads.length){ if (heads.length === row.length) f.mode = heads[row.indexOf(f)]; break; }
        above = hs - 1;
      }
    });
    const list = found.map(f=>f.mode ? f.txt+' ('+f.mode+')' : f.txt);
    return [...new Set(list)];
  }

  cands.forEach((c, i)=>{
    const ls = t.lastIndexOf('\n', c.start-1) + 1;
    let le = t.indexOf('\n', c.end); if (le < 0) le = t.length;
    const next = cands[i+1] ? cands[i+1].start : t.length;
    const prev = cands[i-1] ? cands[i-1].end : 0;
    // times on the same line after the date, then before it, then on the lines below until the next date's line
    let times = timesIn(c.end, Math.min(le, next));
    if (!times.length && prev <= ls) times = timesIn(ls, c.start);
    if (!times.length && next > le){
      const nextLine = cands[i+1] ? t.lastIndexOf('\n', next-1) + 1 : t.length;
      if (nextLine > le) times = timesIn(le, Math.min(nextLine, le + 600));
    }
    c.times = [...new Set(times)];
    // label: the rest of the line, or the line above
    let line = t.slice(ls, le);
    let label = line.replace(c.text, ' ');
    findTimes(label).reverse().forEach(f=>{ label = label.slice(0,f.s)+' '+label.slice(f.e); });
    label = tidy(label);
    if (label.length < 3 || /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i.test(label)){
      const pe = ls - 1, ps = t.lastIndexOf('\n', pe-1) + 1;
      const pl = pe > 0 ? tidy(t.slice(ps, pe)) : '';
      label = (pl.length >= 3 && pl.length <= 90 && prev <= ps) ? pl : '';
    }
    c.label = label.slice(0, 90);
    c.source = tidy(line).slice(0, 140);
    const before = t.slice(Math.max(ls, c.start-32), c.start), after = t.slice(c.end, c.end+14);
    c.skip = SKIP_BEFORE.test(before) || SKIP_AFTER.test(after);
  });

  const merge = list => {
    const by = new Map();
    list.forEach(c=>{
      const s = by.get(c.iso);
      if (!s) by.set(c.iso, { date:c.iso, times:[...c.times], label:c.label, source:c.source });
      else { c.times.forEach(x=>{ if(!s.times.includes(x)) s.times.push(x); }); if (!s.label) s.label = c.label; }
    });
    return [...by.values()].sort((a,b)=>a.date.localeCompare(b.date));
  };
  let keep = cands.filter(c=>!c.skip), skip = cands.filter(c=>c.skip);
  if (!keep.length){ keep = skip; skip = []; }
  const sessions = merge(keep);
  // a repeated event often names itself only once
  sessions.forEach((s,i)=>{ if (!s.label && i>0) s.label = sessions[i-1].label; });
  const kept = new Set(sessions.map(s=>s.date));
  const extras = merge(skip).filter(s=>!kept.has(s.date)).map(s=>Object.assign(s, { reason:'deadline' }));
  // a single-event flyer often lists its time apart from the date
  if (sessions.length === 1 && !sessions[0].times.length){
    sessions[0].times = timesIn(0, t.length);
  }
  return { sessions, extras };
}
