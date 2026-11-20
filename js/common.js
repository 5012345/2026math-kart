// 공용 유틸: 수식 렌더링, 효과음, 테마/캐릭터 정의, 게임 상수

export const GAME = {
  BASE_SPEED: 30,        // m/s 최고 속도 (화면 표시 108km/h) — 한 바퀴 약 55초
  GAS_UP: 0.55,          // 가속 버튼을 누르고 있을 때 스로틀이 오르는 속도 (/초) → 약 1.8초면 최고 속도
  GAS_DOWN: 0.3,         // 손을 떼면 스로틀이 내려가는 속도 (/초)
  BRAKE_DOWN: 1.6,       // 아래쪽 화살표(브레이크)
  BOOST_MULT: 1.9,       // 정답 부스트 배율
  BOOST_TIME: 3.0,       // 기본 부스트 시간(초)
  STREAK_BONUS: 0.6,     // 연속 정답마다 추가 부스트(초), 최대 4단계
  SLOW_MULT: 0.55,       // 오답 감속 배율
  SLOW_TIME: 2.0,
  COUNTDOWN: 4000,       // 3·2·1·GO (ms)
  RESULT_TIME: 3500,     // 정답 공개 시간 (ms)
  DEFAULT_Q_TIME: 12,    // 기본 문제 시간(초)
  PAD_MULT: 1.6, PAD_TIME: 1.3,      // 가속 발판
  NITRO_MULT: 1.9, NITRO_TIME: 2.2,  // 니트로 아이템
  BUMP_MULT: 0.7, BUMP_TIME: 0.7,    // 충돌 감속
  SPIN_TIME: 1.7,                    // 바나나: 3회전 후 정지
  FLY_TIME: 1.8,                     // 미사일: 공중 2바퀴
  BUBBLE_TIME: 1.5,                  // 물폭탄: 물방울에 갇힘
  FOG_TIME: 5.5,                     // 안개
  SHIELD_TIME: 6,                    // 방패
  MISSILE_DELAY: 1300,               // 미사일 경보 후 명중까지(ms)
};

export const ITEMS = {
  banana:  { emoji: '🍌', name: '바나나', desc: '뒤에 설치 · 밟으면 3바퀴 스핀' },
  missile: { emoji: '🚀', name: '미사일', desc: '바로 앞 레이서에게 투하' },
  fog:     { emoji: '🌫️', name: '안개',   desc: '뒤 레이서들 시야 가리기' },
  nitro:   { emoji: '💨', name: '니트로', desc: '잠깐 초고속 부스트' },
  shield:  { emoji: '🛡️', name: '방패',   desc: '공격·충돌을 막아요' },
  water:   { emoji: '💧', name: '물폭탄', desc: '앞쪽 레이서들을 물방울에 가둬요' },
};
/** 순위에 따라 아이템 확률이 달라짐 (앞쪽: 방어형, 뒤쪽: 공격·추격형) — rankFrac 0=1등, 1=꼴찌 */
export function rollItem(rankFrac, rnd = Math.random) {
  const lead = { banana: 34, shield: 26, fog: 24, nitro: 10, missile: 4, water: 2 };
  const back = { banana: 8, shield: 8, fog: 10, nitro: 28, missile: 28, water: 18 };
  const f = Math.max(0, Math.min(1, rankFrac));
  const w = Object.keys(lead).map((k) => [k, lead[k] * (1 - f) + back[k] * f]);
  let r = rnd() * w.reduce((a, [, v]) => a + v, 0);
  for (const [k, v] of w) { r -= v; if (r <= 0) return k; }
  return 'nitro';
}

export const THEMES = {
  snow:  { id: 'snow',  name: '설원 눈썰매',   emoji: '🛷', ride: '눈썰매',  desc: '눈 덮인 숲길을 미끄러져요' },
  falls: { id: 'falls', name: '폭포 서핑',     emoji: '🏄', ride: '서핑보드', desc: '폭포 아래 물길을 가르며 달려요' },
  road:  { id: 'road',  name: '고속도로 자전거', emoji: '🚴', ride: '자전거',  desc: '쭉 뻗은 고속도로를 질주해요' },
};

