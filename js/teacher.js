// 교사 콘솔: 방 만들기 · QR · 설정 · 진행 · 결과
import { getBackend, mockBanner, isMock } from './backend.js';
import { qrSVG } from './qr.js';
import { parseQuestionFile } from './question-parser.js';
import { GAME, THEMES, ITEMS, LANE_COLORS, LANE_LABELS, mathHTML, esc, shuffle, avatarURL, sound, fmtTime, fmtTimeD } from './common.js';
import { SHAPE_PATH, mapPoint, lapOf, TRACK_LEN } from './track.js';

const $ = (id) => document.getElementById(id);
let db, room;
let celebrated = null; // 축하 팡파르를 울린 레이스
let meta = null, phase = null, quiz = null, players = {}, progress = {}, answers = {}, events = {};
let sets = [];          // 문제 폴더 세트
const localSets = [];   // 직접 불러온 세트
const cfg = Object.assign({ theme: 'snow', setId: null, count: 10, time: GAME.DEFAULT_Q_TIME, shuffle: false, items: true, maxChoices: 6 }, JSON.parse(localStorage.getItem('kmr-teacher-cfg') || '{}'));
const saveCfg = () => localStorage.setItem('kmr-teacher-cfg', JSON.stringify(cfg));
const base = () => `rooms/${room}`;
const unsubs = [];

// ───────── 방 ─────────
async function createRoom() {
  let code;
  for (let i = 0; i < 20; i++) {
    code = String(Math.floor(100000 + Math.random() * 900000));
    if (!(await db.get(`rooms/${code}/meta`))) break;
  }
  await db.set(`rooms/${code}`, { meta: { status: 'lobby', theme: cfg.theme, createdAt: db.now() } });
  localStorage.setItem('kmr-teacher-room', code);
  return code;
}

async function openRoom(code) {
  unsubs.splice(0).forEach((u) => u && u());
  room = code;
  $('h-code').textContent = room; $('room-code').textContent = room; $('r-code').textContent = room;
  const url = `${location.origin}${location.pathname.replace(/teacher\.html$/, '')}play.html?room=${room}`;
  $('qr').innerHTML = qrSVG(url);
  $('join-url').textContent = url + (isMock ? '  (로컬 테스트: 같은 브라우저의 새 탭에서 열기)' : '');
  $('join-url').onclick = () => window.open(url, '_blank');
  $('btn-open-student').onclick = () => window.open(url, '_blank');
  unsubs.push(db.on(`${base()}/meta`, (v) => { meta = v; route(); }));
  unsubs.push(db.on(`${base()}/phase`, (v) => { phase = v; }));
  unsubs.push(db.on(`${base()}/quiz`, (v) => { quiz = v ? Object.values(v) : null; }));
  unsubs.push(db.on(`${base()}/players`, (v) => { players = v || {}; renderPlayers(); }));
  unsubs.push(db.on(`${base()}/progress`, (v) => { progress = v || {}; }));
  unsubs.push(db.on(`${base()}/answers`, (v) => { answers = v || {}; }));
  unsubs.push(db.on(`${base()}/events`, (v) => { events = v || {}; renderFeed(); }));
}

$('btn-newroom').onclick = async () => {
  if (!confirm('새 방을 만들까요? 지금 방의 학생들은 새 QR로 다시 입장해야 해요.')) return;
  const old = room;
  await openRoom(await createRoom());
  if (old) db.remove(`rooms/${old}`);
};
$('btn-sound').onclick = () => { $('btn-sound').textContent = sound.toggle() ? '🔇' : '🔊'; };
$('btn-sound').textContent = sound.muted ? '🔇' : '🔊';

// ───────── 화면 전환 ─────────
function route() {
  if (!meta) return;
  const st = meta.status;
  $('v-lobby').classList.toggle('hidden', st !== 'lobby');
  $('v-race').classList.toggle('hidden', !(st === 'racing' || st === 'paused'));
  $('v-final').classList.toggle('hidden', st !== 'finished');
  $('btn-pause').textContent = st === 'paused' ? '▶ 다시 출발' : '⏸ 일시정지';
  $('h-info').textContent = st === 'lobby' ? '' : `${THEMES[meta.theme]?.emoji || '🎲'} ${meta.setTitle || ''}`;
  if (st === 'finished') {
    renderFinal();
    // 시상식 축하 팡파르 (레이스마다 한 번, 방금 끝난 경우만)
    const key = `${meta.raceId}`;
    if (celebrated !== key && db.now() - (meta.finishedAt || 0) < 15000) { celebrated = key; setTimeout(() => sound.fanfare('win'), 400); }
  }
}

