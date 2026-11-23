'use strict';
/* =========================================================
   Store — 데이터 저장소
   - 온라인 모드: Supabase (docs 테이블 + media 버킷), 실시간 동기화
   - 체험 모드: 이 브라우저의 IndexedDB, 같은 기기의 다른 탭과 동기화
   모든 데이터는 { id, kind, data, created_at } 한 가지 모양으로 저장돼요.
   ========================================================= */
const Store = (() => {
  const cfg = window.PPORONG_CONFIG || {};
  const online = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const rows = new Map(); // id -> row ({ id, _kind, created, ...data })
  const listeners = new Set();
  const mediaURL = new Map(); // 'local:xxx' -> objectURL
  let sb = null, db = null, bc = null;

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const toRow = d => ({ ...d.data, id: d.id, _kind: d.kind, created: d.data?.created || Date.parse(d.created_at) || Date.now() });
  const toDoc = r => {
    const { id, _kind, ...data } = r;
    return { id, kind: _kind, data };
  };
  const emit = (type, row, remote) => listeners.forEach(fn => { try { fn(type, row, remote); } catch (e) { console.error(e); } });

  /* ---- IndexedDB (체험 모드) ---- */
  function idbOpen() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('pporong2', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('docs', { keyPath: 'id' }); r.result.createObjectStore('media'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  const tx = (store, mode, fn) => new Promise((res, rej) => {
    const t = db.transaction(store, mode); const s = t.objectStore(store);
    const q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
  });

  async function init() {
    if (online) {
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('docs').select('*').order('created_at').range(from, from + 999);
        if (error) throw error;
        data.forEach(d => rows.set(d.id, toRow(d)));
        if (data.length < 1000) break;
      }
      sb.channel('docs-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
          if (p.eventType === 'DELETE') {
            const r = rows.get(p.old.id); if (r) { rows.delete(p.old.id); emit('delete', r, true); }
          } else {
            const had = rows.has(p.new.id); const r = toRow(p.new);
            rows.set(r.id, r); emit(had ? 'update' : 'insert', r, true);
          }
        })
        .subscribe();
    } else {
      db = await idbOpen();
      const all = await tx('docs', 'readonly', s => s.getAll());
      (all || []).forEach(d => rows.set(d.id, toRow(d)));
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('pporong-sync');
        bc.onmessage = e => {
          const { type, doc } = e.data;
          if (type === 'delete') { const r = rows.get(doc.id); if (r) { rows.delete(doc.id); emit('delete', r, true); } }
          else { const had = rows.has(doc.id); const r = toRow(doc); rows.set(r.id, r); emit(had ? 'update' : 'insert', r, true); }
        };
      }
    }
  }

  async function persist(type, doc) {
    try {
      if (online) {
        if (type === 'delete') { const { error } = await sb.from('docs').delete().eq('id', doc.id); if (error) throw error; }
        else { const { error } = await sb.from('docs').upsert({ id: doc.id, kind: doc.kind, data: doc.data }); if (error) throw error; }
      } else {
        if (type === 'delete') await tx('docs', 'readwrite', s => s.delete(doc.id));
        else await tx('docs', 'readwrite', s => s.put({ ...doc, created_at: new Date().toISOString() }));
        bc && bc.postMessage({ type, doc });
      }
    } catch (e) {
      console.error(e);
      window.toast && window.toast('저장에 실패했어요. 인터넷 연결을 확인해 주세요.');
    }
  }

  function all(kind, pred) {
    const out = [];
    for (const r of rows.values()) if (r._kind === kind && (!pred || pred(r))) out.push(r);
    return out;
  }
  const get = id => rows.get(id) || null;

  function set(kind, data, id = newId()) {
    const prev = rows.get(id);
    const r = { ...data, id, _kind: kind, created: prev?.created || data.created || Date.now() };
    rows.set(id, r);
    emit(prev ? 'update' : 'insert', r, false);
    persist('upsert', toDoc(r));
    return r;
  }
  const insert = (kind, data) => set(kind, data);
  function update(id, patch) {
    const prev = rows.get(id); if (!prev) return null;
    const r = { ...prev, ...patch };
    rows.set(id, r); emit('update', r, false);
    persist('upsert', toDoc(r));
    return r;
  }
  function remove(id) {
    const prev = rows.get(id); if (!prev) return;
    rows.delete(id); emit('delete', prev, false);
    persist('delete', { id });
  }

  /* ---- 미디어 ---- */
  async function upload(blob) {
    const type = blob.type || 'application/octet-stream';
    const ext = (type.split('/')[1] || 'bin').split(';')[0].replace('jpeg', 'jpg').replace('quicktime', 'mov');
    if (online) {
      const path = `${new Date().toISOString().slice(0, 7)}/${newId()}.${ext}`;
      const { error } = await sb.storage.from('media').upload(path, blob, { contentType: type, upsert: false });
      if (error) throw error;
      return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    }
    const id = newId();
    await tx('media', 'readwrite', s => s.put(blob, id));
    mediaURL.set('local:' + id, URL.createObjectURL(blob));
    return 'local:' + id;
  }
  // 바로 쓸 수 있는 주소 (아직 못 불러온 체험 모드 사진이면 null)
  function src(url) {
    if (!url) return null;
    if (!url.startsWith('local:')) return url;
    return mediaURL.get(url) || null;
  }
  async function resolve(url) {
    if (!url || !url.startsWith('local:')) return url;
    if (mediaURL.has(url)) return mediaURL.get(url);
    const blob = await tx('media', 'readonly', s => s.get(url.slice(6)));
    if (!blob) return null;
    const u = URL.createObjectURL(blob); mediaURL.set(url, u); return u;
  }
  // data-lsrc 속성이 붙은 img/video/audio에 실제 주소를 채워 넣음
  function hydrate(root = document) {
    root.querySelectorAll('[data-lsrc]').forEach(async el => {
      const key = el.getAttribute('data-lsrc'); el.removeAttribute('data-lsrc');
      const u = await resolve(key); if (u) el.src = u + (el.dataset.frag || '');
    });
  }
  const on = fn => listeners.add(fn);

  return { init, online, all, get, set, insert, update, remove, upload, src, resolve, hydrate, on, newId };
})();