export const COLORS = ['#ff4d4f', '#ff9f1c', '#ffd60a', '#2ec4b6', '#3a86ff', '#8338ec', '#ff70a6', '#5c677d'];
export const EARS = [
  { id: 'none', label: '헬멧' }, { id: 'cat', label: '고양이' }, { id: 'bunny', label: '토끼' },
  { id: 'bear', label: '곰' }, { id: 'antenna', label: '안테나' }, { id: 'horn', label: '공룡' },
];
export const LANE_COLORS = ['#ff4d6d', '#3a86ff', '#2bb673', '#ffb703', '#9b5de5', '#00b4d8'];
export const LANE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "$...$" 구간은 KaTeX, 나머지는 일반 텍스트로 렌더링한 HTML */
export function mathHTML(text) {
  const parts = String(text ?? '').split(/(\$[^$]+\$)/g);
  return parts.map((p) => {
    if (p.length > 2 && p.startsWith('$') && p.endsWith('$')) {
      try { return window.katex.renderToString(p.slice(1, -1), { throwOnError: false, displayMode: false }); }
      catch { return esc(p); }
    }
    return esc(p).replace(/\n/g, '<br>');
  }).join('');
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

// ── 효과음 (Web Audio로 합성 — 파일 없음) ──
class Sound {
  constructor() { this.ctx = null; this.muted = localStorage.getItem('kmr-mute') === '1'; }
  unlock() { if (!this.ctx) { try { this.ctx = new AudioContext(); } catch { /* 미지원 */ } } this.ctx?.resume?.(); }
  toggle() { this.muted = !this.muted; localStorage.setItem('kmr-mute', this.muted ? '1' : '0'); return this.muted; }
  tone(freq, dur, { type = 'sine', vol = 0.18, slide = 0, delay = 0 } = {}) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.12) {
    if (this.muted || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); const g = this.ctx.createGain(); const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; g.gain.value = vol;
    s.buffer = buf; s.connect(f).connect(g).connect(this.ctx.destination); s.start();
  }
  count() { this.tone(660, 0.18, { type: 'square', vol: 0.12 }); }
  go() { this.tone(990, 0.5, { type: 'square', vol: 0.14 }); }
  move() { this.tone(520, 0.05, { type: 'triangle', vol: 0.08 }); }
  boost() { this.noise(0.7, 0.18); this.tone(300, 0.6, { type: 'sawtooth', vol: 0.1, slide: 900 }); this.tone(880, 0.15, { vol: 0.15, delay: 0.05 }); this.tone(1320, 0.25, { vol: 0.15, delay: 0.15 }); }
  wrong() { this.tone(200, 0.35, { type: 'sawtooth', vol: 0.12, slide: -120 }); }
  tick() { this.tone(1200, 0.04, { type: 'square', vol: 0.05 }); }
  bump() { this.noise(0.15, 0.25); this.tone(140, 0.18, { type: 'square', vol: 0.12, slide: -60 }); }
  boom() { this.noise(0.6, 0.3); this.tone(90, 0.5, { type: 'sawtooth', vol: 0.15, slide: -50 }); }
  jump() { this.tone(400, 0.35, { type: 'triangle', vol: 0.12, slide: 500 }); }
  land() { this.noise(0.12, 0.15); }
  pad() { this.tone(700, 0.12, { type: 'square', vol: 0.08, slide: 600 }); this.tone(1100, 0.15, { vol: 0.1, delay: 0.08 }); }
  pickup() { [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.08, { type: 'square', vol: 0.07, delay: i * 0.05 })); }
  launch() { this.noise(0.5, 0.15); this.tone(200, 0.5, { type: 'sawtooth', vol: 0.08, slide: 700 }); }
  alarm() { [0, 0.25, 0.5].forEach((d) => this.tone(1000, 0.12, { type: 'square', vol: 0.08, delay: d })); }
  splash() { this.noise(0.4, 0.2); this.tone(600, 0.3, { vol: 0.08, slide: -400 }); }
  finish() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.15, delay: i * 0.12 })); }
}
export const sound = new Sound();