// ───────── 대기실: 참가자 ─────────
function renderPlayers() {
  const list = Object.entries(players).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  $('p-count').textContent = list.length;
  $('p-grid').innerHTML = list.map(([id, p]) => `
    <div class="p-chip ${p.online === false ? 'off' : ''}">
      <button class="kick" data-kick="${id}" title="퇴장">×</button>
      <img src="${avatarURL(p, 128)}" alt="">${esc(p.name)}
      ${meta?.theme === 'choice' ? `<div style="font-size:18px">${THEMES[p.theme]?.emoji || ''}</div>` : ''}
    </div>`).join('') || '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;font-weight:800;padding:40px 0">QR 코드를 찍고 입장해 주세요!</div>';
}
$('p-grid').onclick = async (e) => {
  const id = e.target.dataset.kick; if (!id) return;
  if (!confirm(`${players[id]?.name} 학생을 퇴장시킬까요?`)) return;
  await db.update(base(), { [`players/${id}`]: null, [`progress/${id}`]: null });
};

// ───────── 대기실: 설정 ─────────
function renderThemes() {
  const opts = [...Object.values(THEMES), { id: 'choice', name: '학생이 직접 고르기', emoji: '🎲', desc: '각자 좋아하는 탈것으로 달려요' }];
  $('theme-cards').innerHTML = opts.map((t) => `<button class="theme-card ${cfg.theme === t.id ? 'sel' : ''}" data-t="${t.id}"><span class="em">${t.emoji}</span><span><b>${t.name}</b><small>${t.desc}</small></span></button>`).join('');
}
$('theme-cards').onclick = async (e) => {
  const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return;
  cfg.theme = t; saveCfg(); renderThemes();
  await db.update(`${base()}/meta`, { theme: t });
  renderPlayers();
};

async function loadSets() {
  try {
    const r = await fetch(`data/question-sets.json?t=${Date.now()}`, { cache: 'no-store' });
    sets = (await r.json()).sets || [];
    $('set-note').textContent = `문제 폴더에서 ${sets.length}개 세트를 읽었어요.`;
  } catch {
    sets = [];
    $('set-note').textContent = '문제 폴더를 읽지 못했어요. "파일 직접 불러오기"를 사용하거나 README를 확인하세요.';
  }
  renderSetSelect();
}
const allSets = () => [...sets, ...localSets];
function renderSetSelect() {
  const list = allSets();
  if (!list.find((s) => s.id === cfg.setId)) cfg.setId = list[0]?.id || null;
  $('set-select').innerHTML = list.map((s) => `<option value="${esc(s.id)}" ${s.id === cfg.setId ? 'selected' : ''}>${s.local ? '📂 ' : ''}${esc(s.title)} (${s.questions.length}문제)</option>`).join('') || '<option>문제 세트가 없어요</option>';
  renderSetPreview();
}
function renderSetPreview() {
  const s = allSets().find((x) => x.id === cfg.setId);
  $('btn-start').disabled = !s;
  if (!s) { $('set-preview').innerHTML = ''; return; }
  $('in-count').max = s.questions.length;
  $('in-count').value = Math.min(cfg.count || s.questions.length, s.questions.length);
  $('set-preview').innerHTML = `<ol>${s.questions.map((q) => `<li>${q.img ? '🖼️ ' : ''}${mathHTML(q.q)} → <b>${mathHTML(q.answer)}</b></li>`).join('')}</ol>`;
}
$('set-select').onchange = (e) => { cfg.setId = e.target.value; cfg.count = 999; saveCfg(); renderSetPreview(); };
$('btn-reload-sets').onclick = loadSets;
$('in-count').onchange = (e) => { cfg.count = Number(e.target.value); saveCfg(); };
$('in-choices').onchange = (e) => { cfg.maxChoices = Number(e.target.value) || 6; saveCfg(); };
$('in-shuffle').onchange = (e) => { cfg.shuffle = e.target.checked; saveCfg(); };
$('in-items').onchange = async (e) => { cfg.items = e.target.checked; saveCfg(); await db.update(`${base()}/meta`, { items: cfg.items }); };
$('file-in').onchange = async (e) => {
  const notes = [];
  for (const f of e.target.files) {
    const buf = await f.arrayBuffer();
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('euc-kr').decode(buf); }
    const { title, questions, warnings } = parseQuestionFile(f.name, text);
    if (questions.length) { const id = `local:${f.name}:${Date.now()}`; localSets.push({ id, title, questions, local: true }); cfg.setId = id; }
    notes.push(`${f.name}: ${questions.length}문제${warnings.length ? ` (⚠ ${warnings.join(', ')})` : ''}`);
  }
  $('set-note').textContent = notes.join(' / ');
  e.target.value = '';
  renderSetSelect();
};

