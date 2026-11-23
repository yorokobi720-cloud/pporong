'use strict';
/* =========================================================
   뽀롱 (pporong) — 아티스트와 팬이 소통하는 앱
   - 팬: 닉네임으로 입장 / 아티스트: 비밀번호로 입장
   - 데이터는 store.js (체험 모드 IndexedDB / 온라인 Supabase)
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = () => $('#app');
const CFG = window.PPORONG_CONFIG || {};
const pad = n => String(n).padStart(2, '0');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const LS = {
  get(k, d) { try { const v = localStorage.getItem('pp.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pp.' + k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------------- 기본 문구 ---------------- */
const DEFAULT_REPLIES = [
  '{이름아} 메시지 고마워! 💗',
  '우와 정말? 더 얘기해줘!',
  '헤헤 나도 그렇게 생각해 ☺️',
  '오늘 {이름}의 하루는 어땠어?',
  '{이름아} 보고 싶었어~',
  '밥은 맛있게 먹었어? 🍚',
  '최고야 최고! 👍',
  '사랑해 => 나도 {이름} 사랑해!! 💗💗',
  '안녕, 하이 => 안녕 {이름아}! 반가워 👋',
  '졸려, 잘자, 굿나잇 => 잘 자 {이름아} 🌙 좋은 꿈 꿔~',
].join('\n');
const DEFAULT_WELCOME = '{이름아} 반가워! 멤버십 가입해줘서 고마워 💗 앞으로 우리 자주 이야기하자!';
const DEFAULT_BDAY = '{이름아} 생일 축하해!! 🎂🎉 오늘은 세상에서 제일 행복한 하루 보내!';
const LETTER_THANKS = ['{이름아} 편지 잘 받았어!! 💌 몇 번이나 읽었는지 몰라', '편지 고마워 {이름아} 🥹 소중하게 간직할게!', '우와 {이름}가 쓴 편지다! 너무 행복해 💗'];

/* ---------------- helpers ---------------- */
function josa(name, a = '아', b = '야') {
  if (!name) return '';
  const c = name.charCodeAt(name.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return name + ((c - 0xac00) % 28 ? a : b);
  return name + b;
}
function fill(t, name) {
  const n = name || '팬';
  return String(t || '').replace(/\{이름아\}/g, josa(n)).replace(/\{이름\}/g, n);
}
function hash(s) { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pporong:' + t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function fmtTime(ts) { const d = new Date(ts); const h = d.getHours(); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(d.getMinutes())}`; }
function fmtDate(ts) { const d = new Date(ts); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`; }
function fmtShort(ts) { const d = new Date(ts); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; }
const dayKey = ts => new Date(ts).toDateString();
function todayKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function fmtList(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(ts);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '어제';
  const t = new Date(now); t.setDate(now.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return '내일';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
function fmtAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return fmtList(ts);
}
function fmtHM(t) { const [h, m] = t.split(':').map(Number); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(m)}`; }
function fmtMD(md) { const [m, d] = md.split('-').map(Number); return `${m}월 ${d}일`; }
function localDT(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function daysLabel(days) {
  const k = [...days].sort().join('');
  if (k === '0123456') return '매일';
  if (k === '12345') return '평일';
  if (k === '06') return '주말';
  return [...days].sort().map(d => WD[d]).join('·');
}
function hexMix(hex, to = '#ffffff', t = 0.3) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex || '#ff4d6d'), b = p(to);
  return '#' + a.map((v, i) => pad(Math.round(v + (b[i] - v) * t).toString(16))).join('');
}
const PALETTE = ['#ff4d6d', '#ff8a3d', '#f5b300', '#3bb273', '#2f9cf4', '#6c5ce7', '#e056b5', '#8d6e63'];
const colorOf = id => PALETTE[hash(id || '') % PALETTE.length];
const fmtDur = s => `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}`;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function resizeImage(file, max = 1280, q = 0.85) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => (b ? res(b) : rej(new Error('이미지 변환 실패'))), 'image/jpeg', q);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => rej(new Error('이미지를 읽을 수 없어요'));
    img.src = URL.createObjectURL(file);
  });
}
function audioDuration(blob) {
  return new Promise(res => {
    const a = new Audio(); a.preload = 'metadata';
    a.onloadedmetadata = () => {
      if (a.duration === Infinity || isNaN(a.duration)) { a.currentTime = 1e9; a.ontimeupdate = () => { a.ontimeupdate = null; res(a.duration || 0); }; }
      else res(a.duration);
    };
    a.onerror = () => res(0);
    a.src = URL.createObjectURL(blob);
  });
}
// 갤러리에서 사진 고르기
function pickFiles({ accept = 'image/*', multiple = false, capture = null } = {}) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple;
    if (capture) i.setAttribute('capture', capture);
    i.onchange = () => res([...i.files]);
    i.click();
  });
}
async function pickImage(max = 1280) {
  const [f] = await pickFiles(); if (!f) return null;
  try { return await resizeImage(f, max); } catch (e) { toast(e.message); return null; }
}
async function upload(blob) {
  const done = loading('올리는 중…');
  try { return await Store.upload(blob); }
  catch (e) { toast('업로드 실패: ' + (e.message || '알 수 없는 오류')); return null; }
  finally { done(); }
}
// 체험 모드 사진은 비동기로 불러와야 해서 data-lsrc 를 붙임
function srcAttr(url, frag = '') {
  const s = Store.src(url);
  return s ? `src="${esc(s + frag)}"` : `data-lsrc="${esc(url)}" data-frag="${frag}"`;
}
new MutationObserver(() => Store.hydrate(document)).observe(document.body, { childList: true, subtree: true });

/* ---------------- icons ---------------- */
const I = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.4-7.5a1 1 0 000-1.8L3.4 3.6a1 1 0 00-1.4 1.1L4 11l9 1-9 1-2 6.3a1 1 0 001.4 1.1z"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 4C7 4 3 7.3 3 11.4c0 2.4 1.4 4.6 3.6 5.9L6 21l4-2.4c.6.1 1.3.2 2 .2 5 0 9-3.3 9-7.4S17 4 12 4z"/></svg>',
  my: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6" stroke-linecap="round"/></svg>',
  fans: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5c.7-3.4 3.2-5.3 6.2-5.3s5.5 1.9 6.2 5.3"/><circle cx="17" cy="9" r="2.6"/><path d="M17.5 14.3c2 .3 3.4 1.9 3.8 4.4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.6 2.3 2.8-.4.9 2.7 2.5 1.3-.6 2.8 1.6 2.3-2.2 1.8.1 2.8-2.8.4-1.4 2.5-2.5-1.2-2.5 1.2-1.4-2.5-2.8-.4.1-2.8-2.2-1.8 1.6-2.3-.6-2.8 2.5-1.3.9-2.7 2.8.4z" stroke-linejoin="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M3.5 17l5-4.5 4 3.5 3-2.5 5 4"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="4" rx="1"/><path d="M5 13v7h14v-7M12 9v11M12 9c-1-3-5-4-5-1.5S12 9 12 9zm0 0c1-3 5-4 5-1.5S12 9 12 9z"/></svg>',
  check: '<svg class="verified" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9L3.2 15.8l1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z"/><path d="M8 12.2l2.6 2.6L16 9.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
  smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.1 2 3.5 2s2.5-.7 3.5-2"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/></svg>',
};
function logoMark(size = 28, fg = '#fff', eye = '#ff4d6d') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><path d="M16 3.5C8.8 3.5 3.5 8.3 3.5 14.4c0 3.6 1.9 6.7 4.9 8.6l-1.1 5.5 5.9-3.4c.9.2 1.8.3 2.8.3 7.2 0 12.5-4.9 12.5-11S23.2 3.5 16 3.5z" fill="${fg}"/><circle cx="11.6" cy="14.2" r="2" fill="${eye}"/><circle cx="20.4" cy="14.2" r="2" fill="${eye}"/><path d="M13.6 18.2c1.4 1.2 3.4 1.2 4.8 0" stroke="${eye}" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`;
}
function logo(size = 26, color = '#fff', eye = '#ff4d6d') {
  return `<span class="logo" style="color:${color};font-size:${size}px">${logoMark(size * 1.15, color, eye)}pporong</span>`;
}

/* ---------------- 데이터 접근 ---------------- */
let session = LS.get('session', null); // { role: 'fan' | 'artist', id }
const artists = () => Store.all('artist').sort((a, b) => a.created - b.created);
const fans = () => Store.all('fan');
const A = id => { const r = Store.get(id); return r && r._kind === 'artist' ? r : null; };
const F = id => { const r = Store.get(id); return r && r._kind === 'fan' ? r : null; };
const meFan = () => (session?.role === 'fan' ? F(session.id) : null);
const meArt = () => (session?.role === 'artist' ? A(session.id) : null);
const isArtist = () => session?.role === 'artist';
const myKey = () => (session ? (session.role === 'fan' ? 'f:' : 'a:') + session.id : '');
const subOf = (f, aid) => f?.subs?.find(s => s.artist_id === aid) || null;
const fansOf = aid => fans().filter(f => subOf(f, aid)).sort((x, y) => subOf(x, aid).since - subOf(y, aid).since);
const mySubs = () => (meFan()?.subs || []).map(s => A(s.artist_id)).filter(Boolean);
function authorOf(key) {
  const [t, id] = String(key || '').split(':');
  const e = t === 'a' ? A(id) : F(id);
  return { e, isArtist: t === 'a', name: e ? (t === 'a' ? e.name : e.nickname) : '(탈퇴한 사용자)' };
}
function validSession() {
  if (!session) return false;
  const ok = session.role === 'fan' ? !!F(session.id) : !!A(session.id);
  if (!ok) { session = null; LS.set('session', null); }
  return ok;
}

/* 메시지: 실제 메시지 + 반복/기념일/생일/환영 메시지(시간이 되면 자동으로 보이는 가상 메시지) */
function virtualMsgs(a, f) {
  const sub = subOf(f, a?.id);
  if (!a || !f || !sub) return [];
  const out = [], now = Date.now(), joinDay = startOfDay(sub.since);
  out.push({ id: `v:w:${a.id}:${f.id}`, artist_id: a.id, fan_id: f.id, from: 'artist', type: 'text', text: a.welcome || DEFAULT_WELCOME, at: sub.since + 1500, virtual: '환영' });
  const start = Math.max(joinDay, startOfDay(now - 14 * 864e5));
  for (const r of Store.all('routine', r => r.artist_id === a.id && r.enabled)) {
    const lines = String(r.texts || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) continue;
    const [h, mi] = r.time.split(':').map(Number);
    for (let d = new Date(start); d.getTime() <= now; d.setDate(d.getDate() + 1)) {
      const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi).getTime();
      if (ts > now || ts < r.created || ts < sub.since || !r.days.includes(d.getDay())) continue;
      const key = todayKey(d);
      out.push({ id: `v:r:${r.id}:${key}:${f.id}`, artist_id: a.id, fan_id: f.id, from: 'artist', type: 'text', text: lines[hash(r.id + key) % lines.length], at: ts, virtual: '반복' });
    }
  }
  const yr = new Date().getFullYear();
  for (const y of [yr - 1, yr]) {
    for (const an of Store.all('anniv', x => x.artist_id === a.id)) {
      const [mm, dd] = an.date.split('-').map(Number);
      const ts = new Date(y, mm - 1, dd, 7, 0).getTime();
      const show = Math.max(ts, an.created);
      if (ts > now || startOfDay(ts) < startOfDay(an.created) || startOfDay(ts) < joinDay) continue;
      out.push({ id: `v:a:${an.id}:${y}:${f.id}`, artist_id: a.id, fan_id: f.id, from: 'artist', type: 'card', emoji: an.emoji, title: an.name, text: an.text, at: show, virtual: '기념일' });
    }
    if (f.birthday) {
      const [mm, dd] = f.birthday.split('-').map(Number);
      const ts = new Date(y, mm - 1, dd, 7, 0).getTime();
      const show = Math.max(ts, f.bday_set || 0);
      if (ts <= now && startOfDay(ts) >= joinDay && startOfDay(ts) >= startOfDay(f.bday_set || 0)) {
        out.push({ id: `v:b:${a.id}:${y}:${f.id}`, artist_id: a.id, fan_id: f.id, from: 'artist', type: 'card', emoji: '🎂', title: `${f.nickname} 생일 축하해!`, text: a.bday_text || DEFAULT_BDAY, at: show, virtual: '생일' });
      }
    }
  }
  return out;
}
function roomMsgs(aid, fid) {
  const now = Date.now();
  const real = Store.all('message', m => m.artist_id === aid && m.at <= now && (m.fan_id === fid || (!m.fan_id && m.from === 'artist')));
  return [...real, ...virtualMsgs(A(aid), F(fid))].sort((x, y) => x.at - y.at);
}
const broadcastMsgs = aid => Store.all('message', m => m.artist_id === aid && !m.fan_id && m.at <= Date.now()).sort((x, y) => x.at - y.at);
function fanUnread(aid) {
  const f = meFan(); if (!f) return 0;
  const t = LS.get(`read.${f.id}.${aid}`, 0);
  return roomMsgs(aid, f.id).filter(m => m.from === 'artist' && m.at > t).length;
}
const totalFanUnread = () => mySubs().reduce((s, a) => s + fanUnread(a.id), 0);
function artUnread(fid) {
  const a = meArt(); if (!a) return 0;
  const t = LS.get(`aread.${a.id}.${fid}`, 0);
  return Store.all('message', m => m.artist_id === a.id && m.fan_id === fid && m.from === 'fan' && m.at > t).length;
}
const totalArtUnread = () => { const a = meArt(); return a ? fansOf(a.id).reduce((s, f) => s + artUnread(f.id), 0) : 0; };
function fanLetters(f = meFan()) {
  const now = Date.now();
  return Store.all('letter', l => l.at <= now && ((l.dir === 'from' && (l.fan_id === f.id || (!l.fan_id && subOf(f, l.artist_id)))) || (l.dir === 'to' && l.fan_id === f.id)));
}
const fanUnreadLetters = () => { const f = meFan(); if (!f) return 0; const r = LS.get(`lread.${f.id}`, []); return fanLetters(f).filter(l => l.dir === 'from' && !r.includes(l.id)).length; };
const artUnreadLetters = () => { const a = meArt(); return a ? Store.all('letter', l => l.artist_id === a.id && l.dir === 'to' && !l.read).length : 0; };

/* 하트 포인트: 내가 모은 것 + 아티스트가 선물한 것 */
function points(f = meFan()) {
  if (!f) return 0;
  const gifts = Store.all('message', m => m.fan_id === f.id && m.points && m.at <= Date.now()).reduce((s, m) => s + m.points, 0);
  return (f.points || 0) + gifts;
}
function addPoints(n, why) {
  const f = meFan(); if (!f) return;
  Store.update(f.id, { points: (f.points || 0) + n });
  floatPoint(n, why);
}
function msgPoint() {
  const f = meFan(); if (!f) return;
  const tk = todayKey();
  const daily = f.daily?.date === tk ? f.daily : { date: tk, msg: 0 };
  if (daily.msg >= 10) return;
  Store.update(f.id, { daily: { date: tk, msg: daily.msg + 1 }, points: (f.points || 0) + 1 });
  floatPoint(1);
}

const posts = (aid, board) => Store.all('post', p => p.artist_id === aid && p.board === board).sort((a, b) => b.at - a.at);
function liveState(aid) {
  const now = Date.now();
  const lives = Store.all('notice', n => n.artist_id === aid && n.type === 'live' && n.start)
    .filter(n => n.start + 2 * 3600e3 >= now && n.start - now < 24 * 3600e3).sort((a, b) => a.start - b.start);
  const n = lives[0]; if (!n) return null;
  return { on: n.start <= now, label: `${fmtList(n.start) === fmtTime(n.start) ? '오늘' : fmtList(n.start)} ${fmtTime(n.start)}`, notice: n };
}

/* ---------------- stickers ---------------- */
const PACKS = [
  { id: 'basic', name: '기본 스티커', price: 0, items: ['💗', '😀', '👍', '🎉', '😭', '😴'] },
  { id: 'idol', name: '응원봉 세트', price: 10, items: ['🎤', '🪩', '✨', '💖', '📸', '🎧', '🌟', '🙌'] },
  { id: 'animal', name: '동물 친구들', price: 10, items: ['🐰', '🐻', '🐶', '🐱', '🦊', '🐼', '🐨', '🐯'] },
  { id: 'snack', name: '맛있는 간식', price: 15, items: ['🍓', '🍦', '🍩', '🍪', '🧁', '🍭', '🍫', '🧋'] },
  { id: 'shine', name: '반짝반짝', price: 20, items: ['⭐', '🌈', '✨', '🌙', '☀️', '🌸', '🦋', '🎀'] },
  { id: 'royal', name: '공주와 왕자', price: 25, items: ['👑', '👸', '🤴', '🧚', '🦄', '💎', '🏰', '🪄'] },
  { id: 'love', name: '러브러브', price: 30, items: ['💌', '💘', '💝', '🫶', '😘', '🥰', '💐', '💍'] },
];
const ownedStickers = () => PACKS.filter(p => (meFan()?.packs || ['basic']).includes(p.id)).flatMap(p => p.items);
const EMOJIS = ['😀', '😍', '🥰', '😂', '😭', '😮', '😴', '👍', '👏', '🙏', '💗', '💕', '⭐', '🌈', '🍓', '🍦', '🐰', '🐻', '🎤', '🪩', '🎉', '🌙', '🫶', '✨'];

/* ---------------- sound / banner / toast / modal ---------------- */
let actx;
document.addEventListener('pointerdown', () => { if (!actx) try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }, { once: true });
function ding() {
  if (!LS.get('sound', true) || !actx) return;
  const t = actx.currentTime;
  [[880, 0], [1320, 0.12]].forEach(([f, d]) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
    o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + 0.4);
  });
}
let bannerTimer;
function showBanner(title, body, onTap) {
  const b = $('#banner');
  b.innerHTML = `<div class="ic">${logoMark(26)}</div><div class="meta"><div class="t">pporong<span>· ${esc(title)}</span></div><div class="b">${esc(body)}</div></div>`;
  b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  b.onclick = () => { b.hidden = true; onTap && onTap(); };
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => (b.hidden = true), 4200);
  ding();
  if (navigator.vibrate) try { navigator.vibrate(80); } catch (e) {}
}
function toast(t) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = t;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2000);
}
window.toast = toast;
function loading(t) {
  const el = document.createElement('div'); el.className = 'loading';
  el.innerHTML = `<div><span class="spin"></span>${esc(t)}</div>`;
  document.body.appendChild(el);
  return () => el.remove();
}
function modal(html, setup) {
  return new Promise(res => {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-wrap"><div class="modal">${html}</div></div>`;
    const done = v => { root.innerHTML = ''; res(v); };
    setup($('.modal', root), done);
  });
}
function confirmBox(title, text, ok = '확인', cancel = '취소') {
  return modal(`<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}<div class="row"><button class="btn" data-x>${esc(cancel)}</button><button class="btn pri" data-ok>${esc(ok)}</button></div>`,
    (m, done) => { m.querySelector('[data-x]').onclick = () => done(false); m.querySelector('[data-ok]').onclick = () => done(true); });
}
function promptBox(title, text, value = '', max = 20, type = 'text') {
  return modal(`<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}<input class="inp" type="${type}" maxlength="${max}" value="${esc(value)}" autocomplete="off"><div class="row"><button class="btn" data-x>취소</button><button class="btn pri" data-ok>확인</button></div>`,
    (m, done) => {
      const inp = m.querySelector('input'); setTimeout(() => inp.focus(), 50);
      m.querySelector('[data-ok]').onclick = () => done(inp.value);
      inp.onkeydown = e => e.key === 'Enter' && !e.isComposing && done(inp.value);
      m.querySelector('[data-x]').onclick = () => done(null);
    });
}
function floatPoint(n, why) {
  const el = document.createElement('div'); el.className = 'pt-float';
  el.textContent = `💗 +${n}${why ? ' ' + why : ''}`;
  document.body.appendChild(el); setTimeout(() => el.remove(), 1700);
}
function confetti() {
  const w = document.createElement('div'); w.className = 'confetti';
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = PALETTE[i % 7];
    s.style.animationDelay = Math.random() * 0.7 + 's';
    s.style.animationDuration = 1.8 + Math.random() * 1.5 + 's';
    s.style.setProperty('--r', Math.random() * 720 - 360 + 'deg');
    if (i % 3 === 0) s.style.borderRadius = '50%';
    w.appendChild(s);
  }
  document.body.appendChild(w); setTimeout(() => w.remove(), 4200);
}

