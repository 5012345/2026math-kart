// 학생 화면: 입장 → 대기실 → 레이스(순환 코스·아이템·충돌) → 결과
import { getBackend, mockBanner, isMock } from './backend.js';
import { RaceScene } from './race-renderer.js';
import { GAME, THEMES, COLORS, EARS, ITEMS, LANE_COLORS, LANE_LABELS, mathHTML, esc, sound, drawAvatarFront, avatarURL, hashStr, fmtTime, rollItem } from './common.js';
import { TRACK_LEN, R, JUMPS, PADS, ITEM_ROWS, BOX_RESPAWN, splitWidthAt, laneXAt, laneBaseX, padLanes, rowLanes, laneLockAt, sideOf, surfaceH, tunnelCovered, zoneAt, checkpointAbs, SHAPE_PATH, mapPoint, lapOf, hazardAt } from './track.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let room = (params.get('room') || '').replace(/\D/g, '');
// 로컬 테스트 모드에서는 탭마다 다른 학생이 되도록 sessionStorage 사용
const idStore = isMock ? sessionStorage : localStorage;
const scene = new RaceScene($('race'), $('signs'));
let db;
let meta = null, phase = null, quiz = null, players = {}, progress = {}, hazards = {}, boxes = {};
const localBoxes = {};
let pid = null, me = null;
let joined = false;
const unsub = [];
const seenEvents = new Set();
let eventsPrimed = false;
const nowL = () => performance.now() / 1000; // 로컬 시간(초)

// 레이스 상태 (로컬)
const S = {
  dist: 0, prevDist: 0, speed: 0, power: 0, gas: false, brake: false, gasUsed: false, lane: 1, x: 0, lean: 0,
  boost: 0, pad: 0, nitro: 0, slow: 0, bump: 0, shield: 0, fog: 0, shake: 0,
  stun: null, air: null, incoming: null,
  items: [], picked: new Set(), bumpCD: {},
  correct: 0, streak: 0, best: 0, judged: new Set(), seen: new Set(), restored: false, lastPub: 0,
  curIdx: -1, curKind: null, lastTick: -1, finishedShown: false, nLanes: 4,
  qi: 0, resultIdx: -1, resultUntil: 0, finAt: 0,
};
const others = new Map(); // pid → { d, x } (화면 표시용으로 부드럽게)

// ───────── 입장 화면 ─────────
const draft = JSON.parse(localStorage.getItem('kmr-profile') || 'null') || { name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], ears: 'cat', theme: 'snow' };

function renderJoinPickers() {
  $('sw-color').innerHTML = COLORS.map((c) => `<button class="swatch ${c === draft.color ? 'sel' : ''}" style="background:${c}" data-c="${c}" aria-label="색 ${c}"></button>`).join('');
  $('sw-ears').innerHTML = EARS.map((e) => `<button class="pill ${e.id === draft.ears ? 'sel' : ''}" data-e="${e.id}">${e.label}</button>`).join('');
  const themePills = Object.values(THEMES).map((t) => `<button class="pill ${t.id === draft.theme ? 'sel' : ''}" data-t="${t.id}">${t.emoji} ${t.ride}</button>`).join('');
  $('sw-theme').innerHTML = themePills; $('lobby-sw-theme').innerHTML = themePills;
  drawPreview($('av-preview'));
}
function drawPreview(cv, av = draft) {
  const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  drawAvatarFront(g, cv.width / 2, cv.height * 0.45, cv.width * 0.3, av);
}
$('sw-color').onclick = (e) => { const c = e.target.dataset.c; if (c) { draft.color = c; renderJoinPickers(); } };
$('sw-ears').onclick = (e) => { const v = e.target.dataset.e; if (v) { draft.ears = v; renderJoinPickers(); } };
const pickTheme = async (e) => {
  const v = e.target.closest('[data-t]')?.dataset.t; if (!v) return;
  draft.theme = v; renderJoinPickers();
  if (joined) { await db.update(`rooms/${room}/players/${pid}`, { theme: v }); localStorage.setItem('kmr-profile', JSON.stringify(draft)); }
};
$('sw-theme').onclick = pickTheme; $('lobby-sw-theme').onclick = pickTheme;
$('in-name').value = draft.name;
if (room) { $('room-field').classList.add('hidden'); } else $('in-room').focus();