// ───────── 레이스 시작/진행 ─────────
async function startRace() {
  const s = allSets().find((x) => x.id === cfg.setId);
  if (!s) return;
  sound.unlock();
  const count = Math.max(1, Math.min(Number($('in-count').value) || s.questions.length, s.questions.length));
  const picked = (cfg.shuffle ? shuffle(s.questions) : s.questions).slice(0, count);
  const maxC = Math.max(2, Math.min(6, cfg.maxChoices || 6));
  const qz = picked.map((q) => {
    const choices = shuffle([q.answer, ...shuffle(q.wrong).slice(0, maxC - 1)]);
    return { q: q.q, choices, answer: choices.indexOf(q.answer), explain: q.explain || '', img: q.img || '' };
  });
  const now = db.now();
  const raceId = now.toString(36);
  // 출발 대열: 접속 중인 학생을 무작위로 섞어 6코스 × 여러 줄에 배치 (뒷줄 보정은 학생 화면에서 기록에 반영)
  const grid = {};
  shuffle(Object.entries(players).filter(([, p]) => p.online !== false).map(([id]) => id)).forEach((id, i) => { grid[id] = i; });
  revealed.clear(); selQ = null;
  await db.update(base(), {
    quiz: qz, progress: null, answers: null, hazards: null, events: null, boxes: null, 'meta/items': cfg.items !== false,
    phase: { kind: 'count', start: now, end: now + GAME.COUNTDOWN },
    'meta/status': 'racing', 'meta/raceId': raceId, 'meta/raceStart': now + GAME.COUNTDOWN,
    'meta/grid': grid, 'meta/gridCols': qz[0]?.choices.length || maxC, 'meta/total': qz.length, 'meta/trackLen': qz.length * TRACK_LEN, 'meta/setTitle': s.title, 'meta/theme': cfg.theme,
  });
}
$('btn-start').onclick = () => {
  if (!Object.keys(players).length && !confirm('아직 참가한 학생이 없어요. 그래도 시작할까요?')) return;
  startRace();
};

let advancing = false;
async function tick() {
  if (!meta || meta.status !== 'racing' || !phase || !quiz || advancing) return;
  const now = db.now();
  advancing = true;
  try {
    if (phase.kind === 'count' && now >= phase.end) { await db.set(`${base()}/phase`, { kind: 'race', start: phase.end, end: 0 }); return; }
    // 참가 중인 학생이 모두 완주하면 자동 종료
    const racers = Object.entries(players).filter(([, p]) => p.online !== false);
    if (phase.kind === 'race' && racers.length && racers.every(([id]) => progress[id]?.fin)) {
      await db.update(base(), { 'meta/status': 'finished', 'meta/finishedAt': now });
    }
  } finally { advancing = false; }
}