/* ---------------- avatar & media ---------------- */
function avatarHTML(e, size = 44, cls = '') {
  const st = `width:${size}px;height:${size}px`;
  if (e?.avatar) return `<div class="avatar ${cls}" style="${st}"><img ${srcAttr(e.avatar)} alt=""></div>`;
  if (e?._kind === 'fan') {
    const c = colorOf(e.id);
    return `<div class="avatar ${cls}" style="${st};font-size:${Math.round(size * 0.42)}px;background:${hexMix(c, '#ffffff', 0.8)};color:${c};font-weight:800">${esc((e.nickname || '?').slice(0, 1))}</div>`;
  }
  return `<div class="avatar ${cls}" style="${st};font-size:${Math.round(size * 0.52)}px;background:${hexMix(e?.color || '#ff4d6d', '#ffffff', 0.85)}">${esc(e?.emoji || '🎤')}</div>`;
}
function thumbHTML(m) {
  return m.type === 'video'
    ? `<span class="thumb"><video ${srcAttr(m.media, '#t=0.1')} preload="metadata" muted playsinline></video><span class="vplay sm">${I.play}</span></span>`
    : `<span class="thumb"><img ${srcAttr(m.media)} alt=""></span>`;
}
function openViewer(list, idx = 0) {
  if (!list.length || idx < 0) return;
  stopAudio();
  const v = document.createElement('div'); v.className = 'viewer';
  const draw = () => {
    const m = list[idx];
    v.innerHTML = `${m.type === 'video' ? `<video ${srcAttr(m.media)} controls autoplay playsinline></video>` : `<img ${srcAttr(m.media)} alt="">`}
      <button class="icon-btn x" data-x>${I.close}</button>
      ${list.length > 1 ? `<button class="vnav l" data-p ${idx === 0 ? 'disabled' : ''}>${I.back}</button><button class="vnav r" data-n ${idx === list.length - 1 ? 'disabled' : ''}>${I.back}</button><div class="vcnt">${idx + 1} / ${list.length}</div>` : ''}`;
  };
  const move = d => { const n = idx + d; if (n >= 0 && n < list.length) { idx = n; draw(); } };
  v.onclick = e => {
    if (e.target.closest('[data-x]') || e.target === v) v.remove();
    else if (e.target.closest('[data-p]')) move(-1);
    else if (e.target.closest('[data-n]')) move(1);
  };
  let sx = null;
  v.addEventListener('pointerdown', e => (sx = e.clientX));
  v.addEventListener('pointerup', e => { if (sx !== null && e.target.tagName !== 'VIDEO') { const dx = e.clientX - sx; if (Math.abs(dx) > 60) move(dx > 0 ? -1 : 1); } sx = null; });
  draw(); app().appendChild(v);
}
let player = null;
function stopAudio() {
  if (player) { player.audio.pause(); const p = player.el.querySelector('.play'); if (p) p.innerHTML = I.play; $$('.wave i', player.el).forEach(i => i.classList.remove('on')); player = null; }
}
async function toggleVoice(el, m) {
  if (player && player.el === el) return stopAudio();
  stopAudio();
  const url = await Store.resolve(m.media);
  if (!url) return toast('재생할 수 없어요');
  const audio = new Audio(url);
  player = { audio, el };
  el.querySelector('.play').innerHTML = I.pause;
  const bars = $$('.wave i', el);
  audio.ontimeupdate = () => {
    const p = audio.duration && isFinite(audio.duration) ? audio.currentTime / audio.duration : audio.currentTime / (m.dur || 1);
    bars.forEach((b, i) => b.classList.toggle('on', i / bars.length <= p));
  };
  audio.onended = stopAudio;
  audio.play().catch(() => { toast('재생할 수 없어요'); stopAudio(); });
}

/* ---------------- routing ---------------- */
const navStack = [];
function go(path) { navStack.push(location.hash); location.hash = '#/' + path; }
function back(fallback) {
  if (navStack.length) { navStack.pop(); history.back(); }
  else location.replace('#/' + (fallback || (isArtist() ? 'me' : 'home')));
}
window.addEventListener('hashchange', () => {
  if (navStack.length && navStack[navStack.length - 1] === location.hash) navStack.pop();
  render();
});
let current = { name: '' };
function render() {
  stopAudio();
  chatCtx = null;
  const [r, p, q] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!validSession()) { current = { name: 'landing' }; return renderLanding(); }
  current = { name: r || '', id: p || null, live: true };
  switch (r) {
    case 'artist': return renderArtistPage(p, q || 'feed');
    case 'post': return renderPost(p);
    case 'newpost': return renderNewPost(p, q);
    case 'notice': return renderNotice(p);
    case 'letter': return renderLetter(p);
    case 'album': return renderAlbum(p);
  }
  if (isArtist()) {
    switch (r) {
      case 'inbox': return renderInbox();
      case 'compose': return renderCompose(p);
      case 'achat': return renderAChat(p);
      case 'fans': return renderFans();
      case 'settings': return renderSettings();
      default: current.name = 'me'; return renderArtistPage(session.id, p || 'feed');
    }
  }
  switch (r) {
    case 'chat': return renderChat(p);
    case 'msgs': return renderMsgs();
    case 'write': return renderWrite(p);
    case 'play': return renderPlay();
    case 'shop': return renderShop();
    case 'my': return renderMy();
    default: current.name = 'home'; return renderHome();
  }
}
function tabbar(on) {
  const t = (k, icon, label, dot) => `<button class="${on === k ? 'on' : ''}" data-tab="${k}">${icon}<span>${label}</span>${dot ? '<i class="dot"></i>' : ''}</button>`;
  if (isArtist()) return `<nav class="tabbar">${t('me', I.home, '내 페이지', false)}${t('inbox', I.chat, '메시지', totalArtUnread() > 0)}${t('fans', I.fans, '팬', artUnreadLetters() > 0)}${t('settings', I.gear, '설정', false)}</nav>`;
  const f = meFan();
  return `<nav class="tabbar">${t('home', I.home, '홈', false)}${t('msgs', I.chat, '메시지', totalFanUnread() + fanUnreadLetters() > 0)}${t('play', I.star, '놀이터', f?.stamps?.last !== todayKey())}${t('my', I.my, '마이', false)}</nav>`;
}
function bindTabs() {
  $$('[data-tab]').forEach(b => (b.onclick = () => { navStack.length = 0; if (current.name !== b.dataset.tab) location.replace('#/' + b.dataset.tab); }));
}
// 다른 기기/탭에서 데이터가 바뀌면 화면 새로 그리기 (입력 중이면 건너뜀)
function softRender() {
  if (!session) return;
  if (current.name === 'chat' || current.name === 'achat') return renderChatBody();
  if (!current.live || current.name === 'landing') return;
  if ($('.modal-wrap, .viewer, .drawer, .react-layer, .loading')) return;
  const ae = document.activeElement;
  if (ae && ['INPUT', 'TEXTAREA'].includes(ae.tagName)) return;
  if ($$('#app textarea, #app input').some(el => el.value && el.type !== 'file')) return;
  const sc = $('.scroll')?.scrollTop || 0;
  render();
  const s = $('.scroll'); if (s) s.scrollTop = sc;
}
let refreshT;
Store.on(() => { clearTimeout(refreshT); refreshT = setTimeout(() => { checkNotify(); softRender(); }, 80); });

/* =========================================================
   입장 화면
   ========================================================= */
function renderLanding() {
  const lastFan = F(LS.get('lastFan', ''));
  const demo = !Store.online && artists().some(a => a.demo);
  app().innerHTML = `<div class="screen landing">
    <div class="scroll" style="padding:calc(48px + var(--safe-top)) 24px 30px">
      ${logo(30)}
      <h1>아티스트와 팬이<br>만나는 곳 💗</h1>
      <p class="lead">좋아하는 아티스트의 멤버십에 가입하고<br>나만을 위한 메시지를 받아보세요</p>
      ${lastFan ? `<button class="enter-card" id="cont">${avatarHTML(lastFan, 44)}<div><b>${esc(lastFan.nickname)}</b>(으)로 계속하기<small>팬으로 입장</small></div><span class="arr">›</span></button>` : ''}
      <button class="enter-card" id="asFan"><span class="ei">💗</span><div><b>팬으로 입장</b><small>닉네임만 정하면 바로 시작!</small></div><span class="arr">›</span></button>
      <button class="enter-card" id="asArt"><span class="ei">🎤</span><div><b>아티스트로 입장</b><small>아티스트 비밀번호가 필요해요</small></div><span class="arr">›</span></button>
      <button class="link-btn" id="reg">새 아티스트 등록하기</button>
      <div class="mode">${Store.online ? '🟢 온라인 모드 · 친구들과 함께 소통해요' : '🧪 체험 모드 · 이 기기 안에서만 저장돼요'}${demo ? '<br>데모 아티스트 <b>뽀롱이</b> 비밀번호: <b>1234</b>' : ''}</div>
    </div>
  </div>`;
  if (lastFan) $('#cont').onclick = () => login('fan', lastFan.id);
  $('#asFan').onclick = fanJoin;
  $('#asArt').onclick = artistLogin;
  $('#reg').onclick = artistRegister;
}
function login(role, id) {
  session = { role, id }; LS.set('session', session);
  if (role === 'fan') LS.set('lastFan', id);
  navStack.length = 0;
  const target = role === 'fan' ? '#/home' : '#/me';
  if (location.hash === target) render(); else location.replace(target);
  seedNotified();
  if (role === 'fan') setTimeout(maybeStampPrompt, 900);
}
function logout() { session = null; LS.set('session', null); navStack.length = 0; location.replace('#/'); render(); }
async function fanJoin() {
  const nick = await promptBox('닉네임을 정해주세요', '팬 활동에 쓰는 이름이에요 (2~10자)', '', 10);
  if (nick == null) return;
  const n = nick.trim();
  if (n.length < 2) return toast('닉네임은 2글자 이상이에요');
  const known = LS.get('myFans', []);
  const ex = fans().find(f => f.nickname.toLowerCase() === n.toLowerCase());
  if (ex) {
    if (known.includes(ex.id)) return login('fan', ex.id);
    return toast('이미 다른 친구가 쓰고 있는 닉네임이에요 😢');
  }
  if (artists().some(a => a.name === n)) return toast('아티스트 이름은 닉네임으로 쓸 수 없어요');
  const f = Store.insert('fan', { nickname: n, avatar: '', birthday: '', points: 0, packs: ['basic'], stamps: { last: '', count: 0 }, daily: { date: '', msg: 0 }, subs: [] });
  LS.set('myFans', [...known, f.id]);
  login('fan', f.id);
  toast(`${josa(n)} 환영해! 💗`);
}
async function artistLogin() {
  const list = artists();
  if (!list.length) return toast('아직 등록된 아티스트가 없어요');
  const aid = await modal(`<h2>어떤 아티스트인가요?</h2><div class="pick-list">${list.map(a => `<button data-a="${a.id}">${avatarHTML(a, 40)}<b>${esc(a.name)}</b></button>`).join('')}</div><div class="row"><button class="btn" data-x>취소</button></div>`,
    (m, done) => { $$('[data-a]', m).forEach(b => (b.onclick = () => done(b.dataset.a))); m.querySelector('[data-x]').onclick = () => done(null); });
  if (!aid) return;
  const a = A(aid);
  const pw = await promptBox(`${a.name} 비밀번호`, '아티스트 본인만 알고 있는 비밀번호', '', 30, 'password');
  if (pw == null) return;
  if ((await sha256(pw)) !== a.pw) return toast('비밀번호가 달라요');
  login('artist', aid);
}
async function artistRegister() {
  const res = await modal(`<h2>새 아티스트 등록</h2><p>등록 코드는 부모님께 물어보세요</p>
    <input class="inp left" id="rn" placeholder="아티스트 이름" maxlength="20">
    <input class="inp left" id="rp" type="password" placeholder="비밀번호 (4자 이상)" style="margin-top:8px">
    <input class="inp left" id="rc" placeholder="등록 코드" style="margin-top:8px" autocomplete="off">
    <div class="row"><button class="btn" data-x>취소</button><button class="btn pri" data-ok>등록하기</button></div>`,
    (m, done) => {
      m.querySelector('[data-x]').onclick = () => done(null);
      m.querySelector('[data-ok]').onclick = () => done({ n: $('#rn').value.trim(), p: $('#rp').value, c: $('#rc').value.trim() });
    });
  if (!res) return;
  if (res.n.length < 1) return toast('아티스트 이름을 입력해 주세요');
  if (res.p.length < 4) return toast('비밀번호는 4자 이상이에요');
  if (CFG.ARTIST_SIGNUP_CODE_HASH && (await sha256(res.c)) !== CFG.ARTIST_SIGNUP_CODE_HASH) return toast('등록 코드가 달라요');
  if (CFG.ARTIST_SIGNUP_CODE && res.c !== CFG.ARTIST_SIGNUP_CODE) return toast('등록 코드가 달라요');
  if (artists().some(a => a.name === res.n)) return toast('이미 있는 아티스트 이름이에요');
  const a = Store.insert('artist', {
    name: res.n, bio: '', color: PALETTE[artists().length % PALETTE.length], emoji: '🎤', avatar: '', wallpaper: '',
    pw: await sha256(res.p), auto_reply: true, replies: DEFAULT_REPLIES, welcome: DEFAULT_WELCOME, bday_text: DEFAULT_BDAY,
  });
  login('artist', a.id);
  toast('아티스트 페이지가 만들어졌어요! 🎉');
}

/* =========================================================
   아티스트 페이지 (팬이 보는 화면 = 아티스트 본인 화면)
   ========================================================= */
