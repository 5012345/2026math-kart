// 데이터 저장소 추상화: Firebase Realtime Database 또는 로컬 테스트 모드(같은 브라우저 탭 간 BroadcastChannel)
import { firebaseConfig } from './firebase-config.js';

export const isMock = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('여기에') || !firebaseConfig.databaseURL;

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

/** 익명 로그인: 학생은 계정 없이 접속하지만, 이 앱에서 온 접속만 데이터베이스를 쓸 수 있게 함 (규칙의 auth != null) */
async function signInAnon(app) {
  const auth = await import(FB + 'firebase-auth.js');
  const a = auth.getAuth(app);
  try {
    if (!a.currentUser) await auth.signInAnonymously(a);
    await new Promise((res) => { const off = auth.onAuthStateChanged(a, (u) => { if (u) { off(); res(); } }); });
  } catch (e) {
    console.error('익명 로그인 실패', e);
    const why = /operation-not-allowed|admin-restricted/.test(e.code || '')
      ? 'Firebase 콘솔 → Authentication → 로그인 방법(Sign-in method) → <b>익명</b>을 사용 설정해 주세요.'
      : '인터넷 연결이나 firebase-config.js 설정값을 확인해 주세요. (' + (e.code || e.message) + ')';
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9999;background:#e11d48;color:#fff;font:800 16px system-ui,sans-serif;padding:12px 18px;border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:92vw;text-align:center';
    box.innerHTML = '⚠ 익명 로그인에 실패해 게임에 연결할 수 없어요.<br>' + why;
    (document.body || document.documentElement).appendChild(box);
  }
}

async function createFirebaseBackend() {
  const { initializeApp } = await import(FB + 'firebase-app.js');
  const rtdb = await import(FB + 'firebase-database.js');
  const app = initializeApp(firebaseConfig);
  await signInAnon(app);
  const db = rtdb.getDatabase(app);
  let offset = 0;
  rtdb.onValue(rtdb.ref(db, '.info/serverTimeOffset'), (s) => (offset = s.val() || 0));
  const r = (p) => rtdb.ref(db, p);
  return {
    mode: 'firebase',
    now: () => Date.now() + offset,
    set: (p, v) => rtdb.set(r(p), v),
    update: (p, v) => rtdb.update(r(p), v),
    remove: (p) => rtdb.remove(r(p)),
    get: async (p) => (await rtdb.get(r(p))).val(),
    on: (p, cb) => rtdb.onValue(r(p), (s) => cb(s.val())),
    onDisconnectUpdate: (p, v) => rtdb.onDisconnect(r(p)).update(v),
    onConnected: (cb) => rtdb.onValue(r('.info/connected'), (s) => cb(!!s.val())),
  };
}

// ── 로컬 테스트 모드 ──
function createMockBackend() {
  const KEY = 'kmr-mock-db';
  const ch = new BroadcastChannel('kmr-mock');
  // 값 하나하나를 별도 키로 저장 → 여러 탭이 동시에 써도 서로 덮어쓰지 않음
  const P = KEY + '|';
  const split = (p) => p.split('/').filter(Boolean);
  const setIn = (t, parts, v) => {
    let o = t;
    for (const k of parts.slice(0, -1)) { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; }
    o[parts[parts.length - 1]] = v;
  };
  const load = () => {
    const t = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(P)) { try { setIn(t, split(k.slice(P.length)), JSON.parse(localStorage.getItem(k))); } catch { /* 무시 */ } }
    }
    return t;
  };
  let tree = load();
  const listeners = new Set();
  const getAt = (t, parts) => parts.reduce((o, k) => (o == null ? undefined : o[k]), t);
  // RTDB처럼 0..n-1 키만 가진 객체는 배열로 돌려줌
  const arrayify = (v) => {
    if (v === null || typeof v !== 'object') return v;
    const keys = Object.keys(v);
    const out = keys.length && keys.every((k, i) => String(i) === k) ? keys.map((k) => arrayify(v[k])) : Object.fromEntries(keys.map((k) => [k, arrayify(v[k])]));
    return out;
  };
  const clean = (v) => (v === undefined ? null : arrayify(JSON.parse(JSON.stringify(v ?? null))));
  const writePath = (parts, v) => {
    const path = parts.join('/');
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(P)) continue;
      const kp = k.slice(P.length);
      if (kp === path || kp.startsWith(path + '/') || path.startsWith(kp + '/')) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
    const walk = (pp, val) => {
      if (val === null || val === undefined) return;
      if (typeof val === 'object') { Object.entries(val).forEach(([k, x]) => walk(pp.concat(k), x)); return; }
      localStorage.setItem(P + pp.join('/'), JSON.stringify(val));
    };
    walk(parts, v);
  };
  const overlaps = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };
  const notify = (changed) => {
    listeners.forEach((l) => { if (changed.some((c) => overlaps(c, l.parts))) l.cb(clean(getAt(tree, l.parts))); });
  };
  const applyLocal = (parts, v) => {
    if (v === null || v === undefined) {
      const parent = getAt(tree, parts.slice(0, -1));
      if (parent && typeof parent === 'object') delete parent[parts[parts.length - 1]];
    } else setIn(tree, parts, v);
  };
  // changes: [[parts, value], ...]  — 메시지에 값까지 담아 보내 다른 탭이 즉시 반영
  const commit = (changes) => {
    changes.forEach(([parts, v]) => { writePath(parts, v); applyLocal(parts, v); });
    ch.postMessage(changes);
    queueMicrotask(() => notify(changes.map((c) => c[0])));
  };
  ch.onmessage = (e) => { e.data.forEach(([parts, v]) => applyLocal(parts, v)); notify(e.data.map((c) => c[0])); };
  window.__kmrDump = () => clean(tree);
  return {
    mode: 'mock',
    now: () => Date.now(),
    set: async (p, v) => { commit([[split(p), clean(v)]]); },
    update: async (p, obj) => {
      const base = split(p);
      commit(Object.entries(obj).map(([k, v]) => [base.concat(split(k)), clean(v)]));
    },
    remove: async (p) => { commit([[split(p), null]]); },
    get: async (p) => clean(getAt(tree, split(p))),
    on: (p, cb) => {
      const l = { parts: split(p), cb };
      listeners.add(l);
      queueMicrotask(() => cb(clean(getAt(tree, l.parts))));
      return () => listeners.delete(l);
    },
    onDisconnectUpdate: (p, v) => {
      window.addEventListener('pagehide', () => {
        const base = split(p);
        const changes = Object.entries(v).map(([k, val]) => [base.concat(split(k)), val]);
        changes.forEach(([parts, val]) => writePath(parts, val));
        ch.postMessage(changes);
      });
      return Promise.resolve();
    },
    onConnected: (cb) => { cb(true); return () => {}; },
  };
}

let _backend;
export function getBackend() {
  if (!_backend) _backend = isMock ? Promise.resolve(createMockBackend()) : createFirebaseBackend();
  return _backend;
}

export function mockBanner() {
  if (!isMock) return;
  const b = document.createElement('div');
  b.className = 'mock-banner';
  b.textContent = '로컬 테스트 모드 · 같은 브라우저의 탭끼리만 연결됩니다 (firebase-config.js 설정 시 실제 수업 모드)';
  document.body.appendChild(b);
}