$('btn-pause').onclick = async () => {
  if (!phase) return;
  const now = db.now();
  if (meta.status === 'racing') await db.update(base(), { 'meta/status': 'paused', 'phase/pausedAt': now });
  else if (meta.status === 'paused') {
    const d = now - (phase.pausedAt || now);
    await db.update(base(), { 'meta/status': 'racing', 'meta/raceStart': (meta.raceStart || now) + d, phase: { ...phase, start: phase.start + d, end: phase.end + d, pausedAt: null } });
  }
};
$('btn-end').onclick = async () => {
  if (!confirm('레이스를 지금 끝낼까요? 완주한 순서 다음으로, 달린 거리로 순위가 정해져요.')) return;
  await db.update(base(), { 'meta/status': 'finished', 'meta/finishedAt': db.now() });
};
$('btn-again').onclick = () => startRace();
$('btn-lobby').onclick = () => db.update(base(), { 'meta/status': 'lobby', phase: null, quiz: null, progress: null, answers: null, hazards: null, events: null, boxes: null });

// ───────── 레이스 화면 그리기 ─────────
/** 순위: 완주 시각 순 → 달린 거리 순 */
function standings() {
  return Object.entries(players).map(([id, p]) => ({ id, p, g: progress[id] || {} }))
    .sort((a, b) => (a.g.fin && b.g.fin ? a.g.fin - b.g.fin : a.g.fin ? -1 : b.g.fin ? 1 : effD(b.g) - effD(a.g) || (b.g.c || 0) - (a.g.c || 0)));
}

let selQ = null;              // 선택한 문제 (null = 자동: 가장 많은 학생이 풀고 있는 문제)
const revealed = new Set();   // 정답을 공개한 문제
$('r-chips').onclick = (e) => {
  const c = e.target.closest('[data-q]'); if (!c) return;
  selQ = c.dataset.q === 'auto' ? null : Number(c.dataset.q); lastQKey = '';
};
$('btn-reveal').onclick = () => { const i = currentSel(); if (i == null) return; revealed.has(i) ? revealed.delete(i) : revealed.add(i); lastQKey = ''; };
function currentSel() {
  if (!quiz) return null;
  if (selQ != null) return selQ;
  const cnt = {};
  Object.entries(progress).forEach(([id, g]) => { if (players[id] && !g.fin) cnt[Math.min(g.q || 0, quiz.length - 1)] = (cnt[Math.min(g.q || 0, quiz.length - 1)] || 0) + 1; });
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return best ? Number(best[0]) : quiz.length - 1;
}