function renderArtistPage(aid, tab = 'feed') {
  const a = A(aid); if (!a) return location.replace('#/');
  const owner = isArtist() && session.id === aid;
  const f = meFan(), sub = subOf(f, aid);
  const live = liveState(aid);
  let body = '';
  if (tab === 'feed') body = postsHTML(posts(aid, 'feed'), owner ? '첫 글을 올려 팬들에게 인사해 보세요! ✏️' : '아직 올라온 글이 없어요');
  else if (tab === 'fan') body = postsHTML(posts(aid, 'fan'), sub || owner ? '첫 번째 팬 글을 남겨보세요! 💌' : '멤버십에 가입하면 팬 글을 쓸 수 있어요');
  else if (tab === 'media') { const ml = artistMedia(aid); body = ml.length ? `<div class="agrid">${ml.map((m, i) => `<button data-mi="${i}">${thumbHTML(m)}</button>`).join('')}</div>` : '<div class="empty"><div class="big">🖼️</div>아직 사진이 없어요</div>'; }
  else body = noticesHTML(aid, owner);
  const canWrite = tab === 'feed' ? owner : tab === 'fan' ? owner || !!sub : false;
  const base = owner ? 'me/' : `artist/${aid}/`;
  app().innerHTML = `<div class="screen apage" style="--ac:${a.color}">
    ${a.wallpaper ? `<img class="wall" ${srcAttr(a.wallpaper)} alt="">` : `<div class="wall" style="background:linear-gradient(165deg, ${a.color} 0%, ${hexMix(a.color, '#ffb36b', 0.5)} 45%, #fff5f7 100%)"></div>`}
    <div class="wall-shade"></div>
    <header class="topbar trans">
      ${owner ? `<div class="title" style="text-align:left">${logo(20)}</div>` : `<button class="icon-btn" id="bk">${I.back}</button><div class="title"></div>`}
      ${owner ? `<button class="icon-btn" id="wallBtn" title="배경 바꾸기">${I.image}</button>` : '<div class="spacer"></div>'}
    </header>
    <div class="scroll" id="apScroll">
      <div class="ahero">
        <div class="av-wrap">${avatarHTML(a, 96, 'big')}${owner ? `<button class="av-edit" id="avBtn">${I.camera}</button>` : ''}</div>
        <div class="an">${esc(a.name)} ${I.check}</div>
        ${a.bio ? `<div class="ab">${esc(a.bio)}</div>` : owner ? '<div class="ab" style="opacity:.7">설정에서 소개글을 써보세요</div>' : ''}
        <div class="af">팬 ${fansOf(aid).length}명${live ? ` · <button class="live-chip ${live.on ? 'on' : ''}" data-notice="${live.notice.id}">${live.on ? '● LIVE' : '🔔 라이브 ' + esc(live.label)}</button>` : ''}</div>
        <div class="abtns">
          ${owner ? `<button class="hbtn" id="wallBtn2">🖼️ 배경 바꾸기</button><button class="hbtn" id="avBtn2">📷 프로필 사진</button>`
            : !f ? ''
            : sub ? `<button class="hbtn pri" id="chatBtn">💌 메시지${fanUnread(aid) ? ` <b class="mini-badge">${fanUnread(aid)}</b>` : ''}</button><button class="hbtn" id="letBtn">✉️ 편지</button><button class="hbtn" id="memBtn">✓ 멤버십</button>`
            : `<button class="hbtn pri wide" id="joinBtn">💗 멤버십 가입하기</button>`}
        </div>
      </div>
      <div class="atabs">${[['feed', '아티스트'], ['fan', '팬'], ['media', '미디어'], ['notice', '공지']].map(([k, l]) => `<button data-at="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="apanel">${body}<div style="height:90px"></div></div>
    </div>
    ${canWrite ? `<button class="fab" id="wfab" style="${owner ? '' : 'bottom:calc(24px + var(--safe-bot))'}">${I.pen}</button>` : ''}
    ${owner ? tabbar('me') : ''}
  </div>`;
  if (owner) bindTabs(); else $('#bk').onclick = () => back();
  $$('[data-at]').forEach(b => (b.onclick = () => location.replace('#/' + base + b.dataset.at)));
  bindPosts(app());
  $$('[data-notice]').forEach(b => (b.onclick = () => go('notice/' + b.dataset.notice)));
  if (tab === 'media') { const ml = artistMedia(aid); $$('[data-mi]').forEach(b => (b.onclick = () => openViewer(ml, +b.dataset.mi))); }
  const addN = $('#addNotice'); if (addN) addN.onclick = () => noticeForm(aid);
  const wf = $('#wfab'); if (wf) wf.onclick = () => go(`newpost/${aid}/${tab}`);
  if (owner) {
    const changeWall = async () => { const b = await pickImage(1800); if (!b) return; const u = await upload(b); if (u) { Store.update(aid, { wallpaper: u }); toast('배경화면을 바꿨어요 ✨'); } };
    const changeAv = async () => { const b = await pickImage(600); if (!b) return; const u = await upload(b); if (u) { Store.update(aid, { avatar: u }); toast('프로필 사진을 바꿨어요'); } };
    $('#wallBtn').onclick = changeWall; $('#wallBtn2').onclick = changeWall;
    $('#avBtn').onclick = changeAv; $('#avBtn2').onclick = changeAv;
  } else if (sub) {
    $('#chatBtn').onclick = () => go('chat/' + aid);
    $('#letBtn').onclick = () => { draft = null; go('write/' + aid); };
    $('#memBtn').onclick = () => membershipModal(a);
  } else if (f) {
    $('#joinBtn').onclick = () => joinMembership(a);
  }
}
async function joinMembership(a) {
  const f = meFan(); if (!f) return;
  if (!(await confirmBox(`${a.name} 멤버십에 가입할까요?`, '가입하면 프라이빗 메시지를 받고, 팬 게시판에 글을 쓸 수 있어요 💗', '가입하기'))) return;
  const no = Math.max(0, ...fansOf(a.id).map(x => subOf(x, a.id).no || 0)) + 1;
  Store.update(f.id, { subs: [...(f.subs || []), { artist_id: a.id, since: Date.now(), no }] });
  confetti(); toast(`${a.name} 멤버십 가입 완료! 🎉`);
}
function memberCardHTML(a, f) {
  const s = subOf(f, a.id);
  return `<div class="mcard" style="background:linear-gradient(125deg, ${a.color} 0%, ${hexMix(a.color, '#ffb36b', 0.45)} 100%);box-shadow:0 8px 20px ${a.color}44">
    <div class="k">MEMBERSHIP</div>
    <div class="ar">${esc(a.name)}</div>
    <div class="who">${esc(f.nickname)}</div>
    <div class="no">No. ${pad(s?.no || 0).padStart(4, '0')} · ${fmtShort(s?.since || Date.now())} ~</div>
    <div class="em">${a.avatar ? `<img ${srcAttr(a.avatar)} alt="">` : esc(a.emoji || '🎤')}</div>
  </div>`;
}
async function membershipModal(a) {
  const f = meFan();
  const r = await modal(`${memberCardHTML(a, f)}<div class="row"><button class="btn danger" data-out>탈퇴</button><button class="btn pri" data-x>닫기</button></div>`,
    (m, done) => { m.querySelector('[data-x]').onclick = () => done(null); m.querySelector('[data-out]').onclick = () => done('out'); });
  if (r !== 'out') return;
  if (!(await confirmBox('정말 멤버십을 탈퇴할까요?', '다시 가입할 수 있지만 회원번호가 바뀌어요.', '탈퇴'))) return;
  Store.update(f.id, { subs: (f.subs || []).filter(s => s.artist_id !== a.id) });
  toast('멤버십을 탈퇴했어요');
}
function artistMedia(aid) {
  const out = [];
  posts(aid, 'feed').forEach(p => (p.images || []).forEach(u => out.push({ type: 'image', media: u, at: p.at })));
  const f = meFan();
  const msgs = isArtist() ? (session.id === aid ? broadcastMsgs(aid) : []) : f && subOf(f, aid) ? roomMsgs(aid, f.id) : [];
  msgs.filter(m => m.from === 'artist' && (m.type === 'image' || m.type === 'video')).forEach(m => out.push({ type: m.type, media: m.media, at: m.at }));
  return out.sort((x, y) => y.at - x.at);
}

/* ---- 게시글 ---- */
const likeId = (pid, key = myKey()) => `lk_${pid}_${key.replace(':', '_')}`;
function canDeletePost(p) { return p.author === myKey() || (isArtist() && p.artist_id === session.id); }
function postCard(p, full = false) {
  const au = authorOf(p.author);
  const likes = Store.all('react', r => r.target === p.id).length;
  const liked = !!Store.get(likeId(p.id));
  const cmts = Store.all('comment', c => c.post_id === p.id).length;
  const imgs = p.images || [];
  return `<article class="post ${au.isArtist ? 'by-art' : ''}" data-post="${p.id}">
    <div class="ph">${avatarHTML(au.e, 38)}<div class="pm"><div class="pn">${esc(au.name)} ${au.isArtist ? I.check : ''}</div><div class="pt">${fmtAgo(p.at)}</div></div>
      ${full && canDeletePost(p) ? `<button class="icon-btn" data-del-post="${p.id}" style="color:#b0b0b8">${I.trash}</button>` : ''}</div>
    ${p.text ? `<div class="ptext ${full ? '' : 'clamp'}">${esc(p.text)}</div>` : ''}
    ${imgs.length ? `<div class="pimgs n${Math.min(imgs.length, 4)}">${imgs.slice(0, 4).map((u, i) => `<button data-pimg="${p.id}:${i}"><img ${srcAttr(u)} alt=""></button>`).join('')}</div>` : ''}
    <div class="pf"><button class="pl ${liked ? 'on' : ''}" data-like="${p.id}">${liked ? '♥' : '♡'} <span>${likes || ''}</span></button><button class="pc" data-open="${p.id}">💬 <span>${cmts || ''}</span></button></div>
  </article>`;
}
function postsHTML(list, emptyText) {
  return list.length ? list.map(p => postCard(p)).join('') : `<div class="empty"><div class="big">💭</div>${esc(emptyText)}</div>`;
}
function bindPosts(root) {
  $$('[data-like]', root).forEach(b => (b.onclick = e => { e.stopPropagation(); toggleLike(b.dataset.like); }));
  $$('[data-pimg]', root).forEach(b => (b.onclick = e => {
    e.stopPropagation();
    const [pid, i] = b.dataset.pimg.split(':'); const p = Store.get(pid);
    openViewer((p.images || []).map(u => ({ type: 'image', media: u })), +i);
  }));
  $$('[data-open]', root).forEach(b => (b.onclick = e => { e.stopPropagation(); if (current.name !== 'post') go('post/' + b.dataset.open); else $('#cmtIn')?.focus(); }));
  $$('article.post', root).forEach(el => (el.onclick = () => { if (current.name !== 'post') go('post/' + el.dataset.post); }));
  $$('[data-del-post]', root).forEach(b => (b.onclick = async e => {
    e.stopPropagation();
    if (!(await confirmBox('이 글을 삭제할까요?', '댓글도 함께 지워져요.', '삭제'))) return;
    const id = b.dataset.delPost;
    Store.all('comment', c => c.post_id === id).forEach(c => Store.remove(c.id));
    Store.all('react', r => r.target === id).forEach(r => Store.remove(r.id));
    Store.remove(id); back();
  }));
}
function toggleLike(pid) {
  const id = likeId(pid);
  if (Store.get(id)) Store.remove(id);
  else Store.set('react', { target: pid, user: myKey(), emoji: '💗' }, id);
}
function canComment(p) {
  if (isArtist()) return true;
  return !!subOf(meFan(), p.artist_id);
}
function renderPost(pid) {
  const p = Store.get(pid); if (!p || p._kind !== 'post') return back();
  const a = A(p.artist_id);
  const cmts = Store.all('comment', c => c.post_id === pid).sort((x, y) => x.at - y.at);
  const can = canComment(p);
  app().innerHTML = `<div class="screen">
    <header class="topbar"><button class="icon-btn" id="bk">${I.back}</button><div class="title">${esc(a?.name || '')} · ${p.board === 'feed' ? '아티스트' : '팬'}</div><div class="spacer"></div></header>
    <div class="scroll" style="background:var(--bg2)">
      ${postCard(p, true)}
      <div class="cmts">
        <div class="section-title" style="padding:4px 4px 10px">댓글 ${cmts.length}</div>
        ${cmts.map(c => { const au = authorOf(c.author); return `<div class="cm ${au.isArtist ? 'art' : ''}">${avatarHTML(au.e, 32)}<div class="cb"><div class="cn">${esc(au.name)} ${au.isArtist ? I.check : ''}<span>${fmtAgo(c.at)}</span></div><div class="ct">${esc(c.text)}</div></div>${c.author === myKey() || (isArtist() && p.artist_id === session.id) ? `<button class="icon-btn" data-del-c="${c.id}" style="color:#c0c0c8;width:28px;height:28px">${I.close}</button>` : ''}</div>`; }).join('') || '<div class="hint" style="padding:0 4px 20px">첫 댓글을 남겨보세요!</div>'}
      </div>
      <div style="height:20px"></div>
    </div>
    <div class="composer">
      <div class="field"><textarea id="cmtIn" rows="1" maxlength="300" placeholder="${can ? '댓글 달기' : '멤버십에 가입하면 댓글을 쓸 수 있어요'}" ${can ? '' : 'disabled'}></textarea><button class="send" id="cmtSend">${I.send}</button></div>
    </div>
  </div>`;
  $('#bk').onclick = () => back();
  bindPosts(app());
  $$('[data-del-c]').forEach(b => (b.onclick = async () => { if (await confirmBox('댓글을 삭제할까요?', '')) Store.remove(b.dataset.delC); }));
  const tx = $('#cmtIn'), sd = $('#cmtSend');
  tx.oninput = () => { tx.style.height = 'auto'; tx.style.height = Math.min(tx.scrollHeight, 100) + 'px'; sd.classList.toggle('on', !!tx.value.trim()); };
  sd.onclick = () => {
    const v = tx.value.trim(); if (!v || !can) return;
    Store.insert('comment', { post_id: pid, artist_id: p.artist_id, author: myKey(), text: v, at: Date.now() });
    tx.value = ''; render();
    const s = $('.scroll'); s.scrollTop = s.scrollHeight;
  };
}
let np = null; // 새 글 작성 중인 내용
function renderNewPost(aid, board) {
  const a = A(aid); if (!a) return back();
  board = board === 'fan' ? 'fan' : 'feed';
  if (board === 'feed' && !(isArtist() && session.id === aid)) return back();
  if (!np || np.aid !== aid) np = { aid, text: '', images: [] };
  current.live = false;
  app().innerHTML = `<div class="screen">
    <header class="topbar"><button class="icon-btn" id="bk">${I.close}</button><div class="title">${board === 'feed' ? '아티스트 글쓰기' : `${esc(a.name)} 팬 게시판`}</div><button class="btn sm pri" id="postGo">올리기</button></header>
    <div class="scroll" style="padding:12px 16px">
      <textarea class="inp big-text" id="npText" placeholder="${board === 'feed' ? '팬들에게 소식을 전해보세요 💗' : `${esc(a.name)}에게, 팬들에게 하고 싶은 이야기 ✏️`}">${esc(np.text)}</textarea>
      <div class="np-imgs">${np.images.map((b, i) => `<div class="np-img"><img src="${URL.createObjectURL(b)}"><button data-rm="${i}">×</button></div>`).join('')}
        ${np.images.length < 4 ? `<button class="np-add" id="npAdd">${I.image}<span>사진 ${np.images.length}/4</span></button>` : ''}</div>
      <div class="hint">휴대폰 갤러리에서 사진을 4장까지 고를 수 있어요</div>
    </div>
  </div>`;
  $('#npText').oninput = e => (np.text = e.target.value);
  $('#bk').onclick = async () => { if ((np.text || np.images.length) && !(await confirmBox('글쓰기를 그만할까요?', '쓰던 내용은 사라져요', '그만하기', '계속 쓰기'))) return; np = null; back(); };
  $$('[data-rm]').forEach(b => (b.onclick = () => { np.images.splice(+b.dataset.rm, 1); renderNewPost(aid, board); }));
  const add = $('#npAdd');
  if (add) add.onclick = async () => {
    const files = await pickFiles({ multiple: true });
    for (const f of files.slice(0, 4 - np.images.length)) { try { np.images.push(await resizeImage(f, 1400)); } catch (e) { toast(e.message); } }
    renderNewPost(aid, board);
  };
  $('#postGo').onclick = async () => {
    if (!np.text.trim() && !np.images.length) return toast('내용을 써주세요');
    const urls = [];
    for (const b of np.images) { const u = await upload(b); if (!u) return; urls.push(u); }
    Store.insert('post', { artist_id: aid, board, author: myKey(), text: np.text.trim(), images: urls, at: Date.now() });
    if (!isArtist()) msgPoint();
    np = null; toast('글을 올렸어요 ✨'); back();
  };
}

/* ---- 공지 / 라이브 알림 ---- */
function noticesHTML(aid, owner) {
  const list = Store.all('notice', n => n.artist_id === aid).sort((a, b) => b.at - a.at);
  const now = Date.now();
  return `${owner ? '<button class="btn full pri" id="addNotice" style="margin:0 0 12px">+ 공지 / 라이브 알림 쓰기</button>' : ''}
    ${list.map(n => {
      const on = n.type === 'live' && n.start <= now && now <= n.start + 2 * 3600e3;
      return `<button class="ncard" data-notice="${n.id}">
        <div class="nt">${n.type === 'live' ? `<span class="live-chip ${on ? 'on' : ''}">${on ? '● LIVE' : 'LIVE'}</span>` : '<span class="tag">공지</span>'} ${esc(n.title)}</div>
        <div class="nd">${n.type === 'live' ? '🗓 ' + fmtList(n.start) + ' ' + fmtTime(n.start) : fmtShort(n.at)}</div>
      </button>`;
    }).join('') || '<div class="empty"><div class="big">📢</div>공지가 없어요</div>'}`;
}
async function noticeForm(aid) {
  let type = 'notice';
  const r = await modal(`<h2>공지 / 라이브 알림</h2>
    <div class="seg" style="margin-bottom:10px"><button data-ty="notice" class="on">📢 공지</button><button data-ty="live">🔴 라이브 알림</button></div>
    <input class="inp left" id="nT" placeholder="제목" maxlength="40">
    <textarea class="inp left" id="nB" placeholder="내용" style="margin-top:8px;min-height:90px"></textarea>
    <div id="nLive" hidden><label class="lbl" style="text-align:left">라이브 시작 시간</label><input class="inp left" type="datetime-local" id="nS" value="${localDT(Date.now() + 3600e3)}"></div>
    <div class="row"><button class="btn" data-x>취소</button><button class="btn pri" data-ok>올리기</button></div>`,
    (m, done) => {
      $$('[data-ty]', m).forEach(b => (b.onclick = () => { type = b.dataset.ty; $$('[data-ty]', m).forEach(x => x.classList.toggle('on', x === b)); $('#nLive').hidden = type !== 'live'; }));
      m.querySelector('[data-x]').onclick = () => done(null);
      m.querySelector('[data-ok]').onclick = () => done({ t: $('#nT').value.trim(), b: $('#nB').value.trim(), s: new Date($('#nS').value).getTime() });
    });
  if (!r) return;
  if (!r.t) return toast('제목을 입력해 주세요');
  Store.insert('notice', { artist_id: aid, type, title: r.t, body: r.b, start: type === 'live' ? r.s : null, at: Date.now() });
  toast(type === 'live' ? '라이브 알림을 올렸어요 🔴' : '공지를 올렸어요');
}
function renderNotice(id) {
  const n = Store.get(id); if (!n || n._kind !== 'notice') return back();
  const a = A(n.artist_id);
  const owner = isArtist() && session.id === n.artist_id;
  const now = Date.now(), on = n.type === 'live' && n.start <= now && now <= n.start + 2 * 3600e3;
  app().innerHTML = `<div class="screen">
    <header class="topbar"><button class="icon-btn" id="bk">${I.back}</button><div class="title">${n.type === 'live' ? '라이브 알림' : '공지사항'}</div>${owner ? `<button class="icon-btn" id="del" style="color:#b0b0b8">${I.trash}</button>` : '<div class="spacer"></div>'}</header>
    <div class="scroll" style="padding:8px 20px 40px">
      <div class="row" style="gap:10px;margin-bottom:14px">${avatarHTML(a, 36)}<b>${esc(a?.name || '')}</b></div>
      ${n.type === 'live' ? `<div class="live-box ${on ? 'on' : ''}"><div class="lb1">${on ? '● 지금 라이브 중!' : '🔔 라이브 예정'}</div><div class="lb2">${fmtDate(n.start)} ${fmtTime(n.start)}</div></div>` : ''}
      <div style="font-size:19px;font-weight:800;line-height:1.4">${esc(n.title)}</div>
      <div class="hint" style="margin:6px 0 18px">${fmtDate(n.at)}</div>
      <div style="white-space:pre-wrap;line-height:1.7;font-size:15px">${esc(n.body)}</div>
    </div>
  </div>`;
  $('#bk').onclick = () => back();
  if (owner) $('#del').onclick = async () => { if (await confirmBox('삭제할까요?', '')) { Store.remove(id); back(); } };
}

/* =========================================================
   팬 화면
   ========================================================= */
function renderHome() {
  const f = meFan(); const subs = mySubs();
  const feed = subs.flatMap(a => posts(a.id, 'feed')).sort((x, y) => y.at - x.at).slice(0, 30);
  const others = artists().filter(a => !subOf(f, a.id));
  app().innerHTML = `<div class="screen">
    <header class="topbar left"><div class="title">${logo(22, '#ff4d6d', '#fff')}</div><button class="icon-btn" id="meBtn" style="width:auto">${avatarHTML(f, 32)}</button></header>
    <div class="scroll">
      ${subs.length ? `<div class="section-title">내 아티스트</div>
        <div class="circles">${subs.map(a => { const lv = liveState(a.id); const u = fanUnread(a.id); return `<button data-art="${a.id}">${avatarHTML(a, 64, lv?.on ? 'ring live' : u ? 'ring' : '')}${lv?.on ? '<span class="live-tag">LIVE</span>' : u ? `<span class="badge sm">${u}</span>` : ''}<span class="cn">${esc(a.name)}</span></button>`; }).join('')}
          <button id="findBtn"><div class="avatar find" style="width:64px;height:64px">＋</div><span class="cn">찾기</span></button></div>`
        : `<div class="home-hero"><div><div class="t1">${esc(josa(f.nickname))} 반가워!</div><div class="t2">좋아하는 아티스트의<br>멤버십에 가입해 보세요 💗</div></div><div class="emoji">🎤</div></div>`}
      ${feed.length ? `<div class="section-title">새 소식</div><div class="feed">${feed.map(p => postCard(p)).join('')}</div>` : ''}
      <div class="section-title" id="explore">아티스트 둘러보기 <small>${artists().length}명</small></div>
      ${(others.length ? others : []).map(a => `<button class="arti-row" data-art="${a.id}">${avatarHTML(a, 52)}<div class="meta"><div class="name">${esc(a.name)} ${I.check}</div><div class="preview">${esc(a.bio || `팬 ${fansOf(a.id).length}명`)}</div></div><span class="join-chip">보러가기</span></button>`).join('')
        || `<div class="hint" style="padding:0 20px 20px">${artists().length ? '모든 아티스트의 멤버십에 가입했어요! 🎉' : '아직 등록된 아티스트가 없어요'}</div>`}
      <div style="height:20px"></div>
    </div>
    ${tabbar('home')}
  </div>`;
  $('#meBtn').onclick = () => location.replace('#/my');
  $$('[data-art]').forEach(b => (b.onclick = () => go('artist/' + b.dataset.art)));
  const fb = $('#findBtn'); if (fb) fb.onclick = () => $('#explore').scrollIntoView({ behavior: 'smooth' });
  bindPosts(app()); bindTabs();
}

/* ---- 메시지 탭 (채팅 목록 + 편지함) ---- */
let msgTab = 'chat', letterTab = 'from';
const PAPERS = ['#fff4f6', '#fff8e1', '#eaf6ff', '#effbea', '#f5efff', '#ffffff'];
function previewText(m, nick) {
  if (!m) return '아직 메시지가 없어요';
  if (m.type === 'image') return '사진을 보냈어요 📷';
  if (m.type === 'voice') return '음성 메시지를 보냈어요 🎙️';
  if (m.type === 'video') return '영상을 보냈어요 🎬';
  if (m.type === 'sticker') return '스티커를 보냈어요 ' + m.text;
  if (m.type === 'card') return `${m.emoji || '🎉'} ${fill(m.title || '카드가 왔어요', nick)}`;
  return fill(m.text, nick);
}
function letterCard(l) {
  const a = A(l.artist_id), f = F(l.fan_id);
  const viewerFan = !isArtist();
  const isNew = viewerFan ? l.dir === 'from' && !LS.get(`lread.${meFan().id}`, []).includes(l.id) : l.dir === 'to' && !l.read;
  const head = l.dir === 'to' ? (viewerFan ? `To. ${a?.name || '?'}` : `From. ${f?.nickname || '?'}`) : `From. ${a?.name || '?'}`;
  return `<button class="letter-card" data-letter="${l.id}" style="background:${l.color || PAPERS[0]};border:1px solid rgba(0,0,0,.05)">
    <div class="stamp">${isNew ? '💌' : esc(l.stickers?.[0]?.e || a?.emoji || '✉️')}</div>
    <div class="to">${esc(head)} ${isNew ? '<b style="color:var(--pink)">NEW</b>' : ''}</div>
    <div class="tt">${esc(fill(l.title, f?.nickname || meFan()?.nickname) || '(제목 없음)')}</div>
    <div class="pv">${esc(fill(l.body, f?.nickname || meFan()?.nickname))}</div>
    <div class="dt">${fmtShort(l.at)}</div>
  </button>`;
}
function renderMsgs() {
  const f = meFan(); const subs = mySubs();
  const ul = fanUnreadLetters();
  let body;
  if (msgTab === 'chat') {
    body = subs.map(a => { const l = roomMsgs(a.id, f.id); const m = l[l.length - 1]; return { a, m, u: fanUnread(a.id) }; })
      .sort((x, y) => (y.m?.at || 0) - (x.m?.at || 0))
      .map(({ a, m, u }) => `<button class="arti-row" data-chat="${a.id}">${avatarHTML(a, 54, u ? 'ring' : '')}
        <div class="meta"><div class="name">${esc(a.name)} ${I.check}</div><div class="preview">${esc(previewText(m, f.nickname))}</div></div>
        <div class="side"><span class="time">${m ? fmtList(m.at) : ''}</span>${u ? `<span class="badge">${u > 99 ? '99+' : u}</span>` : '<span style="height:20px"></span>'}</div></button>`).join('')
      || '<div class="empty"><div class="big">💌</div>멤버십에 가입하면<br>아티스트의 프라이빗 메시지를 받을 수 있어요</div>';
  } else {
    const list = fanLetters(f).filter(l => l.dir === letterTab).sort((a, b) => b.at - a.at);
    body = `<div style="padding:0 16px 8px"><div class="seg"><button data-lt="from" class="${letterTab === 'from' ? 'on' : ''}">받은 편지</button><button data-lt="to" class="${letterTab === 'to' ? 'on' : ''}">보낸 편지</button></div></div>
      ${list.map(letterCard).join('') || `<div class="empty"><div class="big">${letterTab === 'from' ? '📭' : '✏️'}</div>${letterTab === 'from' ? '아직 받은 편지가 없어요' : '아티스트에게 첫 편지를 써볼까?'}</div>`}`;
  }
  app().innerHTML = `<div class="screen">
    <header class="topbar left"><div class="title">메시지</div></header>
    <div class="toptabs"><button data-mt="chat" class="${msgTab === 'chat' ? 'on' : ''}">프라이빗 메시지${totalFanUnread() ? ` <b>${totalFanUnread()}</b>` : ''}</button><button data-mt="letter" class="${msgTab === 'letter' ? 'on' : ''}">편지함${ul ? ` <b>${ul}</b>` : ''}</button></div>
    <div class="scroll">${body}<div style="height:90px"></div></div>
    ${msgTab === 'letter' && subs.length ? `<button class="fab" id="wr">${I.pen}</button>` : ''}
    ${tabbar('msgs')}
  </div>`;
  $$('[data-mt]').forEach(b => (b.onclick = () => { msgTab = b.dataset.mt; renderMsgs(); }));
  $$('[data-lt]').forEach(b => (b.onclick = () => { letterTab = b.dataset.lt; renderMsgs(); }));
  $$('[data-chat]').forEach(b => (b.onclick = () => go('chat/' + b.dataset.chat)));
  $$('[data-letter]').forEach(b => (b.onclick = () => go('letter/' + b.dataset.letter)));
  const wr = $('#wr'); if (wr) wr.onclick = () => { draft = null; go('write'); };
  bindTabs();
}

/* =========================================================
   채팅 (팬 화면 / 아티스트 화면 공용)
   ========================================================= */
let chatCtx = null; // { aid, fid (null = 모든 팬), viewer: 'fan' | 'artist' }
let chatSig = '', chatSearch = null, popReact = null;
const freshIds = new Set();
const reactId = (mid, fid) => `rc_${mid}_${fid}`;
function chatList() {
  const { aid, fid, viewer } = chatCtx;
  if (viewer === 'artist' && !fid) return broadcastMsgs(aid);
  return roomMsgs(aid, fid);
}
function chatTyping() {
  const { aid, fid, viewer } = chatCtx; if (viewer !== 'fan') return false;
  const now = Date.now();
  return Store.all('message', m => m.artist_id === aid && m.fan_id === fid && m.from === 'artist' && m.at > now && m.at - now < 8000).length > 0;
}
function reactChip(m) {
  if (m.from !== 'artist') return '';
  const { fid, viewer } = chatCtx;
  if (viewer === 'artist' && !fid) {
    const rs = Store.all('react', r => r.target === m.id);
    if (!rs.length) return '';
    const cnt = {}; rs.forEach(r => (cnt[r.emoji] = (cnt[r.emoji] || 0) + 1));
    return `<span class="react multi">${Object.entries(cnt).map(([e, n]) => `${e}${n}`).join(' ')}</span>`;
  }
  const r = Store.get(reactId(m.id, fid));
  return r ? `<span class="react ${popReact === m.id ? 'pop' : ''}">${r.emoji}</span>` : '';
}
function msgHTML(m, cont, showTime) {
  const { aid, fid, viewer } = chatCtx;
  const a = A(aid), fan = fid ? F(fid) : null;
  const mine = viewer === 'fan' ? m.from === 'fan' : m.from === 'artist';
  const who = m.from === 'artist' ? a : fan;
  const whoName = m.from === 'artist' ? a?.name : fan?.nickname;
  const nick = fan?.nickname || '';
  let content;
  if (m.type === 'image') content = `<div class="bubble photo" data-media="${m.id}"><img ${srcAttr(m.media)} alt=""></div>`;
  else if (m.type === 'video') content = `<div class="bubble photo vid" data-media="${m.id}"><video ${srcAttr(m.media, '#t=0.1')} preload="metadata" muted playsinline></video><span class="vplay">${I.play}</span></div>`;
  else if (m.type === 'sticker') content = `<div class="sticker">${esc(m.text)}</div>`;
  else if (m.type === 'card') content = `<div class="bubble card" style="background:linear-gradient(135deg, ${a.color}, ${hexMix(a.color, '#ffb36b', 0.5)})"><div class="ce">${esc(m.emoji || '🎉')}</div><div class="ct">${esc(fill(m.title || '', nick))}</div><div class="cx">${esc(fill(m.text, nick))}</div>${m.points ? `<div class="cp">💗 하트 +${m.points}</div>` : ''}</div>`;
  else if (m.type === 'voice') {
    const bars = Array.from({ length: 22 }, (_, i) => `<i style="height:${6 + Math.round(Math.abs(Math.sin(i * 1.7 + (m.at % 7))) * 14)}px"></i>`).join('');
    content = `<div class="bubble voice" data-voice="${m.id}"><span class="play">${I.play}</span><span class="wave">${bars}</span><span class="dur">${fmtDur(m.dur || 0)}</span></div>`;
  } else content = `<div class="bubble" data-text="${m.id}">${esc(m.from === 'artist' ? fill(m.text, nick) : m.text)}</div>`;
  if (m.from === 'artist') content = `<div class="bw" ${viewer === 'fan' ? `data-rid="${m.id}"` : ''}>${content}${reactChip(m)}</div>`;
  const tag = viewer === 'artist' && (m.auto || m.virtual) ? `<span class="mtag">${m.auto ? '자동' : esc(m.virtual)}</span>` : '';
  const tm = showTime ? `<span class="tm">${tag}${fmtTime(m.at)}</span>` : tag ? `<span class="tm">${tag}</span>` : '';
  const hasReact = m.from === 'artist' && reactChip(m);
  return `<div class="msg ${mine ? 'me' : ''} ${cont ? 'cont' : ''} ${freshIds.has(m.id) ? 'msg-in' : ''} ${hasReact ? 'has-react' : ''}" data-id="${m.id}">
    ${mine ? '' : `<div class="av-slot">${cont ? '' : avatarHTML(who, 38)}</div>`}
    <div class="col">${mine ? '' : `<div class="who">${esc(whoName || '')}</div>`}<div class="line">${content}${tm}</div></div>
  </div>`;
}
function renderChatBody(force) {
  const body = $('#chatBody'); if (!body || !chatCtx) return;
  const list = chatList(); const typing = chatTyping();
  const sig = `${list.length}:${list[list.length - 1]?.id}:${typing}:${Store.all('react').length}`;
  if (!force && sig === chatSig) return;
  const grew = !chatSig || +chatSig.split(':')[0] < list.length || typing;
  chatSig = sig;
  const prevTop = body.scrollTop;
  const minute = ts => Math.floor(ts / 60000);
  let html = '', lastDay = '';
  list.forEach((m, i) => {
    const d = dayKey(m.at);
    let prev = list[i - 1]; const next = list[i + 1];
    if (d !== lastDay) { html += `<div class="date-chip">${fmtDate(m.at)}</div>`; lastDay = d; prev = null; }
    const cont = prev && prev.from === m.from && minute(prev.at) === minute(m.at) && prev.type !== 'card' && m.type !== 'card';
    const nextSame = next && next.from === m.from && minute(next.at) === minute(m.at) && dayKey(next.at) === d;
    html += msgHTML(m, cont, !nextSame);
  });
  const a = A(chatCtx.aid);
  if (!list.length) html = `<div class="empty"><div class="big">💌</div>${chatCtx.viewer === 'artist' ? (chatCtx.fid ? '아직 대화가 없어요' : '모든 팬에게 첫 메시지를 보내보세요!') : esc(a.name) + '의 첫 메시지를 기다리고 있어요'}</div>`;
  if (typing) {
    const last = list[list.length - 1]; const cont = last && last.from === 'artist';
    html += `<div class="msg ${cont ? 'cont' : ''} msg-in"><div class="av-slot">${cont ? '' : avatarHTML(a, 38)}</div><div class="col">${cont ? '' : `<div class="who">${esc(a.name)}</div>`}<div class="bubble typing"><i></i><i></i><i></i></div></div></div>`;
  }
  // 새로 도착한 메시지 애니메이션
  freshIds.clear();
  body.innerHTML = html;
  popReact = null;
  body.dataset.keep = grew ? '' : '1';
  body.scrollTop = grew ? body.scrollHeight : prevTop;
  if (chatCtx.viewer === 'fan') LS.set(`read.${chatCtx.fid}.${chatCtx.aid}`, Date.now());
  else if (chatCtx.fid) LS.set(`aread.${chatCtx.aid}.${chatCtx.fid}`, Date.now());
}
function chatScreenHTML(title, rightBtns, composerExtra) {
  return `<div class="screen chat">
    <header class="topbar"><button class="icon-btn" id="bk">${I.back}</button><div class="title">${title}</div>${rightBtns}</header>
    <div id="searchSlot"></div>
    <div class="chat-body" id="chatBody"></div>
    <div id="emojiSlot"></div>
    <div class="composer">
      <button class="icon-btn" id="em" style="color:#9a9aa3">${I.smile}</button>${composerExtra || ''}
      <div class="field"><textarea id="tx" rows="1" maxlength="500" placeholder="메시지 입력"></textarea><button class="send" id="sd">${I.send}</button></div>
    </div>
  </div>`;
}
function bindChatCommon(onSend, stickersOn) {
  chatSig = '';
  renderChatBody(true);
  $('#bk').onclick = () => back();
  const tx = $('#tx'), sd = $('#sd');
  tx.oninput = () => { tx.style.height = 'auto'; tx.style.height = Math.min(tx.scrollHeight, 110) + 'px'; sd.classList.toggle('on', !!tx.value.trim()); };
  tx.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.innerWidth > 600) { e.preventDefault(); sd.click(); } };
  sd.onclick = () => { const v = tx.value.trim(); if (!v) return; onSend('text', v); tx.value = ''; tx.oninput(); tx.focus(); };
  const slot = $('#emojiSlot');
  const drawPanel = tab => {
    const items = tab === 'sticker' ? ownedStickers() : EMOJIS;
    slot.innerHTML = `<div class="panel"><div class="ptabs">${stickersOn ? `<button data-pt="sticker" class="${tab === 'sticker' ? 'on' : ''}">스티커</button>` : ''}<button data-pt="emoji" class="${tab === 'emoji' ? 'on' : ''}">이모지</button><span style="flex:1"></span>${stickersOn ? '<button data-shop>🛒 스티커 상점</button>' : ''}</div>
      <div class="pgrid ${tab}">${items.map(e => `<button data-pi="${e}">${e}</button>`).join('')}</div></div>`;
    $$('[data-pt]', slot).forEach(b => (b.onclick = () => drawPanel(b.dataset.pt)));
    const sh = $('[data-shop]', slot); if (sh) sh.onclick = () => go('shop');
    $$('[data-pi]', slot).forEach(b => (b.onclick = () => {
      if (tab === 'sticker') { onSend('sticker', b.dataset.pi); slot.innerHTML = ''; }
      else { tx.value += b.dataset.pi; tx.oninput(); }
    }));
  };
  $('#em').onclick = () => { if (slot.innerHTML) slot.innerHTML = ''; else drawPanel(stickersOn ? 'sticker' : 'emoji'); };
  const body = $('#chatBody');
  body.addEventListener('load', () => { if (!chatSearch && !body.dataset.keep) body.scrollTop = body.scrollHeight; }, true);
  body.onclick = e => {
    if (body._suppress) { body._suppress = false; return; }
    const md = e.target.closest('[data-media]');
    if (md) { const list = chatList().filter(m => m.type === 'image' || m.type === 'video'); return openViewer(list, list.findIndex(x => x.id === md.dataset.media)); }
    const v = e.target.closest('[data-voice]');
    if (v) { const m = chatList().find(x => x.id === v.dataset.voice); if (m) toggleVoice(v, m); }
  };
}
function bindReactions() {
  const body = $('#chatBody');
  let lp = null, lastTap = { id: null, t: 0 };
  body.addEventListener('pointerdown', e => {
    const bw = e.target.closest('[data-rid]'); if (!bw) return;
    const now = Date.now();
    if (lastTap.id === bw.dataset.rid && now - lastTap.t < 350) { lastTap = { id: null, t: 0 }; body._suppress = true; return setReact(bw.dataset.rid, '💗'); }
    lastTap = { id: bw.dataset.rid, t: now };
    lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { body._suppress = true; lp = null; openReact(bw); }, 450) };
  });
  const cancel = e => { if (lp && (e.type !== 'pointermove' || Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8)) { clearTimeout(lp.t); lp = null; } };
  ['pointerup', 'pointercancel', 'pointermove'].forEach(ev => body.addEventListener(ev, cancel));
  body.addEventListener('contextmenu', e => { if (e.target.closest('[data-rid]')) e.preventDefault(); });
}
const REACTS = ['💗', '⭐', '😆', '😮', '😢', '👍'];
function setReact(mid, e) {
  const id = reactId(mid, chatCtx.fid); const cur = Store.get(id);
  if (cur && cur.emoji === e) Store.remove(id);
  else { Store.set('react', { target: mid, user: myKey(), emoji: e, artist_id: chatCtx.aid }, id); popReact = mid; }
  renderChatBody(true);
}
function openReact(bw) {
  const mid = bw.dataset.rid; const cur = Store.get(reactId(mid, chatCtx.fid));
  const ar = app().getBoundingClientRect(), r = bw.getBoundingClientRect();
  const wrap = document.createElement('div'); wrap.className = 'react-layer';
  wrap.innerHTML = `<div class="react-pick" style="top:${Math.max(60, r.top - ar.top - 58)}px;left:${Math.min(Math.max(8, r.left - ar.left), ar.width - 290)}px">${REACTS.map(e => `<button class="${cur?.emoji === e ? 'on' : ''}" data-re="${e}">${e}</button>`).join('')}</div>`;
  wrap.onclick = ev => { const b = ev.target.closest('[data-re]'); wrap.remove(); if (b) setReact(mid, b.dataset.re); };
  app().appendChild(wrap);
  if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) {}
}

/* ---- 팬: 아티스트와의 채팅 ---- */
function pickReply(replies, text) {
  const lines = String(replies || '').split('\n').map(s => s.trim()).filter(Boolean);
  const rules = [], generic = [];
  lines.forEach(l => { const i = l.indexOf('=>'); if (i > 0) rules.push({ keys: l.slice(0, i).split(',').map(s => s.trim()).filter(Boolean), reply: l.slice(i + 2).trim() }); else generic.push(l); });
  const hit = text && rules.find(r => r.keys.some(k => text.includes(k)));
  if (hit) return hit.reply;
  return generic.length ? pick(generic) : null;
}
function autoReply(a, f, text, pool) {
  if (!a.auto_reply) return;
  const now = Date.now();
  if (Store.all('message', m => m.artist_id === a.id && m.fan_id === f.id && m.auto && m.at > now).length) return;
  const reply = pool ? pick(pool) : pickReply(a.replies, text);
  if (!reply) return;
  Store.insert('message', { artist_id: a.id, fan_id: f.id, from: 'artist', type: 'text', text: reply, at: now + 2500 + Math.random() * 4000, auto: true });
}
function renderChat(aid) {
  const a = A(aid), f = meFan();
  if (!a) return back();
  if (!subOf(f, aid)) { toast('멤버십에 가입하면 메시지를 주고받을 수 있어요'); return location.replace('#/artist/' + aid); }
  chatCtx = { aid, fid: f.id, viewer: 'fan' }; current.name = 'chat'; chatSearch = null;
  app().innerHTML = chatScreenHTML(esc(a.name), `<button class="icon-btn" id="sr">${I.search}</button><button class="icon-btn" id="mn">${I.menu}</button>`);
  bindChatCommon((type, text) => {
    const m = Store.insert('message', { artist_id: aid, fan_id: f.id, from: 'fan', type, text, at: Date.now() });
    freshIds.add(m.id);
    autoReply(a, f, type === 'sticker' ? '' : text);
    msgPoint();
    renderChatBody(true);
  }, true);
  bindReactions();
  $('#mn').onclick = () => openDrawer(a);
  $('#sr').onclick = toggleSearch;
}
function toggleSearch() {
  const slot = $('#searchSlot');
  if (chatSearch) { chatSearch = null; slot.innerHTML = ''; $$('.bubble.hl').forEach(b => b.classList.remove('hl')); return; }
  chatSearch = { q: '', hits: [], idx: 0 };
  slot.innerHTML = `<div class="searchbar"><input id="sq" placeholder="대화 내용 검색" autocomplete="off"><span class="cnt" id="sc"></span><button class="icon-btn" id="sup">${I.up}</button><button class="icon-btn" id="sdn">${I.down}</button></div>`;
  const inp = $('#sq'); inp.focus();
  const show = () => {
    $$('.bubble.hl').forEach(b => b.classList.remove('hl'));
    const { hits, idx } = chatSearch;
    $('#sc').textContent = hits.length ? `${idx + 1}/${hits.length}` : chatSearch.q ? '0' : '';
    const el = hits[idx]; if (el) { el.classList.add('hl'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  };
  inp.oninput = () => { const q = inp.value.trim(); chatSearch.q = q; chatSearch.hits = q ? $$('[data-text]').filter(b => b.textContent.includes(q)) : []; chatSearch.idx = chatSearch.hits.length - 1; show(); };
  $('#sup').onclick = () => { if (chatSearch.idx > 0) { chatSearch.idx--; show(); } };
  $('#sdn').onclick = () => { if (chatSearch.idx < chatSearch.hits.length - 1) { chatSearch.idx++; show(); } };
}
function openDrawer(a) {
  const media = artistMedia(a.id);
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="dim"></div><aside class="drawer"><div class="scroll">
      <div class="prof">${avatarHTML(a, 88)}<div class="n">${esc(a.name)} ${I.check}</div><div class="b">${esc(a.bio || '')}</div></div>
      <div class="section-title">사진·영상 <small>${media.length}</small></div>
      ${media.length ? `<div class="grid">${media.slice(0, 9).map((m, i) => `<button data-mi="${i}">${thumbHTML(m)}</button>`).join('')}</div>` : '<div class="hint" style="padding:0 20px">아직 받은 사진이 없어요</div>'}
      <div style="height:12px"></div>
      <button class="menu-item" id="dpage">아티스트 페이지 <span class="r">›</span></button>
      <button class="menu-item" id="dalb">앨범 전체 보기 <span class="r">›</span></button>
      <button class="menu-item" id="dsnd">알림 소리 <span class="toggle ${LS.get('sound', true) ? 'on' : ''}"></span></button>
    </div></aside>`;
  app().appendChild(wrap);
  const close = () => wrap.remove();
  $('.dim', wrap).onclick = close;
  $$('[data-mi]', wrap).forEach(b => (b.onclick = () => openViewer(media, +b.dataset.mi)));
  $('#dpage').onclick = () => { close(); go('artist/' + a.id); };
  $('#dalb').onclick = () => { close(); go('album/' + a.id); };
  $('#dsnd').onclick = () => { LS.set('sound', !LS.get('sound', true)); $('#dsnd .toggle').classList.toggle('on', LS.get('sound', true)); };
}