// ── 캐릭터 그리기 (원작 캐릭터: 둥근 헬멧 레이서) ──
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export function drawEars(ctx, ears, r, color, back) {
  ctx.save();
  const dark = shade(color, -0.2);
  ctx.fillStyle = color; ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = r * 0.07;
  const pair = (fn) => { fn(-1); fn(1); };
  if (ears === 'cat') pair((s) => { ctx.beginPath(); ctx.moveTo(s * r * 0.85, -r * 0.35); ctx.lineTo(s * r * 0.75, -r * 1.25); ctx.lineTo(s * r * 0.25, -r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke(); });
  if (ears === 'bunny') pair((s) => { ctx.beginPath(); ctx.ellipse(s * r * 0.42, -r * 1.3, r * 0.2, r * 0.55, s * 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); if (!back) { ctx.fillStyle = '#ffc2d6'; ctx.beginPath(); ctx.ellipse(s * r * 0.42, -r * 1.3, r * 0.09, r * 0.38, s * 0.15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = color; } });
  if (ears === 'bear') pair((s) => { ctx.beginPath(); ctx.arc(s * r * 0.72, -r * 0.72, r * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  if (ears === 'antenna') pair((s) => { ctx.beginPath(); ctx.moveTo(s * r * 0.3, -r * 0.9); ctx.lineTo(s * r * 0.55, -r * 1.45); ctx.stroke(); ctx.fillStyle = '#ffd60a'; ctx.beginPath(); ctx.arc(s * r * 0.55, -r * 1.5, r * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = color; });
  if (ears === 'horn') { ctx.fillStyle = dark; [-0.5, 0, 0.5].forEach((x) => { ctx.beginPath(); ctx.moveTo(x * r - r * 0.18, -r * 0.92 + Math.abs(x) * r * 0.25); ctx.lineTo(x * r, -r * 1.35 + Math.abs(x) * r * 0.3); ctx.lineTo(x * r + r * 0.18, -r * 0.92 + Math.abs(x) * r * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke(); }); }
  ctx.restore();
}

/** 앞모습 머리+상체 (로비/순위표용) */
export function drawAvatarFront(ctx, cx, cy, r, av) {
  const color = av?.color || COLORS[4];
  ctx.save(); ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  // 몸
  ctx.fillStyle = shade(color, -0.1); ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = r * 0.07;
  ctx.beginPath(); ctx.ellipse(0, r * 1.05, r * 0.75, r * 0.5, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
  drawEars(ctx, av?.ears, r, color, false);
  // 헬멧
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.5, r * 0.25, r * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();
  // 얼굴
  ctx.fillStyle = '#ffe3c8'; ctx.beginPath(); ctx.ellipse(0, r * 0.2, r * 0.68, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1b1b2f';
  ctx.beginPath(); ctx.ellipse(-r * 0.25, r * 0.15, r * 0.09, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.15, r * 0.09, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff9eb5'; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.arc(-r * 0.45, r * 0.38, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.45, r * 0.38, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.arc(0, r * 0.35, r * 0.15, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  // 고글
  ctx.fillStyle = '#1b1b2f'; ctx.fillRect(-r * 0.9, -r * 0.42, r * 1.8, r * 0.12);
  ctx.fillStyle = '#9be7ff'; ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = r * 0.06;
  [-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(s * r * 0.32, -r * 0.37, r * 0.24, r * 0.17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  ctx.restore();
}

/** 뒷모습 (레이스 화면용) */
export function drawAvatarBack(ctx, cx, cy, r, av, lean = 0) {
  const color = av?.color || COLORS[4];
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(lean * 0.25);
  ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = r * 0.07; ctx.lineJoin = 'round';
  ctx.fillStyle = shade(color, -0.12);
  ctx.beginPath(); ctx.ellipse(0, r * 1.15, r * 0.8, r * 0.62, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  drawEars(ctx, av?.ears, r, color, true);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b1b2f'; ctx.fillRect(-r * 0.98, -r * 0.42, r * 1.96, r * 0.14);
  ctx.fillStyle = shade(color, 0.25); ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

const avatarCache = new Map();
/** 앞모습 아바타 이미지 dataURL (HTML 목록용) */
export function avatarURL(av, size = 96) {
  const key = `${av?.color}|${av?.ears}|${size}`;
  if (avatarCache.has(key)) return avatarCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  drawAvatarFront(c.getContext('2d'), size / 2, size * 0.45, size * 0.3, av);
  const url = c.toDataURL();
  avatarCache.set(key, url);
  return url;
}