let lastQKey = '';
function renderRace() {
  if (!meta || !(meta.status === 'racing' || meta.status === 'paused') || !quiz || !phase) return;
  const N = quiz.length;
  const nP = Object.keys(players).length;
  const i = currentSel(); const q = quiz[i];
  const ans = answers?.[i] || {};
  const answered = Object.keys(ans).length;
  const passedAll = nP > 0 && Object.entries(players).every(([id]) => ans[id] || (progress[id]?.q || 0) > i);
  const showAns = revealed.has(i) || passedAll;
  // 문제 칩: 통과 인원·정답률
  $('r-chips').innerHTML = `<button class="qchip auto ${selQ == null ? 'sel' : ''}" data-q="auto">자동<small>풀고 있는 문제</small></button>` + quiz.map((_, k) => {
    const a = Object.values(answers?.[k] || {}); const ok = a.filter((x) => x.ok).length;
    return `<button class="qchip ${k === i ? 'sel' : ''}" data-q="${k}">Q${k + 1}<small>${a.length}명${a.length ? ' · ' + Math.round((ok / a.length) * 100) + '%' : ''}</small><i style="width:${nP ? (a.length / nP) * 100 : 0}%"></i></button>`;
  }).join('');
  const key = `${phase.kind}|${i}|${showAns}`;
  if (key !== lastQKey) {
    lastQKey = key;
    $('r-qnum').innerHTML = phase.kind === 'count' ? 'READY<small>곧 출발!</small>' : `Q${i + 1}<small>/${N}</small>`;
    $('r-qtext').innerHTML = phase.kind === 'count' ? `${THEMES[meta.theme]?.emoji || '🎲'} ${esc(meta.setTitle || '')} — 3, 2, 1… 출발!` : mathHTML(q.q);
    const ri = $('r-qimg');
    if (phase.kind !== 'count' && q.img) { ri.src = q.img; ri.classList.remove('hidden'); } else { ri.removeAttribute('src'); ri.classList.add('hidden'); }
    $('r-opts').innerHTML = phase.kind === 'count' ? '' : q.choices.map((c, k) => `<div class="opt ${showAns && k === q.answer ? 'correct' : ''}" style="--lane:${LANE_COLORS[k]}"><b>${LANE_LABELS[k]}</b>${mathHTML(c)}</div>`).join('');
    $('btn-reveal').textContent = showAns ? (passedAll ? '모두 통과 ✔' : '정답 숨기기') : '정답 공개';
  }
  // 원: 이 문제를 통과한 학생 비율
  const pr = nP ? answered / nP : 0;
  $('r-ring').setAttribute('stroke-dasharray', `${pr * 100} 100`);
  $('r-ring').setAttribute('stroke', passedAll ? '#22c55e' : '#8338ec');
  $('r-sec').innerHTML = `<span style="font-size:26px">${answered}<small style="font-size:14px">/${nP}</small></span>`;

  // 응답 분포
  const counts = q.choices.map(() => 0); let okN = 0;
  Object.values(ans).forEach((a) => { if (counts[a.c] != null) counts[a.c]++; if (a.ok) okN++; });
  $('r-dist-title').textContent = `📊 Q${i + 1} 응답 (통과 ${answered}명)`;
  $('r-dist').innerHTML = q.choices.map((c, k) => {
    const pct = answered ? (counts[k] / answered) * 100 : 0;
    return `<div class="dist-bar ${showAns && k === q.answer ? 'correct' : ''}" style="--lane:${LANE_COLORS[k]}"><b>${LANE_LABELS[k]}</b><div class="bar"><i style="width:${pct}%"></i></div><span>${counts[k]}</span></div>`;
  }).join('');
  $('r-answered').textContent = `완주 ${Object.values(progress).filter((g) => g.fin).length}/${nP}`;
  $('r-rate').textContent = showAns && answered ? `정답률 ${Math.round((okN / answered) * 100)}%` : '';

  // 트랙
  const st = standings();
  const lanesEl = $('r-lanes');
  const rowH = Math.max(28, Math.min(56, Math.floor(lanesEl.clientHeight / Math.max(1, st.length))));
  const L = meta.trackLen || N * TRACK_LEN;
  const existing = new Map([...lanesEl.children].map((el) => [el.dataset.id, el]));
  st.forEach((x, idx) => {
    let row = existing.get(x.id);
    if (!row) {
      row = document.createElement('div'); row.className = 't-row'; row.dataset.id = x.id;
      row.innerHTML = `<div class="pos"></div><div class="lane"><div class="runner"><img alt=""><span></span><b class="lapb"></b><em class="fx"></em></div></div>`;
      lanesEl.appendChild(row);
    }
    existing.delete(x.id);
    row.style.height = rowH + 'px'; row.style.order = idx;
    row.className = `t-row ${idx < 3 ? 'top' + (idx + 1) : ''}`;
    row.querySelector('.pos').textContent = idx + 1;
    const img = row.querySelector('img'); const src = avatarURL(x.p, 80);
    if (img.getAttribute('src') !== src) img.src = src;
    img.style.width = img.style.height = Math.round(rowH * 0.85) + 'px';
    row.querySelector('span').textContent = x.p.name;
    row.querySelector('.lapb').textContent = x.g.fin ? '🏁 완주' : `Q${Math.min((x.g.q || 0) + 1, N)}`;
    const runner = row.querySelector('.runner');
    runner.style.left = `${x.g.fin ? 95 : Math.min(95, Math.max(3, ((x.g.d || 0) / L) * 92 + 3))}%`;
    runner.classList.toggle('boosting', !!x.g.bo);
    const fxOn = x.g.fx && db.now() < (x.g.fe || 0);
    const fxIcon = fxOn ? ({ spin: '🌀', fly: '💥', bubble: '🫧', air: '🛫', shield: '🛡️' }[x.g.fx] || '') : '';
    row.querySelector('.fx').textContent = fxIcon || (x.g.bo ? '💨' : (x.g.s >= 3 ? '🔥' : ''));
  });
  existing.forEach((el) => el.remove());
  // 순환 미니맵
  $('t-loop-dots').innerHTML = st.slice().reverse().map((x, i) => {
    const [mx, my] = mapPoint(x.g.d || 0); const top = i >= st.length - 3;
    return `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${top ? 5 : 3.6}" fill="${x.p.color || '#999'}" stroke="${top ? '#1b1b2f' : '#fff'}" stroke-width="1.4"><title>${esc(x.p.name)} · LAP ${lapOf(x.g.d || 0)}</title></circle>`;
  }).join('');
  lanesEl.style.display = 'flex'; lanesEl.style.flexDirection = 'column';
}