/* ---- 편지 쓰기 (팬 → 아티스트) ---- */
let draft = null;
const INKS = ['#1f1f24', '#ff4d6d', '#ff8a3d', '#3bb273', '#2f9cf4', '#6c5ce7', '#8d6e63'];
function stickerLayer(list, edit) {
  return (list || []).map((s, i) => `<span class="lst ${edit ? 'edit' : ''}" data-si="${i}" style="left:${s.x}%;top:${s.y}%;--rot:${s.r || 0}deg">${esc(s.e)}</span>`).join('');
}
function renderWrite(toId) {
  const subs = mySubs();
  if (!subs.length) { toast('멤버십에 가입한 아티스트에게 편지를 쓸 수 있어요'); return back(); }
  current.live = false;
  if (!draft) draft = { aid: toId && subs.some(a => a.id === toId) ? toId : subs[0].id, color: PAPERS[0], title: '', body: '', ink: INKS[0], stickers: [] };
  const a = A(draft.aid) || subs[0]; draft.aid = a.id;
  const sc = $('.scroll')?.scrollTop || 0;
  app().innerHTML = `<div class="screen">
    <header class="topbar"><button class="icon-btn" id="bk">${I.close}</button><div class="title">편지 쓰기</div><button class="btn sm pri" id="sendL">보내기</button></header>
    <div class="scroll">
      <div class="chips">${subs.map(x => `<button class="chip ${x.id === a.id ? 'on' : ''}" data-to="${x.id}">${esc(x.name)}</button>`).join('')}</div>
      <div class="deco-row"><span>편지지</span>${PAPERS.map(c => `<button class="swatch ${c === draft.color ? 'on' : ''}" data-c="${c}" style="background:${c};box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)"></button>`).join('')}</div>
      <div class="deco-row"><span>글자색</span>${INKS.map(c => `<button class="swatch sm ${c === draft.ink ? 'on' : ''}" data-ink="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="deco-row tray"><span>스티커</span>${ownedStickers().map(e => `<button data-st="${e}">${e}</button>`).join('')}<button class="more" data-shop>🛒</button></div>
      <div class="paper" id="paper" style="background-color:${draft.color};color:${draft.ink}">
        <div class="to">To. ${esc(a.name)}</div>
        <input id="lt" maxlength="30" placeholder="제목" value="${esc(draft.title)}" style="color:${draft.ink}">
        <textarea id="lb" placeholder="하고 싶은 말을 적어봐 ✏️" style="color:${draft.ink}">${esc(draft.body)}</textarea>
        <div class="from">From. ${esc(meFan().nickname)}</div>
        ${stickerLayer(draft.stickers, true)}
      </div>
      <div class="hint" style="text-align:center;padding:0 20px 30px">스티커는 손가락으로 끌어서 옮기고, 두 번 톡톡 누르면 지워져요</div>
    </div>
  </div>`;
  $('.scroll').scrollTop = sc;
  $('#lt').oninput = e => (draft.title = e.target.value);
  $('#lb').oninput = e => (draft.body = e.target.value);
  $$('[data-to]').forEach(b => (b.onclick = () => { draft.aid = b.dataset.to; renderWrite(); }));
  $$('[data-c]').forEach(b => (b.onclick = () => { draft.color = b.dataset.c; renderWrite(); }));
  $$('[data-ink]').forEach(b => (b.onclick = () => { draft.ink = b.dataset.ink; renderWrite(); }));
  $$('[data-st]').forEach(b => (b.onclick = () => {
    if (draft.stickers.length >= 20) return toast('스티커는 20개까지 붙일 수 있어요');
    draft.stickers.push({ e: b.dataset.st, x: 15 + Math.random() * 70, y: 20 + Math.random() * 60, r: Math.round(Math.random() * 40 - 20) });
    renderWrite();
  }));
  $('[data-shop]').onclick = () => go('shop');
  const paper = $('#paper');
  $$('.lst', paper).forEach(el => {
    const i = +el.dataset.si; let drag = null;
    el.onpointerdown = e => {
      e.preventDefault();
      const now = Date.now();
      if (now - (el._t || 0) < 350) { draft.stickers.splice(i, 1); renderWrite(); return; }
      el._t = now; el.setPointerCapture(e.pointerId); drag = true; el.classList.add('drag');
    };
    el.onpointermove = e => {
      if (!drag) return;
      const r = paper.getBoundingClientRect(); const s = draft.stickers[i];
      s.x = Math.min(96, Math.max(4, ((e.clientX - r.left) / r.width) * 100));
      s.y = Math.min(97, Math.max(3, ((e.clientY - r.top) / r.height) * 100));
      el.style.left = s.x + '%'; el.style.top = s.y + '%';
    };
    el.onpointerup = el.onpointercancel = () => { drag = null; el.classList.remove('drag'); };
  });
  $('#bk').onclick = async () => {
    if ((draft.title || draft.body) && !(await confirmBox('편지 쓰기를 그만할까요?', '쓰던 내용은 사라져요', '그만하기', '계속 쓰기'))) return;
    draft = null; back();
  };
  $('#sendL').onclick = async () => {
    if (!draft.body.trim()) { toast('편지 내용을 적어줘!'); $('#lb').focus(); return; }
    if (!(await confirmBox(`${a.name}에게 편지를 보낼까요?`, '', '보내기'))) return;
    const f = meFan();
    Store.insert('letter', { artist_id: a.id, fan_id: f.id, dir: 'to', title: draft.title.trim(), body: draft.body, color: draft.color, ink: draft.ink, stickers: draft.stickers, at: Date.now(), read: false });
    autoReply(a, f, '', LETTER_THANKS);
    draft = null; msgTab = 'letter'; letterTab = 'to';
    toast('편지를 보냈어요 💌'); addPoints(5, '편지');
    back();
  };
}
function renderLetter(id) {
  const l = Store.get(id); if (!l || l._kind !== 'letter') return back();
  const a = A(l.artist_id), fan = F(l.fan_id);
  if (!isArtist() && l.dir === 'from') { const k = `lread.${meFan().id}`; const r = LS.get(k, []); if (!r.includes(id)) LS.set(k, [...r, id]); }
  if (isArtist() && l.dir === 'to' && !l.read) Store.update(id, { read: true });
  const nick = fan?.nickname || meFan()?.nickname || '';
  const toName = l.dir === 'to' ? a?.name : fan ? fan.nickname : isArtist() ? '모든 팬' : nick;
  const fromName = l.dir === 'to' ? fan?.nickname : a?.name;
  const canReply = isArtist() ? l.dir === 'to' && fan : l.dir === 'from' && a && subOf(meFan(), a.id);
  app().innerHTML = `<div class="screen">
    <header class="topbar"><button class="icon-btn" id="bk">${I.back}</button><div class="title">${l.dir === 'to' ? (isArtist() ? '받은 편지' : '보낸 편지') : isArtist() ? '보낸 편지' : '받은 편지'}</div><div class="spacer"></div></header>
    <div class="scroll">
      <div class="paper" style="background-color:${l.color || PAPERS[0]};color:${l.ink || 'inherit'}">
        <div class="to">To. ${esc(toName || '')}</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">${esc(fill(l.title, nick))}</div>
        <div class="body">${esc(fill(l.body, nick))}</div>
        <div class="from">From. ${esc(fromName || '')}</div>
        <div class="hint" style="text-align:right">${fmtDate(l.at)}</div>
        ${stickerLayer(l.stickers, false)}
      </div>
      ${canReply ? `<div style="padding:0 16px 30px"><button class="btn full pri" id="rep">${isArtist() ? `${esc(fan.nickname)}에게 답장하기` : `${esc(a.name)}에게 답장 편지 쓰기`}</button></div>` : ''}
    </div>
  </div>`;
  $('#bk').onclick = () => back();
  const rep = $('#rep');
  if (rep) rep.onclick = () => { if (isArtist()) { pc = null; go('compose/' + fan.id); } else { draft = null; go('write/' + a.id); } };
}

/* ---- 놀이터 ---- */
const STAMP_FACES = ['🎤', '💗', '⭐', '🌈', '🍓', '🦄', '🌸', '🎀', '🍭', '🏆'];
let justStamped = false;
function doStamp() {
  const f = meFan(); if (!f) return null;
  const tk = todayKey(), st = f.stamps || { last: '', count: 0 };
  if (st.last === tk) return null;
  const count = st.count + 1, bonus = count % 10 === 0;
  Store.update(f.id, { stamps: { last: tk, count }, points: (f.points || 0) + 3 });
  if (bonus) {
    const subs = mySubs(); const a = subs.length ? pick(subs) : null;
    if (a) Store.insert('message', { artist_id: a.id, fan_id: f.id, from: 'artist', type: 'card', emoji: '🏆', title: '출석 도장 10개 달성!', text: '{이름아} 도장 10개를 다 모았구나! 정말 대단해 👏 칭찬 하트 20개 선물이야 💗', points: 20, at: Date.now() + 2500, auto: true });
    else Store.update(f.id, { points: (f.points || 0) + 23 });
  }
  return { bonus };
}
function stampFeedback(r) { if (!r) return; floatPoint(3, '출석'); if (r.bonus) { setTimeout(() => floatPoint(20, '도장 10개!'), 700); confetti(); } }
function maybeStampPrompt() {
  const f = meFan();
  if (!f || f.stamps?.last === todayKey() || $('#modal-root').innerHTML) return;
  modal(`<div style="font-size:50px">📅</div><h2>${esc(josa(f.nickname))} 왔구나!</h2><p>오늘의 출석 도장을 찍어볼까?</p><div class="row"><button class="btn" data-x>나중에</button><button class="btn pri" data-ok>도장 쾅!</button></div>`,
    (m, done) => { m.querySelector('[data-x]').onclick = () => done(false); m.querySelector('[data-ok]').onclick = () => done(true); })
    .then(ok => { if (!ok) return; const r = doStamp(); if (!r) return; justStamped = true; if (current.name === 'play') renderPlay(); else location.replace('#/play'); stampFeedback(r); });
}
function renderPlay() {
  const f = meFan(); const tk = todayKey(), st = f.stamps || { last: '', count: 0 }, done = st.last === tk;
  const filled = st.count % 10 || (st.count > 0 && done ? 10 : 0);
  const slots = Array.from({ length: 10 }, (_, i) => {
    if (i < filled) return `<div class="slot on ${justStamped && i === filled - 1 ? 'pop' : ''}"><span>${STAMP_FACES[i]}</span></div>`;
    if (i === filled && !done) return '<button class="slot today" id="stampSlot">오늘</button>';
    return `<div class="slot">${i + 1}</div>`;
  }).join('');
  justStamped = false;
  const rows = mySubs().map(a => { const ml = artistMedia(a.id); return `<button class="arti-row" data-album="${a.id}">${avatarHTML(a, 46)}<div class="meta"><div class="name">${esc(a.name)} 앨범</div><div class="preview">사진·영상 ${ml.length}개</div></div><span style="color:var(--sub)">›</span></button>`; }).join('');
  app().innerHTML = `<div class="screen">
    <header class="topbar left"><div class="title">놀이터</div></header>
    <div class="scroll">
      <div class="pt-card"><div><div class="t1">내 하트</div><div class="t2">💗 ${points()}</div></div><button class="btn-white" id="toShop" style="width:auto;padding:11px 16px;font-size:14px">🛒 스티커 상점</button></div>
      <div class="section-title">출석 도장판 <small>모은 도장 ${st.count}개</small></div>
      <div class="stamp-board">${slots}</div>
      <div style="padding:0 16px">
        <button class="btn full ${done ? '' : 'pri'}" id="stampBtn" ${done ? 'disabled' : ''} style="margin-top:12px">${done ? '오늘 도장 완료! 내일 또 만나 👋' : '도장 쾅! 찍기'}</button>
        <div class="hint" style="text-align:center">하루에 한 번! 10개를 모으면 아티스트가 칭찬해 줘요 🏆</div>
      </div>
      <div class="section-title" style="margin-top:10px">아티스트 앨범</div>
      ${rows || '<div class="hint" style="padding:0 20px">멤버십에 가입하면 앨범이 생겨요</div>'}
      <div class="info-box" style="margin-top:14px">
        <h3>💗 하트 모으는 방법</h3>
        <div class="info-row"><span>메시지·스티커·글 쓰기 (하루 10번까지)</span><span>+1</span></div>
        <div class="info-row"><span>편지 보내기</span><span>+5</span></div>
        <div class="info-row"><span>출석 도장</span><span>+3</span></div>
        <div class="info-row"><span>도장 10개 모으기</span><span>+20</span></div>
        <div class="info-row"><span>아티스트의 칭찬 선물</span><span>🎁</span></div>
      </div>
      <div style="height:20px"></div>
    </div>
    ${tabbar('play')}
  </div>`;
  const stamp = () => { const r = doStamp(); if (r) { justStamped = true; renderPlay(); stampFeedback(r); } };
  $('#stampBtn').onclick = stamp;
  const ss = $('#stampSlot'); if (ss) ss.onclick = stamp;
  $('#toShop').onclick = () => go('shop');
  $$('[data-album]').forEach(b => (b.onclick = () => go('album/' + b.dataset.album)));
  bindTabs();
}
function renderShop() {
  const f = meFan(); if (!f) return back();
  app().innerHTML = `<div class="screen">
    <header class="topbar"><button class="icon-btn" id="bk">${I.back}</button><div class="title">스티커 상점</div><div class="spacer"></div></header>
    <div class="scroll">
      <div class="pt-card" style="margin-top:4px"><div><div class="t1">내 하트</div><div class="t2">💗 ${points()}</div></div><div style="font-size:40px">🛍️</div></div>
      ${PACKS.map(p => { const own = (f.packs || []).includes(p.id); return `<div class="pack ${own ? 'own' : ''}"><div class="ph"><b>${esc(p.name)}</b>${own ? '<span class="owned">보유중 ✓</span>' : `<button class="btn sm pri" data-buy="${p.id}">💗 ${p.price}</button>`}</div><div class="pitems">${p.items.map(e => `<span>${e}</span>`).join('')}</div></div>`; }).join('')}
      <div class="hint" style="text-align:center;padding:6px 20px 30px">산 스티커는 채팅방 😊 버튼과 편지 꾸미기에서 쓸 수 있어요</div>
    </div>
  </div>`;
  $('#bk').onclick = () => back('play');
  $$('[data-buy]').forEach(b => (b.onclick = async () => {
    const p = PACKS.find(x => x.id === b.dataset.buy);
    if (points() < p.price) return toast(`하트가 ${p.price - points()}개 더 필요해요 💗`);
    if (!(await confirmBox(p.name, `하트 ${p.price}개로 살까요?`, '살래요', '아니요'))) return;
    const me = meFan();
    Store.update(me.id, { packs: [...(me.packs || []), p.id], points: (me.points || 0) - p.price });
    confetti(); toast('스티커를 샀어요! 🎉');
  }));
}
function renderAlbum(aid) {
  const a = A(aid); if (!a) return back();
  const list = artistMedia(aid);
  let html = '', lastMonth = '';
  list.forEach((m, i) => {
    const d = new Date(m.at), mk = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    if (mk !== lastMonth) { if (lastMonth) html += '</div>'; html += `<div class="section-title">${mk}</div><div class="agrid">`; lastMonth = mk; }
    html += `<button data-ai="${i}">${thumbHTML(m)}</button>`;
  });
  if (lastMonth) html += '</div>';
  app().innerHTML = `<div class="screen">
    <header class="topbar"><button class="icon-btn" id="bk">${I.back}</button><div class="title">${esc(a.name)} 앨범</div><div class="spacer"></div></header>
    <div class="scroll">
      <div class="my-head" style="padding-top:4px">${avatarHTML(a, 54)}<div><div class="n" style="font-size:17px">${esc(a.name)}</div><div class="s">사진·영상 ${list.length}개</div></div></div>
      ${html || `<div class="empty"><div class="big">🖼️</div>아직 사진이 없어요</div>`}
      <div style="height:30px"></div>
    </div>
  </div>`;
  $('#bk').onclick = () => back();
  $$('[data-ai]').forEach(b => (b.onclick = () => openViewer(list, +b.dataset.ai)));
}

/* ---- 마이 (팬) ---- */
function renderMy() {
  const f = meFan();
  const days = Math.floor((Date.now() - f.created) / 86400000) + 1;
  const subs = mySubs();
  app().innerHTML = `<div class="screen">
    <header class="topbar left"><div class="title">마이</div></header>
    <div class="scroll">
      <div class="my-head">
        <button class="av-wrap" id="myAv">${avatarHTML(f, 68)}<span class="av-edit">${I.camera}</span></button>
        <div><div class="n">${esc(f.nickname)}</div><div class="s">뽀롱과 함께한 지 ${days}일째 💗</div></div>
      </div>
      <div class="section-title" style="padding-top:0">멤버십 카드 <small>${subs.length}개</small></div>
      <div class="cards">${subs.map(a => `<button data-art="${a.id}" style="flex:none;width:82%">${memberCardHTML(a, f)}</button>`).join('') || '<div class="hint">아직 가입한 멤버십이 없어요</div>'}</div>
      <div class="info-box">
        <h3>내 정보</h3>
        <div class="info-row"><span>닉네임</span><span>${esc(f.nickname)}</span></div>
        <div class="info-row"><span>생일</span><span><button class="link-btn dark" id="bday">${f.birthday ? fmtMD(f.birthday) + ' 🎂' : '알려주기 ›'}</button></span></div>
        <div class="info-row"><span>내 하트</span><span>💗 ${points()}</span></div>
        <div class="info-row"><span>출석 도장</span><span>${f.stamps?.count || 0}개</span></div>
        <div class="info-row"><span>보낸 메시지</span><span>${Store.all('message', m => m.fan_id === f.id && m.from === 'fan').length}개</span></div>
        <div class="info-row"><span>보낸 편지</span><span>${Store.all('letter', l => l.fan_id === f.id && l.dir === 'to').length}통</span></div>
      </div>
      <div class="hint" style="padding:0 20px 12px">생일을 알려주면 그날 아티스트들이 축하 카드를 보내줘요 🎉</div>
      <div class="info-box">
        <button class="menu-item" id="snd">알림 소리 <span class="toggle ${LS.get('sound', true) ? 'on' : ''}"></span></button>
        <button class="menu-item" id="out">로그아웃 <span class="r">›</span></button>
      </div>
      <div class="mode-foot">${Store.online ? '🟢 온라인 모드' : '🧪 체험 모드 (이 기기에만 저장)'}</div>
    </div>
    ${tabbar('my')}
  </div>`;
  $('#myAv').onclick = async () => { const b = await pickImage(600); if (!b) return; const u = await upload(b); if (u) { Store.update(f.id, { avatar: u }); toast('프로필 사진을 바꿨어요'); } };
  $$('[data-art]').forEach(b => (b.onclick = () => go('artist/' + b.dataset.art)));
  $('#bday').onclick = async () => {
    const r = await modal(`<h2>생일이 언제야? 🎂</h2><p>연도는 저장하지 않아요</p><div class="row" style="margin-top:0"><select class="inp" id="bm">${Array.from({ length: 12 }, (_, i) => `<option value="${pad(i + 1)}">${i + 1}월</option>`).join('')}</select><select class="inp" id="bd">${Array.from({ length: 31 }, (_, i) => `<option value="${pad(i + 1)}">${i + 1}일</option>`).join('')}</select></div><div class="row"><button class="btn" data-x>취소</button><button class="btn pri" data-ok>저장</button></div>`,
      (m, done) => {
        if (f.birthday) { $('#bm').value = f.birthday.slice(0, 2); $('#bd').value = f.birthday.slice(3); }
        m.querySelector('[data-x]').onclick = () => done(null); m.querySelector('[data-ok]').onclick = () => done(`${$('#bm').value}-${$('#bd').value}`);
      });
    if (r) { Store.update(f.id, { birthday: r, bday_set: Date.now() }); toast('생일을 저장했어요 🎂'); }
  };
  $('#snd').onclick = () => { LS.set('sound', !LS.get('sound', true)); $('#snd .toggle').classList.toggle('on', LS.get('sound', true)); };
  $('#out').onclick = async () => { if (await confirmBox('로그아웃할까요?', '같은 기기에서는 다시 이어서 들어올 수 있어요')) logout(); };
  bindTabs();
}

/* =========================================================
   아티스트 화면
   ========================================================= */
function renderInbox() {
  const a = meArt(); const fl = fansOf(a.id);
  const convs = fl.map(f => {
    const ms = Store.all('message', m => m.artist_id === a.id && m.fan_id === f.id && m.from === 'fan').sort((x, y) => x.at - y.at);
    return { f, last: ms[ms.length - 1], u: artUnread(f.id) };
  }).sort((x, y) => (y.last?.at || 0) - (x.last?.at || 0));
  const sched = Store.all('message', m => m.artist_id === a.id && m.at > Date.now() && !m.auto).length;
  app().innerHTML = `<div class="screen">
    <header class="topbar left"><div class="title">메시지</div></header>
    <div class="scroll">
      <div style="padding:4px 16px 8px"><button class="btn full pri" id="bc" style="margin:0">✏️ 팬들에게 메시지 보내기</button></div>
      <button class="arti-row" id="allRoom"><div class="avatar" style="width:50px;height:50px;background:var(--grad);font-size:22px">📢</div><div class="meta"><div class="name">모든 팬에게 보낸 메시지</div><div class="preview">${esc(previewText(broadcastMsgs(a.id).pop(), ''))}${sched ? ` · 예약 ${sched}개` : ''}</div></div><span style="color:var(--sub)">›</span></button>
      <div class="section-title">팬들의 답장 <small>팬 ${fl.length}명</small></div>
      ${convs.map(({ f, last, u }) => `<button class="arti-row" data-fan="${f.id}">${avatarHTML(f, 50, u ? 'ring' : '')}<div class="meta"><div class="name">${esc(f.nickname)}${isBirthday(f) ? ' 🎂' : ''}</div><div class="preview">${last ? esc(previewText(last)) : '아직 답장이 없어요'}</div></div><div class="side"><span class="time">${last ? fmtList(last.at) : ''}</span>${u ? `<span class="badge">${u}</span>` : '<span style="height:20px"></span>'}</div></button>`).join('')
        || '<div class="empty"><div class="big">🫧</div>아직 멤버십에 가입한 팬이 없어요<br>친구들에게 뽀롱을 알려주세요!</div>'}
      <div style="height:20px"></div>
    </div>
    ${tabbar('inbox')}
  </div>`;
  $('#bc').onclick = () => { pc = null; go('compose/all'); };
  $('#allRoom').onclick = () => go('achat/all');
  $$('[data-fan]').forEach(b => (b.onclick = () => go('achat/' + b.dataset.fan)));
  bindTabs();
}
function isBirthday(f) { const d = new Date(); return f.birthday === `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function renderAChat(fid) {
  const a = meArt();
  const fan = fid && fid !== 'all' ? F(fid) : null;
  if (fid !== 'all' && !fan) return back();
  chatCtx = { aid: a.id, fid: fan ? fan.id : null, viewer: 'artist' }; current.name = 'achat'; chatSearch = null;
  const title = fan ? `${esc(fan.nickname)}${isBirthday(fan) ? ' 🎂' : ''}` : '모든 팬';
  app().innerHTML = chatScreenHTML(title, `${fan ? `<button class="icon-btn" id="gift" style="color:var(--pink)">${I.gift}</button>` : ''}<button class="icon-btn" id="more">${I.pen}</button>`);
  bindChatCommon((type, text) => {
    const m = Store.insert('message', { artist_id: a.id, fan_id: fan ? fan.id : null, from: 'artist', type, text, at: Date.now() });
    freshIds.add(m.id); renderChatBody(true);
  }, false);
  $('#more').onclick = () => { pc = null; go('compose/' + (fan ? fan.id : 'all')); };
  const g = $('#gift'); if (g) g.onclick = () => giftHearts(a, fan);
  $('#tx').placeholder = fan ? `${fan.nickname}에게만 보내기` : '모든 팬에게 보내기';
}
async function giftHearts(a, fan) {
  let n = 5;
  const r = await modal(`<div style="font-size:44px">💗</div><h2>${esc(fan.nickname)}에게 하트 선물</h2><p>칭찬 카드와 함께 하트가 도착해요</p>
    <input class="inp left" id="gw" placeholder="칭찬 이유 (예: 응원해줘서 고마워!)" maxlength="40">
    <div class="row" style="margin-top:10px">${[3, 5, 10, 20].map(x => `<button class="btn ${x === n ? 'pri' : ''}" style="flex:1" data-n="${x}">${x}</button>`).join('')}</div>
    <div class="row"><button class="btn" data-x>취소</button><button class="btn pri" data-ok>선물하기</button></div>`,
    (m, done) => {
      $$('[data-n]', m).forEach(b => (b.onclick = () => { n = +b.dataset.n; $$('[data-n]', m).forEach(x => x.classList.toggle('pri', x === b)); }));
      m.querySelector('[data-x]').onclick = () => done(null);
      m.querySelector('[data-ok]').onclick = () => done($('#gw').value.trim());
    });
  if (r == null) return;
  Store.insert('message', { artist_id: a.id, fan_id: fan.id, from: 'artist', type: 'card', emoji: '💗', title: `칭찬 하트 ${n}개 선물!`, text: `${r ? r + ' ' : ''}{이름아} 고마워! 하트 ${n}개 선물이야 💗`, points: n, at: Date.now() });
  confetti(); toast('하트를 선물했어요');
}

/* ---- 메시지 보내기 (아티스트) ---- */
let pc = null, rec = null;
function renderCompose(target) {
  const a = meArt(); current.live = false;
  const fl = fansOf(a.id);
  if (!pc) pc = { to: target && target !== 'all' && F(target) ? target : 'all', type: 'text', text: '', title: '', image: null, video: null, voice: null, when: 'now', at: localDT(Date.now() + 3600e3), color: PAPERS[0] };
  const typeSeg = [['text', '글'], ['image', '사진'], ['video', '영상'], ['voice', '음성'], ['letter', '편지']];
  let body = '';
  if (pc.type === 'text') body = `<textarea class="inp" id="pt" placeholder="메시지&#10;{이름} → 팬 닉네임, {이름아} → '하린아/서아야' 처럼 바뀌어요">${esc(pc.text)}</textarea>`;
  else if (pc.type === 'image') body = `<button class="btn" id="pi">📷 갤러리에서 사진 고르기</button>${pc.image ? `<div class="attach-prev"><img src="${URL.createObjectURL(pc.image)}"><span style="flex:1;font-size:13px">사진 1장</span><button class="btn sm" id="pix">삭제</button></div>` : ''}`;
  else if (pc.type === 'video') body = `<div class="row"><button class="btn" id="pvc">🎥 촬영하기</button><button class="btn" id="pvf">🎞️ 갤러리에서</button></div>
      ${pc.video ? `<div class="attach-prev" style="flex-direction:column;align-items:stretch"><video src="${URL.createObjectURL(pc.video)}" controls playsinline style="width:100%;max-height:220px;border-radius:8px;background:#000"></video><button class="btn sm" id="pvdx">삭제</button></div>` : ''}
      <div class="hint">${Store.online ? '50MB 이하, 1분 이내 영상을 추천해요' : '영상은 기기 저장 공간을 많이 써요'}</div>`;
  else if (pc.type === 'voice') body = `<div class="row">${rec ? '<button class="btn danger" id="rstop"><span class="row"><span class="rec-dot"></span> 녹음 중지</span></button>' : '<button class="btn" id="rstart">🎙️ 녹음하기</button>'}<button class="btn" id="pa">🎵 파일</button></div>
      ${pc.voice ? `<div class="attach-prev"><audio controls src="${URL.createObjectURL(pc.voice.blob)}" style="flex:1;height:36px"></audio><button class="btn sm" id="pvx">삭제</button></div>` : ''}`;
  else body = `<input class="inp" id="plt" placeholder="편지 제목" value="${esc(pc.title)}" maxlength="30">
      <div class="swatches" style="padding:10px 0">${PAPERS.map(c => `<button class="swatch ${c === pc.color ? 'on' : ''}" data-pcol="${c}" style="background:${c};box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)"></button>`).join('')}</div>
      <textarea class="inp" id="pt" style="min-height:160px" placeholder="편지 내용 ({이름}을 쓰면 팬 닉네임으로 바뀌어요)">${esc(pc.text)}</textarea>`;
  const scheduled = [
    ...Store.all('message', m => m.artist_id === a.id && m.at > Date.now() && !m.auto).map(x => ({ k: 'm', x })),
    ...Store.all('letter', l => l.artist_id === a.id && l.dir === 'from' && l.at > Date.now()).map(x => ({ k: 'l', x })),
  ].sort((p, q) => p.x.at - q.x.at);
  app().innerHTML = `<div class="screen parent">
    <header class="topbar"><button class="icon-btn" id="bk">${I.close}</button><div class="title">메시지 보내기</div><div class="spacer"></div></header>
    <div class="scroll">
      <section class="p-sec">
        <label class="lbl" style="margin-top:0">받는 사람</label>
        <div class="chips" style="padding:0;flex-wrap:wrap"><button class="chip ${pc.to === 'all' ? 'on' : ''}" data-to="all">📢 모든 팬 (${fl.length})</button>${fl.map(f => `<button class="chip ${pc.to === f.id ? 'on' : ''}" data-to="${f.id}">${esc(f.nickname)}</button>`).join('')}</div>
        <label class="lbl">종류</label>
        <div class="seg">${typeSeg.map(([k, l]) => `<button data-pty="${k}" class="${pc.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="lbl">내용</label>
        ${body}
        <label class="lbl">보낼 시간</label>
        <div class="seg"><button data-when="now" class="${pc.when === 'now' ? 'on' : ''}">지금 바로</button><button data-when="later" class="${pc.when === 'later' ? 'on' : ''}">예약 전송</button></div>
        ${pc.when === 'later' ? `<input type="datetime-local" class="inp" id="pat" style="margin-top:8px" value="${pc.at}"><div class="hint">예약한 시간이 되면 팬들에게 도착해요</div>` : ''}
        <button class="btn full pri" id="psend">보내기</button>
      </section>
      <section class="p-sec">
        <h3>예약된 메시지 <small>${scheduled.length}개</small></h3>
        ${scheduled.map(({ k, x }) => `<div class="p-list-item"><div class="meta"><b>${x.fan_id ? esc(F(x.fan_id)?.nickname || '?') : '모든 팬'}</b> · ${fmtList(x.at)} ${fmtTime(x.at)}<div class="s">${esc(k === 'l' ? '💌 편지: ' + (x.title || x.body) : previewText(x))}</div></div><button class="btn sm danger" data-cancel="${x.id}">취소</button></div>`).join('') || '<div class="hint">예약된 메시지가 없어요</div>'}
      </section>
    </div>
  </div>`;
  $('#bk').onclick = () => { if (rec) stopRec(true); pc = null; back('inbox'); };
  const on = (id, ev, fn) => { const el = $('#' + id); if (el) el[ev] = fn; };
  $$('[data-to]').forEach(b => (b.onclick = () => { pc.to = b.dataset.to; renderCompose(); }));
  $$('[data-pty]').forEach(b => (b.onclick = () => { if (rec) stopRec(true); pc.type = b.dataset.pty; renderCompose(); }));
  $$('[data-when]').forEach(b => (b.onclick = () => { pc.when = b.dataset.when; renderCompose(); }));
  $$('[data-pcol]').forEach(b => (b.onclick = () => { pc.color = b.dataset.pcol; renderCompose(); }));
  on('pt', 'oninput', e => (pc.text = e.target.value));
  on('plt', 'oninput', e => (pc.title = e.target.value));
  on('pat', 'oninput', e => (pc.at = e.target.value));
  on('pi', 'onclick', async () => { const b = await pickImage(1400); if (b) { pc.image = b; renderCompose(); } });
  on('pix', 'onclick', () => { pc.image = null; renderCompose(); });
  const pickVideo = async cap => {
    const [f] = await pickFiles({ accept: 'video/*', capture: cap }); if (!f) return;
    if (f.size > (Store.online ? 50 : 150) * 1024 * 1024) return toast('영상이 너무 커요');
    pc.video = f; renderCompose();
  };
  on('pvc', 'onclick', () => pickVideo('user'));
  on('pvf', 'onclick', () => pickVideo(null));
  on('pvdx', 'onclick', () => { pc.video = null; renderCompose(); });
  on('pa', 'onclick', async () => { const [f] = await pickFiles({ accept: 'audio/*' }); if (f) { pc.voice = { blob: f, dur: await audioDuration(f) }; renderCompose(); } });
  on('pvx', 'onclick', () => { pc.voice = null; renderCompose(); });
  on('rstart', 'onclick', startRec);
  on('rstop', 'onclick', () => stopRec());
  on('psend', 'onclick', composeSend);
  $$('[data-cancel]').forEach(b => (b.onclick = async () => { if (await confirmBox('예약을 취소할까요?', '')) { Store.remove(b.dataset.cancel); renderCompose(); } }));
}
async function startRec() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('이 브라우저에선 녹음을 할 수 없어요');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream); const chunks = [];
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec = { mr, stream, t0: Date.now(), discard: false };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const r = rec; rec = null;
      if (!r.discard && chunks.length && pc) pc.voice = { blob: new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), dur: (Date.now() - r.t0) / 1000 };
      if (current.name === 'compose') renderCompose();
    };
    mr.start(); renderCompose();
  } catch (e) { toast('마이크를 사용할 수 없어요'); }
}
function stopRec(discard) { if (!rec) return; rec.discard = !!discard; rec.mr.stop(); }
async function composeSend() {
  const a = meArt();
  let at = Date.now();
  if (pc.when === 'later') {
    at = new Date(pc.at).getTime();
    if (!at || isNaN(at)) return toast('예약 시간을 골라주세요');
    if (at < Date.now()) return toast('지난 시간으로는 예약할 수 없어요');
  }
  const base = { artist_id: a.id, fan_id: pc.to === 'all' ? null : pc.to, from: 'artist', at };
  if (pc.type === 'text') {
    if (!pc.text.trim()) return toast('메시지를 입력해 주세요');
    Store.insert('message', { ...base, type: 'text', text: pc.text.trim() });
  } else if (pc.type === 'image') {
    if (!pc.image) return toast('사진을 골라주세요');
    const u = await upload(pc.image); if (!u) return;
    Store.insert('message', { ...base, type: 'image', media: u });
  } else if (pc.type === 'video') {
    if (!pc.video) return toast('영상을 골라주세요');
    const u = await upload(pc.video); if (!u) return;
    Store.insert('message', { ...base, type: 'video', media: u });
  } else if (pc.type === 'voice') {
    if (!pc.voice) return toast('음성을 녹음해 주세요');
    const u = await upload(pc.voice.blob); if (!u) return;
    Store.insert('message', { ...base, type: 'voice', media: u, dur: pc.voice.dur });
  } else {
    if (!pc.text.trim()) return toast('편지 내용을 입력해 주세요');
    Store.insert('letter', { ...base, dir: 'from', title: pc.title.trim(), body: pc.text, color: pc.color, read: false });
  }
  toast(pc.when === 'later' ? `${fmtList(at)} ${fmtTime(at)}에 보내도록 예약했어요` : '보냈어요 💌');
  const keepTo = pc.to, later = pc.when === 'later';
  pc = null;
  if (later) renderCompose(keepTo); // 예약 목록 바로 보여주기
  else back('inbox');
}

/* ---- 팬 목록 / 받은 편지 (아티스트) ---- */
let fansTab = 'list';
function renderFans() {
  const a = meArt(); const fl = fansOf(a.id);
  const letters = Store.all('letter', l => l.artist_id === a.id && l.dir === 'to').sort((x, y) => y.at - x.at);
  const ul = letters.filter(l => !l.read).length;
  const body = fansTab === 'list'
    ? fl.map(f => { const s = subOf(f, a.id); return `<button class="arti-row" data-fan="${f.id}">${avatarHTML(f, 48)}<div class="meta"><div class="name">${esc(f.nickname)}${isBirthday(f) ? ' <span class="bday-chip">🎂 오늘 생일</span>' : ''}</div><div class="preview">No.${String(s.no || 0).padStart(4, '0')} · ${fmtShort(s.since)} 가입${f.birthday ? ' · 생일 ' + fmtMD(f.birthday) : ''}</div></div><span style="color:var(--sub)">›</span></button>`; }).join('') || '<div class="empty"><div class="big">🫧</div>아직 팬이 없어요</div>'
    : letters.map(letterCard).join('') || '<div class="empty"><div class="big">📭</div>아직 받은 편지가 없어요</div>';
  app().innerHTML = `<div class="screen">
    <header class="topbar left"><div class="title">팬</div></header>
    <div class="toptabs"><button data-ft="list" class="${fansTab === 'list' ? 'on' : ''}">팬 목록 ${fl.length}</button><button data-ft="letters" class="${fansTab === 'letters' ? 'on' : ''}">받은 편지${ul ? ` <b>${ul}</b>` : ''}</button></div>
    <div class="scroll">${body}<div style="height:20px"></div></div>
    ${tabbar('fans')}
  </div>`;
  $$('[data-ft]').forEach(b => (b.onclick = () => { fansTab = b.dataset.ft; renderFans(); }));
  $$('[data-fan]').forEach(b => (b.onclick = () => go('achat/' + b.dataset.fan)));
  $$('[data-letter]').forEach(b => (b.onclick = () => go('letter/' + b.dataset.letter)));
  bindTabs();
}

/* ---- 설정 (아티스트) ---- */
let rf = null, af = null;
const ARTI_EMOJIS = ['🎤', '🐰', '🐻', '🐶', '🐱', '🦊', '🐼', '🦄', '🌟', '🌈', '🎀', '💎', '🪩', '🎧', '👑', '🦋'];
function renderSettings() {
  const a = meArt(); current.live = false;
  if (!rf) rf = { time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], texts: '' };
  if (!af) af = { name: '데뷔 기념일', date: '', emoji: '🎉', text: '{이름아} 오늘은 우리 데뷔 기념일이야! 항상 응원해줘서 고마워 💗' };
  const routines = Store.all('routine', r => r.artist_id === a.id);
  const annivs = Store.all('anniv', x => x.artist_id === a.id);
  app().innerHTML = `<div class="screen parent">
    <header class="topbar left"><div class="title">설정</div></header>
    <div class="scroll">
      <section class="p-sec">
        <h3>프로필</h3>
        <div class="set-imgs">
          <button class="set-av" id="sAv">${avatarHTML(a, 76)}<span>프로필 사진</span></button>
          <button class="set-wall" id="sWall">${a.wallpaper ? `<img ${srcAttr(a.wallpaper)} alt="">` : `<div style="width:100%;height:100%;background:linear-gradient(165deg, ${a.color}, #fff)"></div>`}<span>배경화면 바꾸기</span></button>
        </div>
        <div class="hint">휴대폰 갤러리에서 사진을 골라 바꿀 수 있어요</div>
        <label class="lbl">아티스트 이름</label><input class="inp" id="sName" value="${esc(a.name)}" maxlength="20">
        <label class="lbl">소개</label><input class="inp" id="sBio" value="${esc(a.bio || '')}" maxlength="60" placeholder="팬들에게 보여줄 한 줄 소개">
        <label class="lbl">사진이 없을 때 이모지</label>
        <div class="emoji-pick">${ARTI_EMOJIS.map(e => `<button class="${a.emoji === e ? 'on' : ''}" data-se="${e}">${e}</button>`).join('')}</div>
        <label class="lbl">테마 색</label>
        <div class="swatches" style="padding:0">${PALETTE.map(c => `<button class="swatch ${a.color === c ? 'on' : ''}" data-sc="${c}" style="background:${c}"></button>`).join('')}</div>
        <button class="btn full dark" id="sSave">프로필 저장</button>
      </section>
      <section class="p-sec">
        <h3>자동으로 보내는 메시지</h3>
        <label class="lbl" style="margin-top:0">멤버십 가입 환영 메시지</label><textarea class="inp" id="sWel">${esc(a.welcome || DEFAULT_WELCOME)}</textarea>
        <label class="lbl">팬 생일 축하 카드</label><textarea class="inp" id="sBday">${esc(a.bday_text || DEFAULT_BDAY)}</textarea>
        <div class="hint">팬이 '마이'에 생일을 등록하면 그날 아침 7시에 카드가 가요 🎂</div>
        <button class="btn full dark" id="sSave2">저장</button>
      </section>
      <section class="p-sec">
        <h3>자동 답장 <button class="toggle ${a.auto_reply ? 'on' : ''}" id="sAR"></button></h3>
        <div class="hint" style="margin-top:-4px">팬이 메시지를 보내면 몇 초 뒤 아래 문장 중 하나로 대신 답장해요. (아티스트가 바쁠 때 좋아요)<br>· 한 줄에 하나씩<br>· <b>키워드 =&gt; 답장</b> : 키워드가 들어간 메시지엔 그 답장<br>· <b>{이름}</b>, <b>{이름아}</b> 는 팬 닉네임으로 바뀌어요</div>
        <textarea class="inp" id="sRep" style="min-height:180px;margin-top:10px">${esc(a.replies || '')}</textarea>
        <button class="btn full dark" id="sSave3">자동 답장 저장</button>
      </section>
      <section class="p-sec">
        <h3>반복 메시지 <small>모든 팬에게 정해진 시간마다</small></h3>
        ${routines.map(r => `<div class="p-list-item"><div class="meta"><b>${fmtHM(r.time)} · ${daysLabel(r.days)}</b><div class="s">${esc(r.texts.split('\n')[0] || '')} ${r.texts.split('\n').filter(Boolean).length > 1 ? `외 ${r.texts.split('\n').filter(Boolean).length - 1}개` : ''}</div></div><button class="toggle ${r.enabled ? 'on' : ''}" data-rt="${r.id}"></button><button class="btn sm danger" data-rdel="${r.id}">삭제</button></div>`).join('') || '<div class="hint">반복 메시지가 없어요</div>'}
        <div class="sub-form">
          <b style="font-size:14px">+ 새 반복 메시지</b>
          <input type="time" class="inp" id="rft" value="${rf.time}" style="margin-top:8px">
          <div class="row" style="margin-top:8px;gap:4px">${WD.map((d, i) => `<button class="day ${rf.days.includes(i) ? 'on' : ''}" data-rfd="${i}">${d}</button>`).join('')}</div>
          <textarea class="inp" id="rfx" style="margin-top:8px" placeholder="예) 좋은 아침 {이름아}! ☀️&#10;(여러 줄이면 매번 하나를 골라 보내요)">${esc(rf.texts)}</textarea>
          <button class="btn full dark" id="rfadd" style="margin-top:8px">반복 메시지 추가</button>
        </div>
      </section>
      <section class="p-sec">
        <h3>기념일 <small>매년 그날 아침 7시 모든 팬에게</small></h3>
        ${annivs.map(an => `<div class="p-list-item"><div style="font-size:26px;width:36px;text-align:center">${esc(an.emoji)}</div><div class="meta"><b>${esc(an.name)}</b> · ${fmtMD(an.date)}<div class="s">${esc(an.text)}</div></div><button class="btn sm danger" data-adel="${an.id}">삭제</button></div>`).join('') || '<div class="hint">데뷔일, 크리스마스 같은 날을 등록해 보세요</div>'}
        <div class="sub-form">
          <b style="font-size:14px">+ 새 기념일</b>
          <input class="inp" id="afn" value="${esc(af.name)}" placeholder="이름" maxlength="30" style="margin-top:8px">
          <input type="date" class="inp" id="afd" value="${af.date}" style="margin-top:8px">
          <div class="emoji-pick" style="margin-top:8px">${['🎉', '🎂', '🎄', '🎁', '🌟', '💐', '🏆', '🎈'].map(e => `<button class="${af.emoji === e ? 'on' : ''}" data-afe="${e}">${e}</button>`).join('')}</div>
          <textarea class="inp" id="aft" style="margin-top:8px" placeholder="축하 메시지">${esc(af.text)}</textarea>
          <button class="btn full dark" id="afadd" style="margin-top:8px">기념일 추가</button>
        </div>
      </section>
      <section class="p-sec">
        <h3>보안</h3>
        <button class="btn full" id="sPw" style="margin-top:0">비밀번호 바꾸기</button>
        <button class="btn full" id="sOut">로그아웃</button>
        ${!Store.online ? '<button class="btn full danger" id="sReset">체험 데이터 전체 초기화</button>' : ''}
      </section>
      <div class="mode-foot">${Store.online ? '🟢 온라인 모드' : '🧪 체험 모드 (이 기기에만 저장)'}</div>
      <div style="height:10px"></div>
    </div>
    ${tabbar('settings')}
  </div>`;
  bindTabs();
  let emoji = a.emoji, color = a.color;
  $('#sAv').onclick = async () => { const b = await pickImage(600); if (!b) return; const u = await upload(b); if (u) { Store.update(a.id, { avatar: u }); toast('프로필 사진을 바꿨어요'); renderSettings(); } };
  $('#sWall').onclick = async () => { const b = await pickImage(1800); if (!b) return; const u = await upload(b); if (u) { Store.update(a.id, { wallpaper: u }); toast('배경화면을 바꿨어요 ✨'); renderSettings(); } };
  $$('[data-se]').forEach(b => (b.onclick = () => { emoji = b.dataset.se; $$('[data-se]').forEach(x => x.classList.toggle('on', x === b)); }));
  $$('[data-sc]').forEach(b => (b.onclick = () => { color = b.dataset.sc; $$('[data-sc]').forEach(x => x.classList.toggle('on', x === b)); }));
  $('#sSave').onclick = () => {
    const name = $('#sName').value.trim(); if (!name) return toast('이름을 입력해 주세요');
    if (artists().some(x => x.id !== a.id && x.name === name)) return toast('이미 있는 이름이에요');
    Store.update(a.id, { name, bio: $('#sBio').value.trim(), emoji, color }); toast('저장했어요');
  };
  $('#sSave2').onclick = () => { Store.update(a.id, { welcome: $('#sWel').value.trim() || DEFAULT_WELCOME, bday_text: $('#sBday').value.trim() || DEFAULT_BDAY }); toast('저장했어요'); };
  $('#sAR').onclick = () => { const v = !meArt().auto_reply; Store.update(a.id, { auto_reply: v }); $('#sAR').classList.toggle('on', v); };
  $('#sSave3').onclick = () => { Store.update(a.id, { replies: $('#sRep').value }); toast('저장했어요'); };
  // 반복 메시지
  $$('[data-rt]').forEach(b => (b.onclick = () => { const r = Store.get(b.dataset.rt); Store.update(r.id, { enabled: !r.enabled }); b.classList.toggle('on', !r.enabled); }));
  $$('[data-rdel]').forEach(b => (b.onclick = async () => { if (await confirmBox('반복 메시지를 삭제할까요?', '')) { Store.remove(b.dataset.rdel); renderSettings(); } }));
  $('#rft').oninput = e => (rf.time = e.target.value);
  $('#rfx').oninput = e => (rf.texts = e.target.value);
  $$('[data-rfd]').forEach(b => (b.onclick = () => { const d = +b.dataset.rfd; rf.days = rf.days.includes(d) ? rf.days.filter(x => x !== d) : [...rf.days, d].sort(); b.classList.toggle('on', rf.days.includes(d)); }));
  $('#rfadd').onclick = () => {
    if (!rf.texts.trim()) return toast('보낼 메시지를 입력해 주세요');
    if (!rf.days.length) return toast('요일을 하나 이상 골라주세요');
    Store.insert('routine', { artist_id: a.id, time: rf.time || '08:00', days: rf.days, texts: rf.texts.trim(), enabled: true });
    rf = null; toast('반복 메시지를 추가했어요'); renderSettings();
  };
  // 기념일
  $('#afn').oninput = e => (af.name = e.target.value);
  $('#afd').oninput = e => (af.date = e.target.value);
  $('#aft').oninput = e => (af.text = e.target.value);
  $$('[data-afe]').forEach(b => (b.onclick = () => { af.emoji = b.dataset.afe; $$('[data-afe]').forEach(x => x.classList.toggle('on', x === b)); }));
  $$('[data-adel]').forEach(b => (b.onclick = async () => { if (await confirmBox('기념일을 삭제할까요?', '')) { Store.remove(b.dataset.adel); renderSettings(); } }));
  $('#afadd').onclick = () => {
    if (!af.name.trim()) return toast('기념일 이름을 입력해 주세요');
    if (!af.date) return toast('날짜를 골라주세요');
    Store.insert('anniv', { artist_id: a.id, name: af.name.trim(), date: af.date.slice(5), emoji: af.emoji, text: af.text.trim() || '{이름아} 축하해!! 🎉' });
    af = null; toast('기념일을 추가했어요'); renderSettings();
  };
  $('#sPw').onclick = async () => {
    const old = await promptBox('지금 비밀번호', '', '', 30, 'password'); if (old == null) return;
    if ((await sha256(old)) !== meArt().pw) return toast('비밀번호가 달라요');
    const nw = await promptBox('새 비밀번호', '4자 이상', '', 30, 'password'); if (nw == null) return;
    if (nw.length < 4) return toast('4자 이상으로 정해주세요');
    Store.update(a.id, { pw: await sha256(nw) }); toast('비밀번호를 바꿨어요');
  };
  $('#sOut').onclick = async () => { if (await confirmBox('로그아웃할까요?', '')) logout(); };
  const rs = $('#sReset');
  if (rs) rs.onclick = async () => {
    if (!(await confirmBox('체험 데이터를 모두 지울까요?', '이 기기의 모든 아티스트, 팬, 메시지가 지워져요.', '모두 지우기'))) return;
    indexedDB.deleteDatabase('pporong2');
    Object.keys(localStorage).filter(k => k.startsWith('pp.')).forEach(k => localStorage.removeItem(k));
    location.replace(location.pathname); setTimeout(() => location.reload(), 300);
  };
}

/* =========================================================
   알림 (새 메시지·글·편지가 오면 위에 배너)
   ========================================================= */
const notified = new Set();
function notifiables() {
  const out = []; if (!session) return out;
  const now = Date.now();
  if (session.role === 'fan') {
    const f = meFan(); if (!f) return out;
    const subIds = new Set((f.subs || []).map(s => s.artist_id));
    for (const a of mySubs()) {
      roomMsgs(a.id, f.id).forEach(m => m.from === 'artist' && out.push({ id: m.id, title: a.name, body: previewText(m, f.nickname), go: 'chat/' + a.id, card: m.type === 'card' }));
      posts(a.id, 'feed').forEach(p => out.push({ id: p.id, title: a.name, body: '📝 ' + (p.text || '사진을 올렸어요').slice(0, 40), go: 'post/' + p.id }));
      Store.all('notice', n => n.artist_id === a.id).forEach(n => out.push({ id: n.id, title: a.name, body: (n.type === 'live' ? '🔴 라이브 알림: ' : '📢 ') + n.title, go: 'notice/' + n.id }));
    }
    const myPosts = new Set(Store.all('post', p => p.author === myKey()).map(p => p.id));
    Store.all('comment', c => myPosts.has(c.post_id) && c.author !== myKey()).forEach(c => { const au = authorOf(c.author); out.push({ id: c.id, title: au.name, body: '💬 ' + c.text.slice(0, 40), go: 'post/' + c.post_id }); });
    fanLetters(f).filter(l => l.dir === 'from' && subIds.has(l.artist_id)).forEach(l => out.push({ id: l.id, title: A(l.artist_id)?.name || '편지', body: '💌 편지가 도착했어요!', go: 'letter/' + l.id }));
  } else {
    const a = meArt(); if (!a) return out;
    Store.all('message', m => m.artist_id === a.id && m.from === 'fan' && m.at <= now).forEach(m => out.push({ id: m.id, title: F(m.fan_id)?.nickname || '팬', body: previewText(m), go: 'achat/' + m.fan_id }));
    Store.all('letter', l => l.artist_id === a.id && l.dir === 'to').forEach(l => out.push({ id: l.id, title: F(l.fan_id)?.nickname || '팬', body: '💌 편지를 보냈어요!', go: 'letter/' + l.id }));
    posts(a.id, 'fan').forEach(p => out.push({ id: p.id, title: authorOf(p.author).name, body: '📝 팬 게시판: ' + (p.text || '사진').slice(0, 30), go: 'post/' + p.id }));
    Store.all('comment', c => c.artist_id === a.id && c.author !== myKey()).forEach(c => out.push({ id: c.id, title: authorOf(c.author).name, body: '💬 ' + c.text.slice(0, 40), go: 'post/' + c.post_id }));
    fansOf(a.id).forEach(f => out.push({ id: 'join:' + f.id, title: f.nickname, body: '💗 멤버십에 가입했어요!', go: 'achat/' + f.id }));
  }
  return out;
}
function seedNotified() { notified.clear(); notifiables().forEach(n => notified.add(n.id)); }
function checkNotify() {
  if (!session || !validSession()) return;
  const fresh = notifiables().filter(n => !notified.has(n.id));
  if (!fresh.length) return;
  fresh.forEach(n => notified.add(n.id));
  const last = fresh[fresh.length - 1];
  const viewing = location.hash === '#/' + last.go;
  if (viewing) ding(); else showBanner(last.title, last.body, () => go(last.go));
  if (fresh.some(n => n.card)) confetti();
  return true;
}
function tick() {
  if (!session) return;
  if (checkNotify()) softRender();
  else if (chatCtx) renderChatBody();
}

/* =========================================================
   체험 모드 데모 데이터
   ========================================================= */
async function seedDemo() {
  const now = Date.now();
  const a = Store.insert('artist', {
    name: '뽀롱이', bio: '노래하고 춤추는 토끼 아이돌 🐰💗', color: '#ff4d6d', emoji: '🐰', avatar: '', wallpaper: '',
    pw: await sha256('1234'), auto_reply: true, replies: DEFAULT_REPLIES, welcome: DEFAULT_WELCOME, bday_text: DEFAULT_BDAY, demo: true,
  });
  Store.insert('post', { artist_id: a.id, board: 'feed', author: 'a:' + a.id, text: '안녕 여러분! 뽀롱이에요 🐰💗\n여기서 우리 매일매일 이야기해요!\n멤버십 가입하면 저랑 1:1 메시지도 할 수 있어요 💌', images: [], at: now - 3600e3 });
  Store.insert('post', { artist_id: a.id, board: 'feed', author: 'a:' + a.id, text: '오늘 연습 끝! 새 노래 기대해 주세요 🎤✨', images: [], at: now - 600e3 });
  Store.insert('notice', { artist_id: a.id, type: 'notice', title: '뽀롱이 팬 페이지 오픈!', body: '팬 게시판에 자유롭게 글을 남겨주세요.\n예쁜 말 고운 말 쓰기 약속 🤙', at: now - 7200e3 });
  Store.insert('notice', { artist_id: a.id, type: 'live', title: '오늘 밤 라이브 방송!', body: '새 노래 첫 공개 🎤 다같이 모여요!', start: now + 3 * 3600e3, at: now - 1800e3 });
  Store.insert('routine', { artist_id: a.id, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], texts: '좋은 아침 {이름아}! ☀️ 오늘도 화이팅\n{이름아} 일어났어? 아침 꼭 먹고 가 🍞\n굿모닝~ 오늘 하루도 응원할게 💗', enabled: true, created: now - 864e5 * 3 });
  Store.insert('routine', { artist_id: a.id, time: '21:00', days: [0, 1, 2, 3, 4, 5, 6], texts: '{이름아} 오늘 하루 어땠어? 이제 잘 준비하자 🌙\n잘 자 {이름아}~ 꿈에서 만나 💤', enabled: true, created: now - 864e5 * 3 });
}

/* ---------------- boot ---------------- */
(async function boot() {
  app().innerHTML = `<div class="screen splash"><div class="logo-big">${logo(40)}</div><p>아티스트와 팬이 만나는 곳 💌</p></div>`;
  const t0 = Date.now();
  try {
    await Store.init();
  } catch (e) {
    console.error(e);
    app().innerHTML = `<div class="screen splash"><div style="font-size:48px">😢</div><p style="font-size:16px;font-weight:700">서버에 연결할 수 없어요</p><p>인터넷 연결을 확인하고 다시 시도해 주세요<br><small style="opacity:.7">${esc(e.message || '')}</small></p><button class="btn-white" style="width:auto;padding:12px 24px;margin-top:20px" onclick="location.reload()">다시 시도</button></div>`;
    return;
  }
  if (!Store.online && !artists().length) await seedDemo();
  await new Promise(r => setTimeout(r, Math.max(0, 900 - (Date.now() - t0))));
  render();
  seedNotified();
  setInterval(tick, 1500);
  if (meFan()) setTimeout(maybeStampPrompt, 1200);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