$('btn-join').onclick = async () => {
  sound.unlock();
  const name = $('in-name').value.trim().slice(0, 8);
  if (!room) room = $('in-room').value.replace(/\D/g, '');
  if (room.length !== 6) { $('join-err').textContent = '방 번호 6자리를 입력하세요'; room = ''; return; }
  if (!name) { $('join-err').textContent = '이름을 입력하세요'; return; }
  $('btn-join').disabled = true;
  try {
    const m = await db.get(`rooms/${room}/meta`);
    if (!m) { $('join-err').textContent = '방을 찾을 수 없어요. 번호를 확인하세요'; room = params.get('room') || ''; $('btn-join').disabled = false; return; }
    draft.name = name;
    localStorage.setItem('kmr-profile', JSON.stringify(draft));
    pid = idStore.getItem(`kmr-pid-${room}`) || `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    idStore.setItem(`kmr-pid-${room}`, pid);
    const prev = await db.get(`rooms/${room}/players/${pid}`);
    await db.update(`rooms/${room}/players/${pid}`, { name, color: draft.color, ears: draft.ears, theme: draft.theme, joinedAt: prev?.joinedAt || db.now(), online: true });
    db.onDisconnectUpdate(`rooms/${room}/players/${pid}`, { online: false });
    history.replaceState(null, '', `?room=${room}`);
    joined = true;
    subscribe();
  } catch (err) {
    console.error(err); $('join-err').textContent = '연결 오류: ' + err.message; $('btn-join').disabled = false;
  }
};
$('in-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

// ───────── 구독 ─────────
function subscribe() {
  const base = `rooms/${room}`;
  S.lane = hashStr(pid) % 6; // 대열 배정 전 임시 코스
  unsub.push(db.on(`${base}/meta`, (v) => { meta = v; if (!v) return showMsg('방이 종료되었어요', '선생님의 새 QR 코드로 다시 입장하세요.'); updateScreens(); }));
  unsub.push(db.on(`${base}/phase`, (v) => { phase = v; }));
  unsub.push(db.on(`${base}/quiz`, (v) => { quiz = v ? Object.values(v) : null; }));
  unsub.push(db.on(`${base}/hazards`, (v) => { hazards = v || {}; }));
  unsub.push(db.on(`${base}/boxes`, (v) => { boxes = v || {}; }));
  unsub.push(db.on(`${base}/events`, (v) => onEvents(v || {})));
  unsub.push(db.on(`${base}/players`, (v) => {
    players = v || {};
    me = players[pid];
    if (joined && !me) { joined = false; showJoin('선생님이 퇴장시켰어요. 다시 입장할 수 있어요.'); return; }
    if (me && me.online === false) db.update(`${base}/players/${pid}`, { online: true });
    updateScreens();
  }));
  unsub.push(db.on(`${base}/progress`, (v) => {
    progress = v || {};
    if (!S.restored) {
      S.restored = true;
      const mine = progress[pid];
      if (mine) restoreFrom(mine);
      else if (meta && meta.status !== 'lobby') {
        const ds = Object.values(progress).map((p) => p.d || 0);
        S.dist = S.prevDist = ds.length ? Math.min(...ds) : 0; // 늦게 들어오면 꼴찌 위치에서 출발
      }
    }
  }));
}
function restoreFrom(mine) {
  S.dist = S.prevDist = mine.d || 0; S.correct = mine.c || 0; S.streak = mine.s || 0; S.best = mine.b || 0;
  if (mine.l != null) S.lane = mine.l;
  S.finAt = mine.fin || 0;
  (mine.j || '').split(',').filter(Boolean).forEach((i) => S.judged.add(Number(i)));
}
const NQ = () => quiz?.length || meta?.total || 0;
/** 이미 지나간 문제(판정했거나, 늦게 들어와 놓친 문제)는 건너뜀 */
function syncQi() {
  const N = NQ();
  while (S.qi < N && (S.judged.has(S.qi) || checkpointAbs(S.qi) < S.dist - 0.5)) { S.judged.add(S.qi); S.qi++; }
}

function showJoin(err = '') {
  ['scr-lobby', 'scr-final', 'hud'].forEach((id) => $(id).classList.add('hidden'));
  $('scr-join').classList.remove('hidden');
  $('btn-join').disabled = false; $('join-err').textContent = err;
  renderJoinPickers();
}
function showMsg(t, b) { $('msg-title').textContent = t; $('msg-body').textContent = b; ['scr-join', 'scr-lobby', 'hud', 'scr-final'].forEach((id) => $(id).classList.add('hidden')); $('scr-msg').classList.remove('hidden'); }

const themeOf = (pl) => (meta?.theme === 'choice' ? (pl?.theme || 'snow') : (meta?.theme || 'snow'));
const itemsOn = () => meta?.items !== false;

function updateScreens() {
  if (!joined || !meta || !me) return;
  scene.setTheme(themeOf(me));
  const st = meta.status;
  $('scr-join').classList.add('hidden');
  $('scr-lobby').classList.toggle('hidden', st !== 'lobby');
  $('hud').classList.toggle('hidden', st === 'lobby');
  $('items').classList.toggle('hidden', !itemsOn());
  if (st === 'lobby') {
    drawPreview($('lobby-av'), me);
    $('lobby-name').textContent = me.name;
    const t = THEMES[themeOf(me)];
    $('lobby-theme').textContent = meta.theme === 'choice' ? `${t.emoji} ${t.name} (내가 선택)` : `${t.emoji} 이번 코스: ${t.name}`;
    $('lobby-mode').textContent = itemsOn() ? '🎁 아이템전 — ? 상자를 먹고 SPACE(또는 아이템 칸 터치)로 사용!' : '🏎️ 스피드전 — 아이템 없이 실력으로!';
    $('lobby-theme-pick').classList.toggle('hidden', meta.theme !== 'choice');
    $('lobby-count').textContent = Object.keys(players).length;
    $('scr-final').classList.add('hidden');
    S.finishedShown = false;
  }
  if (meta.raceId && S.raceId !== meta.raceId) resetRace();
  if (st === 'finished' && !S.finishedShown) showFinal();
}

/** 출발 대열 자리: 선생님이 정해 준 번호 → (줄, 코스). 늦게 들어온 학생은 맨 뒤 */
function gridSpot() {
  const g = meta?.grid || {};
  const cols = Math.max(2, Math.min(6, meta?.gridCols || 6));
  const slot = g[pid] ?? Object.keys(g).length + (hashStr(pid) % cols);
  return { row: Math.floor(slot / cols), lane: slot % cols, cols };
}
function resetRace() {
  S.raceId = meta.raceId;
  const spot = gridSpot();
  const back = spot.row * GAME.GRID_GAP;               // 맨 앞줄보다 뒤에 선 거리 (m)
  S.gridRow = spot.row; S.gridOff = back;
  S.creditMs = Math.round((back / GAME.BASE_SPEED) * 1000); // 그 거리를 최고 속도로 달리는 시간만큼 기록에서 빼 줌
  S.nLanes = spot.cols; scene.lanes = spot.cols; // 첫 문제 코스 수로 미리 맞춰 둬야 자리가 옮겨지지 않음
  S.lane = spot.lane; S.goT = null;
  const start = -(GAME.GRID_FRONT + back);
  Object.assign(S, { dist: start, prevDist: start, speed: 0, power: 0, gasUsed: false, boost: 0, pad: 0, nitro: 0, slow: 0, bump: 0, shield: 0, fog: 0, stun: null, air: null, incoming: null, items: [], correct: 0, streak: 0, best: 0, curIdx: -1, curKind: null, qi: 0, resultIdx: -1, resultUntil: 0, finAt: 0, finishedShown: false, hzSlow: 0, hzHit: null, wobUntil: 0, inSnow: false });
  $('scr-final').classList.add('hidden');
  setTimeout(() => toast(`🚦 출발 위치: ${spot.row + 1}번째 줄 · ${LANE_LABELS[spot.lane]}코스${spot.row ? ` (뒷줄 보정 ${(S.creditMs / 1000).toFixed(2)}초)` : ''}`), 300);
  S.judged = new Set(); S.seen = new Set(); S.picked = new Set(); S.bumpCD = {};
  others.clear();
  renderItems();
  const mine = progress[pid];
  if (mine && mine.r === meta.raceId) restoreFrom(mine);
}

// ───────── 조작 ─────────
function setLane(i, fromUser = true) {
  const n = S.nLanes;
  const v = Math.max(0, Math.min(n - 1, i));
  if (v !== S.lane && fromUser) {
    sound.move(); S.lean = Math.sign(v - S.lane);
    const lock = laneLockAt(S.dist);
    if (lock && sideOf(laneBaseX(v, n), n) !== sideOf(S.x, n)) lockToast(lock);
  }
  S.lane = v;
  highlightChoice();
}
let lockToastAt = 0;
function lockToast(lock) {
  if (performance.now() - lockToastAt < 1500) return;
  lockToastAt = performance.now();
  const onIt = sideOf(S.x, S.nLanes) === lock.side;
  const msg = lock.kind === 'overpass'
    ? (onIt ? '🌉 고가도로 위에서는 아래 길로 갈 수 없어요' : '🌉 아래 길에서는 고가도로로 올라갈 수 없어요')
    : (onIt ? '🚇 터널 안에서는 바깥 길로 나갈 수 없어요' : '🚇 바깥 길에서는 터널로 들어갈 수 없어요');
  toast(msg + ' · 고른 답은 그대로예요');
  sound.bump();
}
/** 실제로 달리는 코스: 갈래길에서 막혀 있으면 내 쪽 갈래 안에서 가장 가까운 코스 */
/** 지금 캐릭터가 실제로 서 있는 코스 (이동 중이면 가까운 쪽) */
function laneOfX(x) {
  const n = S.nLanes, w = splitWidthAt(S.dist); let best = 0;
  for (let i = 1; i < n; i++) if (Math.abs(laneXAt(i, n, w) - x) < Math.abs(laneXAt(best, n, w) - x)) best = i;
  return best;
}
function physLane() {
  const n = S.nLanes, want = Math.min(S.lane, n - 1);
  const lock = laneLockAt(S.dist);
  if (!lock) return want;
  const mySide = sideOf(S.x, n);
  if (sideOf(laneBaseX(want, n), n) === mySide) return want;
  let best = -1;
  for (let i = 0; i < n; i++) if (sideOf(laneBaseX(i, n), n) === mySide && (best < 0 || Math.abs(i - want) < Math.abs(best - want))) best = i;
  return best < 0 ? want : best;
}
$('btn-left').onpointerdown = (e) => { e.preventDefault(); sound.unlock(); setLane(S.lane - 1); };
$('btn-right').onpointerdown = (e) => { e.preventDefault(); sound.unlock(); setLane(S.lane + 1); };
// ── 가속 (누르고 있는 동안 점점 빨라짐) ──
function setGas(on) {
  if (S.gas === on) return;
  S.gas = on; if (on) S.gasUsed = true;
  $('btn-gas').classList.toggle('on', on);
}
const gasBtn = $('btn-gas');
gasBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); sound.unlock(); try { gasBtn.setPointerCapture(e.pointerId); } catch {} setGas(true); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => gasBtn.addEventListener(ev, () => setGas(false)));
gasBtn.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => { setGas(false); S.brake = false; });
window.addEventListener('keyup', (e) => {
  if (['ArrowUp', 'w', 'W'].includes(e.key)) setGas(false);
  if (['ArrowDown', 's', 'S'].includes(e.key)) S.brake = false;
});
window.addEventListener('keydown', (e) => {
  if (document.activeElement?.tagName === 'INPUT') return;
  if (['ArrowUp', 'w', 'W'].includes(e.key)) { e.preventDefault(); sound.unlock(); setGas(true); }
  if (['ArrowDown', 's', 'S'].includes(e.key)) { e.preventDefault(); S.brake = true; }
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) setLane(S.lane - 1);
  if (['ArrowRight', 'd', 'D'].includes(e.key)) setLane(S.lane + 1);
  if ([' ', 'Control', 'Shift'].includes(e.key)) { e.preventDefault(); if (!e.repeat) useItem(); }
  if (['x', 'X', 'Backspace', 'Delete'].includes(e.key)) { e.preventDefault(); dropItem(); }
  const n = '123456'.indexOf(e.key); if (n >= 0) setLane(n);
});
let touchStart = null;
$('race').addEventListener('pointerdown', (e) => { sound.unlock(); touchStart = { x: e.clientX, y: e.clientY }; });
$('race').addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  if (Math.abs(dx) > 40) setLane(S.lane + Math.sign(dx));
  else if (e.clientY > window.innerHeight * 0.4) setLane(scene.laneAtScreenX(e.clientX));
  touchStart = null;
});
$('q-choices').addEventListener('pointerdown', (e) => { const el = e.target.closest('[data-i]'); if (el) { sound.unlock(); setLane(Number(el.dataset.i)); } });
$('items').addEventListener('pointerdown', (e) => { e.preventDefault(); sound.unlock(); if (e.target.closest('#btn-drop')) dropItem(); else useItem(); });
$('q-img').addEventListener('pointerdown', (e) => { e.stopPropagation(); const z = $('img-zoom'); z.querySelector('img').src = $('q-img').src; z.classList.remove('hidden'); });
$('img-zoom').addEventListener('pointerdown', (e) => { e.stopPropagation(); $('img-zoom').classList.add('hidden'); });
$('btn-mute').onclick = () => { $('btn-mute').textContent = sound.toggle() ? '🔇' : '🔊'; };
$('btn-mute').textContent = sound.muted ? '🔇' : '🔊';

// ───────── 문제 배너 ─────────
let bannerKey = '';
function renderBanner(idx, kind) {
  const q = quiz?.[idx];
  const key = `${idx}|${kind}|${q?.q}`;
  if (!q) { $('qbanner').classList.add('hidden'); bannerKey = ''; return; }
  $('qbanner').classList.remove('hidden');
  if (key === bannerKey) return;
  bannerKey = key;
  $('q-tag').textContent = `Q${idx + 1}`;
  $('q-text').innerHTML = mathHTML(q.q);
  const qi = $('q-img');
  if (q.img) { qi.src = q.img; qi.classList.remove('hidden'); } else { qi.removeAttribute('src'); qi.classList.add('hidden'); }
  $('img-zoom').classList.add('hidden');
  const ch = $('q-choices');
  const cols = q.choices.length >= 5 && window.innerWidth < 760 ? 3 : q.choices.length;
  ch.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  ch.innerHTML = q.choices.map((c, i) => `<div class="choice" data-i="${i}" style="--lane:${LANE_COLORS[i]}"><b>${LANE_LABELS[i]}</b><span>${mathHTML(c)}</span></div>`).join('');
  $('q-explain').classList.add('hidden');
  if (kind === 'result') revealAnswer(idx);
  highlightChoice();
}
function highlightChoice() {
  document.querySelectorAll('#q-choices .choice').forEach((el, i) => el.classList.toggle('sel', i === S.lane));
}
function revealAnswer(idx) {
  const q = quiz?.[idx]; if (!q) return;
  document.querySelectorAll('#q-choices .choice').forEach((el, i) => { el.classList.toggle('correct', i === q.answer); el.classList.toggle('dim', i !== q.answer); el.classList.remove('sel'); });
  if (q.explain) { $('q-explain').innerHTML = '💡 ' + mathHTML(q.explain); $('q-explain').classList.remove('hidden'); }
}

function showFinishBanner() {
  if (bannerKey === 'finish') return;
  bannerKey = 'finish';
  $('qbanner').classList.remove('hidden');
  $('q-tag').textContent = 'GOAL';
  $('q-text').innerHTML = S.finAt ? '🏁 완주! 다른 친구들을 응원해 주세요' : '🏁 마지막 문제 통과! 결승선까지 달려요';
  $('q-img').classList.add('hidden'); $('q-choices').innerHTML = ''; $('q-explain').classList.add('hidden');
  $('q-timer').style.width = '0%'; $('q-dist').textContent = '';
}
function centerMsg(text, cls = '') {
  const el = $('center-msg');
  el.className = ''; void el.offsetWidth;
  el.textContent = text; el.className = `show ${cls}`;
}
let toastTimer;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ───────── 판정 ─────────
function judge(idx) {
  if (S.judged.has(idx) || !quiz?.[idx]) return;
  S.judged.add(idx);
  const q = quiz[idx];
  const choice = Math.min(S.lane, q.choices.length - 1);
  const ok = choice === q.answer;
  if (ok) {
    S.correct++; S.streak++; S.best = Math.max(S.best, S.streak);
    S.boost = GAME.BOOST_TIME + Math.min(4, S.streak - 1) * GAME.STREAK_BONUS;
    S.slow = 0;
    sound.boost();
    centerMsg(S.streak >= 2 ? `${S.streak} COMBO!` : 'BOOST!', 'boost');
  } else {
    S.streak = 0; S.slow = GAME.SLOW_TIME; S.boost = 0;
    sound.wrong();
    centerMsg('아쉬워요!', 'bad');
  }
  db.set(`rooms/${room}/answers/${idx}/${pid}`, { c: choice, ok });
  S.resultIdx = idx; S.resultUntil = nowL() + GAME.RESULT_TIME / 1000;
  S.qi = Math.max(S.qi, idx + 1);
  publish(true);
}

// ───────── 상태 이펙트 ─────────
function stun(type, secs) {
  const t = nowL();
  S.stun = { type, start: t, end: t + secs, sStart: db.now(), sEnd: db.now() + secs * 1000 };
  publish(true);
}
const stunned = () => S.stun && nowL() < S.stun.end;
/** 공격 받기: 방패가 있으면 막아냄 */
function takeHit(type, secs, msg) {
  if (S.shield > 0) { S.shield = 0; toast('🛡️ 방패가 막아냈어요!'); sound.block(); scene.burst(scene.meScreen.x / scene.cssScale, scene.meScreen.y / scene.cssScale - 60, 16, '#7cffc4'); publish(true); return false; }
  stun(type, secs);
  if (msg) toast(msg);
  return true;
}

// ───────── 아이템 ─────────
function renderItems() {
  const slots = $('items').querySelectorAll('.slot');
  slots.forEach((el, i) => {
    const it = S.items[i];
    el.innerHTML = it ? `<span>${ITEMS[it].emoji}</span><small>${ITEMS[it].name}</small>` : '';
    el.classList.toggle('filled', !!it);
  });
  $('btn-drop').classList.toggle('hidden', !S.items.length);
}
/** 순위: 완주한 사람은 완주 시각 순, 나머지는 달린 거리 순 */
function myRankInfo() {
  const list = Object.entries(progress).filter(([id]) => players[id]).map(([id, p]) => ({ id, d: id === pid ? S.dist + (S.gridOff || 0) : estDist(p) + (p.go || 0), fin: id === pid ? S.finAt : p.fin || 0 }));
  if (!list.find((x) => x.id === pid)) list.push({ id: pid, d: S.dist + (S.gridOff || 0), fin: S.finAt });
  list.sort((a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : b.d - a.d));
  return { list, rank: list.findIndex((x) => x.id === pid) + 1 };
}
function estDist(p) {
  if (!p) return 0;
  if (p.fin) return p.d || 0;
  const age = Math.max(0, Math.min(1.2, (db.now() - (p.t || 0)) / 1000));
  return (p.d || 0) + (p.v || 0) * age;
}
function dropItem() {
  if (!S.items.length) return;
  const it = S.items.shift();
  renderItems(); sound.move();
  toast(`🗑️ ${ITEMS[it].name}을(를) 버렸어요`);
}
function useItem() {
  if (!S.items.length || !meta || meta.status !== 'racing' || stunned()) return;
  const it = S.items[0];
  const base = `rooms/${room}`;
  const id = `${db.now().toString(36)}${pid.slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
  if (it === 'missile') {
    const ahead = Object.entries(progress).filter(([oid]) => oid !== pid && players[oid])
      .map(([oid, p]) => ({ oid, dd: estDist(p) - S.dist })).filter((x) => x.dd > 0).sort((a, b) => a.dd - b.dd)[0];
    if (!ahead) { toast('앞에 아무도 없어요! 미사일은 아껴 둘게요'); return; }
    db.set(`${base}/events/${id}`, { type: 'missile', from: pid, to: ahead.oid, t: db.now() });
    scene.addEffect('rocket'); sound.launch();
    toast(`🚀 미사일 발사! → ${players[ahead.oid]?.name || ''}`);
  } else if (it === 'banana') {
    db.set(`${base}/hazards/${id}`, { d: Math.round((S.dist - 2.5) * 10) / 10, x: Math.round(S.x * 100) / 100, by: pid, t: db.now() });
    db.set(`${base}/events/${id}`, { type: 'banana', from: pid, t: db.now() });
    sound.move(); toast('🍌 바나나를 뒤에 놓았어요');
  } else if (it === 'fog') {
    db.set(`${base}/events/${id}`, { type: 'fog', from: pid, d: S.dist, t: db.now() });
    sound.launch(); toast('🌫️ 안개 발사! 뒤 레이서들의 시야를 가렸어요');
  } else if (it === 'water') {
    db.set(`${base}/events/${id}`, { type: 'water', from: pid, d: S.dist, t: db.now() });
    scene.addEffect('waterball'); sound.splash(); toast('💧 물폭탄 발사!');
  } else if (it === 'nitro') {
    S.nitro = GAME.NITRO_TIME; sound.boost(); centerMsg('NITRO!', 'boost');
  } else if (it === 'shield') {
    S.shield = GAME.SHIELD_TIME; sound.pickup(); toast('🛡️ 방패 ON! 공격과 충돌을 막아요');
  }
  S.items.shift(); renderItems(); publish(true);
}

function onEvents(all) {
  const now = db.now();
  Object.entries(all).forEach(([id, ev]) => {
    if (seenEvents.has(id)) return;
    seenEvents.add(id);
    if (!eventsPrimed && now - (ev.t || 0) > 3000) return; // 입장 전 이벤트 무시
    if (!joined || ev.from === pid || meta?.status !== 'racing') return;
    if (ev.type === 'missile' && ev.to === pid) {
      const delay = Math.max(0.2, (GAME.MISSILE_DELAY - (now - ev.t)) / 1000);
      S.incoming = { hitAt: nowL() + delay, from: ev.from };
      scene.addEffect('incoming', { dur: delay });
      sound.alarm();
      $('warn').classList.add('show');
    } else if (ev.type === 'fog') {
      const gap = ev.d - S.dist;
      if (gap > 0 && gap < 400) { S.fog = GAME.FOG_TIME; toast(`🌫️ ${players[ev.from]?.name || ''}님의 안개! 앞이 잘 안 보여요`); sound.fogged(); }
    } else if ((ev.type === 'bananaHit' || ev.type === 'missileHit') && ev.by === pid) {
      sound.hitConfirm(); toast(`${ev.type === 'bananaHit' ? '🍌' : '🚀'} ${players[ev.to]?.name || ''}님에게 명중!`);
    } else if (ev.type === 'water') {
      const gap = S.dist - ev.d;
      if (gap > 0 && gap < 45) { if (takeHit('bubble', GAME.BUBBLE_TIME, `💧 ${players[ev.from]?.name || ''}님의 물폭탄!`)) sound.splash(); }
    }
  });
  eventsPrimed = true;
}

// ───────── 코스 이벤트(점프·발판·상자·바나나·충돌) ─────────
/** 이번 프레임에 트랙 지점 trackS를 지나갔으면 그 누적 위치를 반환 */
function crossed(trackS) {
  const a = S.prevDist, b = S.dist;
  if (b <= a) return null;
  const pos = trackS + Math.ceil((a - trackS) / TRACK_LEN) * TRACK_LEN;
  return pos > a && pos <= b ? pos : null;
}
const R_LANE = (n) => (R / n) * 0.95; // 코스 반폭
/** 상자가 지금 있는지 (누가 먹으면 0.5초 뒤 다시 생김) */
const boxKey = (ri, li) => `${ri}_${S.nLanes}_${li}`; // 줄·코스 수·코스 번호 (코스 수가 다르면 상자 위치도 다름)
function boxAvail(ri, li) {
  const key = boxKey(ri, li);
  const tk = Math.max(boxes[key] || 0, localBoxes[key] || 0);
  return !tk || db.now() - tk >= BOX_RESPAWN;
}
function courseEvents(t) {
  const n = S.nLanes;
  const w = splitWidthAt(S.dist);
  for (const js of JUMPS) if (crossed(js) != null && !S.air) { S.air = { start: t, dur: 1.2 }; sound.jump(); }
  if (S.air && t > S.air.start + S.air.dur) { S.air = null; sound.land(); scene.burst(scene.meScreen.x / scene.cssScale, scene.meScreen.y / scene.cssScale, 10, '#ffffff', 300); }
  for (const pad of PADS) {
    const pos = crossed(pad.s); if (pos == null) continue;
    if (padLanes(pad, n, Math.floor(pos / TRACK_LEN)).some((pl) => Math.abs(S.x - laneXAt(pl, n, w)) < R_LANE(n))) { S.pad = GAME.PAD_TIME; scene.addEffect('padflash'); sound.pad(); }
  }
  if (itemsOn()) {
    ITEM_ROWS.forEach((row, ri) => {
      const pos = crossed(row.s); if (pos == null) return;
      rowLanes(row, n).forEach((li) => {
        if (!boxAvail(ri, li) || Math.abs(S.x - laneXAt(li, n, splitWidthAt(pos))) > R_LANE(n)) return;
        const key = boxKey(ri, li);
        localBoxes[key] = db.now();
        db.set(`rooms/${room}/boxes/${key}`, db.now());
        if (S.items.length < 2) {
          const { list, rank } = myRankInfo();
          S.items.push(rollItem(list.length > 1 ? (rank - 1) / (list.length - 1) : 0.5));
          renderItems(); sound.pickup();
        }
      });
    });
    // 바나나 밟기
    for (const [hid, h] of Object.entries(hazards)) {
      if (h.by === pid && db.now() - h.t < 3000) continue;
      if (S.prevDist < h.d && S.dist >= h.d && Math.abs(S.x - h.x) < 0.7) {
        db.remove(`rooms/${room}/hazards/${hid}`);
        db.set(`rooms/${room}/events/${hid}h`, { type: 'bananaHit', to: pid, by: h.by, t: db.now() });
        delete hazards[hid];
        if (takeHit('spin', GAME.SPIN_TIME, `🍌 ${players[h.by]?.name || ''}님의 바나나를 밟았어요!`)) sound.slip();
      }
    }
  }
}
function collisions(t, tx) {
  if (S.goT == null || t - S.goT < GAME.START_GRACE) return; // 출발 직후에는 충돌 없음
  if (stunned() || S.shield > 0 || S.speed < 3 || S.air) return;
  for (const [oid, o] of others) {
    const p = progress[oid];
    if (!p || o.dd == null) continue;
    if ((S.bumpCD[oid] || 0) > t) continue;
    const dx = o.x - S.x, dd = o.dd;
    if (Math.abs(dx) > 0.8) continue;
    const rear = dd > 0 && dd < 1.5 && S.speed > (p.v || 0) + 2;
    const side = Math.abs(dd) < 1.0 && Math.abs(tx - S.x) > 0.12;
    if (rear || side) {
      S.bumpCD[oid] = t + 1.5;
      S.bump = GAME.BUMP_TIME; S.speed *= 0.75; S.shake = 0.3;
      if (side) S.x -= Math.sign(dx || 1) * 0.25;
      scene.addEffect('stars'); sound.bump();
      break;
    }
  }
}

// ───────── 동기화 ─────────
function fxForPublish() {
  const t = nowL();
  if (S.stun && t < S.stun.end) return { fx: S.stun.type, fs: S.stun.sStart, fe: S.stun.sEnd };
  if (S.air) return { fx: 'air', fs: db.now() - (t - S.air.start) * 1000, fe: db.now() + (S.air.start + S.air.dur - t) * 1000 };
  if (S.shield > 0) return { fx: 'shield', fs: 0, fe: db.now() + S.shield * 1000 };
  if (t < S.wobUntil) return { fx: 'wob', fs: db.now() - (GAME.HAZARD_TIME - (S.wobUntil - t)) * 1000, fe: db.now() + (S.wobUntil - t) * 1000 };
  return { fx: '', fs: 0, fe: 0 };
}
function publish(force = false) {
  const now = performance.now();
  if (!force && now - S.lastPub < 600) return;
  S.lastPub = now;
  db.set(`rooms/${room}/progress/${pid}`, {
    d: Math.round(S.dist * 10) / 10, v: Math.round(S.speed * 10) / 10, l: physLane(),
    c: S.correct, s: S.streak, b: S.best, j: [...S.judged].join(','), r: meta?.raceId || '', q: S.qi, n: S.nLanes, fin: S.finAt || 0, go: S.gridOff || 0,
    bo: S.boost > 0 || S.pad > 0 || S.nitro > 0 ? 1 : 0, ...fxForPublish(), t: db.now(),
  });
}

/** 점프 중 만세 정도 (도약 직후 팔을 올리고, 착지 직전 내림) */
const cheerAt = (ph) => Math.max(0, Math.min(1, ph / 0.12, (1 - ph) / 0.12));
/** 다른 레이서의 상태 이펙트를 그림 옵션으로 */
function fxDrawOpts(fx, fs, fe, now) {
  if (!fx || now > fe) return {};
  const ph = Math.max(0, Math.min(1, (now - fs) / Math.max(1, fe - fs)));
  if (fx === 'spin') return { spin: ph * Math.PI * 6 };
  if (fx === 'fly') return { flip: ph * Math.PI * 4, lift: Math.sin(ph * Math.PI) * 2.2 };
  if (fx === 'bubble') return { bubble: true, lift: 0.3 + Math.sin(ph * Math.PI * 4) * 0.08 };
  if (fx === 'air') return { lift: Math.sin(ph * Math.PI) * 1.3, cheer: cheerAt(ph) };
  if (fx === 'shield') return { shield: true };
  if (fx === 'wob') return { wobble: 1 - ph * 0.55 };
  return {};
}

// ───────── HUD ─────────
let hudTimer = 0;
$('loop-path').setAttribute('d', SHAPE_PATH);
$('loop-path2').setAttribute('d', SHAPE_PATH);
function updateHUD(dt) {
  hudTimer += dt;
  const kmh = Math.round(S.speed * 3.6);
  $('speed-n').textContent = kmh;
  $('speed-arc').setAttribute('stroke-dasharray', `${Math.min(100, kmh / 2)} 100`);
  if (hudTimer < 0.25) return;
  hudTimer = 0;
  const { list, rank } = myRankInfo();
  $('rank-n').textContent = rank || '-'; $('rank-of').textContent = `/${list.length}`;
  $('hud-top').innerHTML = list.slice(0, 5).map((x, i) => {
    const pl = players[x.id] || {};
    return `<li class="${x.id === pid ? 'me' : ''}"><img src="${avatarURL(pl, 44)}" alt="">${i + 1}. ${esc(pl.name || '')}</li>`;
  }).join('');
  $('lap-n').textContent = Math.min(S.qi + 1, NQ());
  $('lap-of').textContent = NQ();
  $('lap-num').textContent = Math.min(lapOf(S.dist), Math.max(1, NQ()));
  $('acc').textContent = S.correct;
  $('combo').textContent = S.streak >= 2 ? `🔥 ${S.streak} COMBO` : '';
  const elapsed = meta?.raceStart ? effNow() - meta.raceStart : 0;
  $('clock').textContent = fmtTime(elapsed);
  // 순환 미니맵
  $('loop-dots').innerHTML = list.slice().reverse().map((x) => {
    const pl = players[x.id] || {}; const [mx, my] = mapPoint(x.d); const mine = x.id === pid;
    return `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${mine ? 5.5 : 3.6}" fill="${pl.color || '#999'}" stroke="${mine ? '#ffd60a' : '#fff'}" stroke-width="${mine ? 2.2 : 1.2}"/>`;
  }).join('');
}

function showFinal() {
  S.finishedShown = true;
  publish(true);
  setTimeout(() => {
    const { rank } = myRankInfo();
    $('final-rank').textContent = `${rank || '-'}위`;
    $('final-correct').textContent = `${S.correct}/${quiz?.length || 0}`;
    $('final-streak').textContent = S.best;
    $('final-dist').textContent = `${(S.dist / 1000).toFixed(2)}km`;
    $('final-title').textContent = S.finAt ? '🏁 FINISH!' : '🏁 레이스 종료';
    $('final-msg').textContent = rank === 1 ? '🏆 우승! 최고의 수학 레이서!' : rank <= 3 ? '🎉 시상대에 올랐어요!' : S.correct >= (quiz?.length || 1) * 0.7 ? '👍 훌륭해요! 실력이 쑥쑥!' : '💪 다음 레이스에서 더 빨라질 거예요!';
    drawPreview($('final-av'), me);
    $('scr-final').classList.remove('hidden');
    sound.music(null);
    sound.fanfare(rank === 1 ? 'win' : rank <= 3 ? 'podium' : 'good');
  }, 1600);
}

// ───────── 메인 루프 ─────────
function effNow() { return meta?.status === 'paused' && phase?.pausedAt ? phase.pausedAt : db.now(); }

let last = performance.now();
function frame(tms) {
  const dt = Math.min(0.05, (tms - last) / 1000); last = tms;
  const t = nowL();
  const st = { dist: S.dist, speed: S.speed, playerX: S.x, lean: S.lean, boost: false, slow: S.slow, me: { avatar: me || draft, name: me?.name || draft.name, theme: themeOf(me) }, others: [], hazards: [], items: false };
  let tx = S.x;
  if (db && joined && meta && me) {
    const now = effNow();
    const status = meta.status;
    const kind = phase?.kind;
    const N = NQ();
    if (quiz && status !== 'lobby') syncQi();
    // 배경음악: 카운트다운부터 완주 전까지, 내 맵에 맞는 곡 (일시정지 중엔 멈춤)
    sound.music(status === 'racing' && (kind === 'count' || kind === 'race') && !S.finAt ? themeOf(me) : null);
    const showingResult = S.resultIdx >= 0 && t < S.resultUntil;
    const dispIdx = showingResult ? S.resultIdx : S.qi;
    const q = quiz?.[Math.min(dispIdx, Math.max(0, N - 1))];
    const n = q?.choices?.length || 4;
    if (n !== S.nLanes) { const nx = scene.laneX(Math.min(S.lane, S.nLanes - 1), S.nLanes); S.nLanes = n; scene.lanes = n; let best = 0; for (let i = 0; i < n; i++) if (Math.abs(scene.laneX(i, n) - nx) < Math.abs(scene.laneX(best, n) - nx)) best = i; setLane(best, false); }
    scene.lanes = S.nLanes;
    if (S.lane >= S.nLanes) setLane(S.nLanes - 1, false);
    const finished = status === 'finished' || !!S.finAt;
    const moving = status === 'racing' && kind === 'race' && !S.finAt;
    if (moving && S.goT == null) S.goT = t;
    // 속도
    let m = 1;
    if (S.boost > 0) m = Math.max(m, GAME.BOOST_MULT);
    if (S.pad > 0) m = Math.max(m, GAME.PAD_MULT);
    if (S.nitro > 0) m = Math.max(m, GAME.NITRO_MULT);
    if (S.slow > 0) m *= GAME.SLOW_MULT;
    if (S.bump > 0) m *= GAME.BUMP_MULT;
    // 맵별 장애물 (2바퀴에 한 곳, 코스 2개) — 점프로 공중에 떠 있으면 넘어감
    scene.hazardSeed = meta?.raceId || null;
    {
      const theme = themeOf(me), lapI = Math.floor(S.dist / TRACK_LEN);
      const hz = moving && S.dist >= 0 ? hazardAt(lapI, S.nLanes, meta?.raceId || '', theme) : null;
      const rel = hz ? S.dist - lapI * TRACK_LEN - hz.s : -1;
      const on = !!hz && !S.air && rel >= 0 && rel < hz.len && hz.lanes.includes(laneOfX(S.x));
      const inSnow = on && hz.kind === 'snowdrift';
      if (inSnow && !S.inSnow) { sound.snowdrift(); toast('❄️ 눈더미에 빠졌어요! 지나는 동안 느려져요'); }
      S.inSnow = inSnow;
      if (on && hz.kind !== 'snowdrift' && S.hzHit !== lapI) {
        S.hzHit = lapI; S.hzSlow = GAME.HAZARD_TIME;
        if (hz.kind === 'rock') { S.wobUntil = t + GAME.HAZARD_TIME; sound.rock(); S.shake = 0.25; toast('🪨 돌부리에 걸렸어요! 3초 동안 휘청휘청'); }
        else { sound.mud(); toast('🟤 흙탕물 웅덩이! 3초 동안 느려져요'); }
      }
      if (S.inSnow || S.hzSlow > 0) m *= GAME.HAZARD_MULT;
    }
    // 스로틀: 누르고 있으면 점점 오르고, 떼면 천천히 내려감. 부스트·발판·니트로 중에는 최대로
    if (moving && status !== 'paused') {
      if (S.gas && !stunned()) S.power = Math.min(1, S.power + dt * GAME.GAS_UP);
      else S.power = Math.max(0, S.power - dt * (S.brake ? GAME.BRAKE_DOWN : GAME.GAS_DOWN));
    } else if (!moving) S.power = 0;
    const thr = S.boost > 0 || S.pad > 0 || S.nitro > 0 ? 1 : S.power;
    gasBtn.style.setProperty('--p', S.power.toFixed(3));
    $('gas-hint').classList.toggle('show', moving && !S.gasUsed && t - (S.raceT0 ?? (S.raceT0 = t)) > 0.5);
    if (!moving) S.raceT0 = null;
    let target = moving && !finished ? GAME.BASE_SPEED * thr * m : 0;
    S.prevDist = S.dist;
    if (status === 'paused') { S.speed = 0; } else {
      if (stunned()) S.speed *= Math.max(0, 1 - dt * 5);
      else S.speed += (target - S.speed) * Math.min(1, dt * (target > S.speed ? 2.2 : 3));
      S.dist += S.speed * dt;
      for (const k of ['boost', 'pad', 'nitro', 'slow', 'bump', 'shield', 'fog', 'shake', 'hzSlow']) S[k] = Math.max(0, (S[k] || 0) - dt);
    }
    // 미사일 명중
    if (S.incoming && t >= S.incoming.hitAt) {
      const fromId = S.incoming.from, from = players[fromId]?.name || '';
      S.incoming = null; $('warn').classList.remove('show');
      if (takeHit('fly', GAME.FLY_TIME, `🚀 ${from}님의 미사일에 맞았어요!`)) {
        scene.addEffect('boom'); sound.boom(); S.shake = 0.5;
        db.set(`rooms/${room}/events/m${Date.now()}${pid}`, { type: 'missileHit', to: pid, by: fromId, from: pid, t: db.now() });
      }
    }
    if (moving) courseEvents(t);
    // 문제통과지점 판정 (한 바퀴에 한 번, 고정 위치)
    if (moving && quiz && S.qi < N) {
      const cp = checkpointAbs(S.qi);
      if (S.prevDist < cp && S.dist >= cp) { S.seen.add(S.qi); judge(S.qi); }
    }
    // 결승선
    if (moving && quiz && S.qi >= N && N > 0 && S.dist >= N * TRACK_LEN) {
      S.finAt = db.now() - (S.creditMs || 0); publish(true); // 기록 = 실제 시간 − 뒷줄 보정
      centerMsg('FINISH!', 'gold'); sound.finish();
      setTimeout(() => { if (!S.finishedShown) showFinal(); }, 1200);
    }
    if (kind === 'count' && status !== 'lobby') {
      $('qbanner').classList.add('hidden'); bannerKey = '';
      st.startLine = true;
      const left = Math.ceil((phase.end - now) / 1000) - 1;
      const key = left > 0 ? String(left) : 'GO!';
      if (S.countKey !== key && phase.end - now < 3600 && status !== 'paused') { S.countKey = key; centerMsg(key, left > 0 ? '' : 'gold'); left > 0 ? sound.count() : sound.go(); }
    } else if (quiz && status !== 'lobby' && showingResult) {
      renderBanner(S.resultIdx, 'result');
      revealAnswer(S.resultIdx);
      $('q-timer').style.width = '0%';
      $('q-dist').textContent = '';
    } else if (quiz && status !== 'lobby' && S.qi < N && !S.finAt) {
      renderBanner(S.qi, 'question');
      const cp = checkpointAbs(S.qi), from = S.qi === 0 ? 0 : checkpointAbs(S.qi - 1);
      const dCP = Math.max(0, cp - S.dist);
      const p = Math.min(1, dCP / (cp - from));
      $('q-timer').style.width = `${p * 100}%`; $('q-timer').style.backgroundPosition = `${p * 100}% 0`;
      $('q-dist').textContent = `문제 지점까지 ${Math.round(dCP)} m`;
      const secs = Math.ceil(dCP / Math.max(8, S.speed));
      if (secs <= 3 && secs > 0 && secs !== S.lastTick && moving) { S.lastTick = secs; sound.tick(); }
      if (secs > 3) S.lastTick = -1;
      if (dCP < 108) st.gate = { z: 3 + dCP, label: `Q${S.qi + 1}`, choices: q.choices };
    } else if (quiz && status !== 'lobby' && N > 0) {
      showFinishBanner();
    }
    if (N > 0 && S.qi >= N) { const dF = N * TRACK_LEN - S.dist; if (dF > -2 && dF < 108) st.finish = { z: 3 + dF }; }
    if (st.gate) scene.ensureSigns(st.gate.choices);
    // 다른 레이서 (위치를 부드럽게 보간)
    const sNow = db.now();
    for (const [oid, p] of Object.entries(progress)) {
      if (oid === pid || !players[oid]) { others.delete(oid); continue; }
      const est = estDist(p);
      const o = others.get(oid) || { d: est, x: 0 };
      o.d += (est - o.d) * Math.min(1, dt * 6);
      const on = p.n || S.nLanes;
      const ox = laneXAt(Math.min(p.l ?? (hashStr(oid) % on), on - 1), on, splitWidthAt(o.d));
      o.x += (ox - o.x) * Math.min(1, dt * 8);
      o.dd = o.d - S.dist;
      others.set(oid, o);
    }
    tx = scene.laneX(physLane(), S.nLanes, S.dist);
    if (moving) collisions(t, tx);
    st.others = [...others.entries()].filter(([, o]) => o.dd > -0.8 && o.dd < 90).sort((a, b) => Math.abs(a[1].dd) - Math.abs(b[1].dd)).slice(0, 10)
      .map(([oid, o]) => {
        const p = progress[oid]; const pl = players[oid];
        return { dd: o.dd, x: o.x, label: pl.name, avatar: pl, name: pl.name, theme: themeOf(pl), boost: !!p.bo, seed: hashStr(oid) % 10, ...fxDrawOpts(p.fx, p.fs, p.fe, sNow) };
      });
    st.hazards = itemsOn() ? Object.values(hazards).map((h) => ({ dd: h.d - S.dist, x: h.x })) : [];
    st.items = itemsOn();
    st.boxAvail = boxAvail;
    const zn = zoneAt(S.dist);
    st.camElev = surfaceH(S.x, S.dist, S.nLanes);
    st.inTunnel = !!zn && zn.kind === 'tunnel' && tunnelCovered(S.dist) && sideOf(S.x, S.nLanes) === zn.side;
    st.boost = S.boost > 0 || S.pad > 0 || S.nitro > 0;
    st.fog = S.fog;
    st.shake = S.shake > 0;
    // 내 상태 이펙트
    const meFx = {};
    if (S.stun && t < S.stun.end) {
      const ph = (t - S.stun.start) / (S.stun.end - S.stun.start);
      if (S.stun.type === 'spin') meFx.spin = ph * Math.PI * 6;
      if (S.stun.type === 'fly') { meFx.flip = ph * Math.PI * 4; meFx.lift = Math.sin(ph * Math.PI) * 2.2; }
      if (S.stun.type === 'bubble') { meFx.bubble = true; meFx.lift = 0.3; }
    }
    if (S.air) { const ph = Math.min(1, (t - S.air.start) / S.air.dur); meFx.lift = Math.sin(ph * Math.PI) * 1.3; meFx.cheer = cheerAt(ph); }
    if (S.shield > 0) meFx.shield = true;
    if (t < S.wobUntil) meFx.wobble = 0.45 + 0.55 * ((S.wobUntil - t) / GAME.HAZARD_TIME);
    Object.assign(st.me, meFx);
    if (status !== 'lobby') publish();
    updateHUD(dt);
  } else {
    sound.music(null);
    st.startLine = true;
    tx = scene.laneX(Math.min(S.lane, S.nLanes - 1), S.nLanes, S.dist);
  }
  // 코스 이동 부드럽게
  S.x += (tx - S.x) * Math.min(1, dt * 9);
  S.lean += (Math.sign(tx - S.x) * Math.min(1, Math.abs(tx - S.x) * 2) - S.lean) * Math.min(1, dt * 8);
  st.playerX = S.x; st.lean = S.lean; st.dist = S.dist; st.speed = S.speed;
  scene.render(st, dt);
  requestAnimationFrame(frame);
}

// 테스트·디버그용
window.__kmr = { boxAvail: (ri, li) => boxAvail(ri, li),  S, useItem, renderItems };

// ───────── 시작 ─────────
(async () => {
  mockBanner();
  renderJoinPickers();
  renderItems();
  try { db = await getBackend(); } catch (e) { showMsg('서버 연결 실패', e.message); return; }
  const savedPid = room && idStore.getItem(`kmr-pid-${room}`);
  if (savedPid) {
    const prev = await db.get(`rooms/${room}/players/${savedPid}`);
    const m = await db.get(`rooms/${room}/meta`);
    if (prev && m) {
      pid = savedPid; joined = true;
      Object.assign(draft, { name: prev.name, color: prev.color, ears: prev.ears, theme: prev.theme || draft.theme });
      await db.update(`rooms/${room}/players/${pid}`, { online: true });
      db.onDisconnectUpdate(`rooms/${room}/players/${pid}`, { online: false });
      subscribe();
    } else showJoin();
  } else showJoin();
  requestAnimationFrame(frame);
})();