// ───────── 아이템 로그 ─────────
function renderFeed() {
  const name = (id) => esc(players[id]?.name || '?');
  const list = Object.values(events).sort((a, b) => b.t - a.t).slice(0, 6).map((e) => {
    if (e.type === 'missile') return `🚀 ${name(e.from)} → ${name(e.to)}`;
    if (e.type === 'banana') return `🍌 ${name(e.from)} 바나나 설치`;
    if (e.type === 'bananaHit') return `🌀 ${name(e.to)} 바나나 밟음!`;
    if (e.type === 'fog') return `🌫️ ${name(e.from)} 안개 발사`;
    if (e.type === 'water') return `💧 ${name(e.from)} 물폭탄`;
    return '';
  }).filter(Boolean);
  $('t-feed').innerHTML = list.length ? list.map((l) => `<li>${l}</li>`).join('') : `<li class="muted">${meta?.items === false ? '스피드전 (아이템 없음)' : '아이템 사용 기록이 여기에 나와요'}</li>`;
}

/** 순위용 거리: 출발 대열 뒷줄만큼 더해 줌 (뒷줄이 불리하지 않도록) */
const effD = (g) => (g.d || 0) + (g.go || 0);

// ───────── 결과 ─────────
function renderFinal() {
  const st = standings();
  const order = [1, 0, 2];
  $('podium').innerHTML = order.map((k) => st[k] ? `<div class="step s${k + 1}"><img src="${avatarURL(st[k].p, 200)}" alt=""><div class="name">${esc(st[k].p.name)}</div><div class="block">${k + 1}</div></div>` : '').join('');
  const nQ = quiz?.length || meta?.total || 0;
  const rec = (g) => (g.fin && meta?.raceStart ? fmtTimeD(g.fin - meta.raceStart) : `${((g.d || 0) / 1000).toFixed(2)}km`);
  $('final-table').innerHTML = st.map((x, idx) => `<tr><td>${idx + 1}</td><td><img src="${avatarURL(x.p, 56)}" alt=""> ${esc(x.p.name)}</td><td>${x.g.c || 0}/${nQ}</td><td>${x.g.b || 0}</td><td>${rec(x.g)}</td></tr>`).join('');
  $('q-acc').innerHTML = (quiz || []).map((q, i) => {
    const a = Object.values(answers?.[i] || {}); const ok = a.filter((x) => x.ok).length;
    const pct = a.length ? Math.round((ok / a.length) * 100) : 0;
    const col = pct >= 80 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#ef4444';
    return `<div style="background:${col}" title="${esc(q.q)}">Q${i + 1}<small>${a.length ? pct + '%' : '-'}</small></div>`;
  }).join('');
}

// ───────── 시작 ─────────
(async () => {
  mockBanner();
  db = await getBackend();
  renderThemes();
  $('in-choices').value = String(cfg.maxChoices || 6); $('in-shuffle').checked = !!cfg.shuffle; $('in-items').checked = cfg.items !== false;
  $('t-loop-path').setAttribute('d', SHAPE_PATH); $('t-loop-path2').setAttribute('d', SHAPE_PATH);
  const saved = localStorage.getItem('kmr-teacher-room');
  const code = saved && (await db.get(`rooms/${saved}/meta`)) ? saved : await createRoom();
  await openRoom(code);
  if (meta?.theme && meta.theme !== cfg.theme && meta.status === 'lobby') await db.update(`${base()}/meta`, { theme: cfg.theme });
  await loadSets();
  document.body.addEventListener('pointerdown', () => sound.unlock(), { once: true });
  setInterval(tick, 150);
  setInterval(renderRace, 250);
})();
