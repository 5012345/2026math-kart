// 유사 3D 레이스 화면 렌더러 — 순환 코스(커브·갈래길·점프대·가속발판·아이템 상자), 표지판은 HTML 오버레이
import { LANE_COLORS, LANE_LABELS, hashStr, mathHTML } from './common.js';
import { drawRider } from './rider.js';
import { TRACK_LEN, R, JUMPS, PADS, ITEM_ROWS, SPLITS, TUNNEL_H, TUNNEL_IN, curvatureAt, splitWidthAt, splitBoundary, spreadX, laneXAt, padLanes, rowLanes, zoneAt, overpassElev, tunnelCovered, surfaceH, hazardAt, HAZARD_S } from './track.js';

const KART_Z = 3;      // 내 캐릭터 깊이
const Z_MAX = 110;
const SEG = 4;         // 줄무늬 간격
const VIS_CURVE = 0.55; // 화면상 커브 강도
const ZN = 130;

const PALETTE = {
  snow: {
    sky: ['#7cc4ff', '#cfeeff', '#f2fbff'], fog: '#eaf6ff',
    off: ['#f8fbff', '#e6f0fa'], road: ['#d3e6f7', '#c6ddf2'], rumble: ['#ff4d6d', '#ffffff'], lane: '#6aa6dc', island: ['#eef5fc', '#dfeaf6'],
  },
  falls: {
    sky: ['#38b6ff', '#9be3ff', '#dff7ff'], fog: '#c9f0ff',
    off: ['#4cbb63', '#40a957'], road: ['#29a7ea', '#1f98dc'], rumble: ['#f5d9a3', '#e8c47f'], lane: '#ff8c42', island: ['#8d99ae', '#7d8799'],
  },
  road: {
    sky: ['#4aa8ff', '#a9dcff', '#e9f7ff'], fog: '#dff1ff',
    off: ['#7ccb69', '#6dba5c'], road: ['#5b6273', '#535a6a'], rumble: ['#ff4d4f', '#ffffff'], lane: '#ffffff', island: ['#8bd17a', '#7cc46b'],
  },
};

export class RaceScene {
  constructor(canvas, overlay) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.overlay = overlay;
    this.theme = 'snow'; this.lanes = 4;
    this.bgShift = 0; this.time = 0;
    this.particles = [];
    this.effects = [];
    this.signs = [];
    this.off = new Float32Array(ZN + 2);
    this.dist = 0;
    this.meScreen = { x: 0, y: 0 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTheme(t) { if (PALETTE[t] && t !== this.theme) { this.theme = t; this.bg = null; } }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.dpr = dpr;
    const w = this.c.clientWidth, h = this.c.clientHeight;
    this.c.width = Math.max(1, Math.round(w * dpr)); this.c.height = Math.max(1, Math.round(h * dpr));
    this.W = this.c.width; this.H = this.c.height;
    this.cssScale = 1 / dpr;
    this.h0 = this.H * 0.4;
    this.yk = this.H * 0.86;
    const delta = this.yk - this.h0;
    const halfAtKart = Math.min(this.W * 0.47, this.H * 0.95);
    this.camH = (R * delta) / halfAtKart;
    this.s = (KART_Z * delta) / this.camH;
    this.bg = null;
  }

  /** 트랙 위치 s(누적거리)에서의 코스 i 중심 x */
  laneX(i, n = this.lanes, s = this.dist) { return laneXAt(i, n, splitWidthAt(s)); }

  /** 화면 x(css px) → 가장 가까운 코스 번호 */
  laneAtScreenX(cssX) {
    const x = cssX / this.cssScale;
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.lanes; i++) {
      const p = this.project(this.laneX(i), 0, KART_Z);
      const d = Math.abs(p.x - x);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  sAt(z) { return this.dist + z - KART_Z; }
  buildCurve(dist) {
    let heading = 0, x = 0;
    for (let i = 0; i <= ZN + 1; i++) {
      heading += curvatureAt(dist + i - KART_Z) * VIS_CURVE;
      x += heading;
      this.off[i] = x;
    }
  }
  curveAt(z) {
    if (z <= 0) return 0;
    const i = Math.floor(z);
    if (i >= ZN) return this.off[ZN] + (z - ZN) * (this.off[ZN] - this.off[ZN - 1]);
    return this.off[i] + (this.off[i + 1] - this.off[i]) * (z - i);
  }
  project(xw, hgt, z) {
    const k = this.s / z;
    return { x: this.W / 2 + (xw + this.curveAt(z) - this.curveAt(KART_Z) - this.camX) * k, y: this.h0 + ((this.camY ?? this.camH) - hgt) * k, k };
  }

  /** 이펙트 추가: { type, x?, z?, t0 } */
  addEffect(type, opt = {}) { this.effects.push({ type, t0: this.time, ...opt }); }

  buildBackground() {
    const W = this.W, h = Math.ceil(this.h0) + 2;
    const tw = Math.ceil(W * 1.5);
    const cv = document.createElement('canvas'); cv.width = tw; cv.height = h;
    const g = cv.getContext('2d'); const P = PALETTE[this.theme];
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, P.sky[0]); sky.addColorStop(0.6, P.sky[1]); sky.addColorStop(1, P.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, tw, h);
    const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    // 구름
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 7; i++) {
      const cx = rnd() * tw, cy = h * (0.1 + rnd() * 0.35), r = h * (0.04 + rnd() * 0.05);
      for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(cx + (j - 1.5) * r * 1.1, cy + (j % 2) * r * 0.3, r * (1 - Math.abs(j - 1.5) * 0.2), 0, Math.PI * 2); g.fill(); }
    }
    if (this.theme === 'snow') {
      g.fillStyle = 'rgba(255,240,180,0.9)'; g.beginPath(); g.arc(tw * 0.7, h * 0.28, h * 0.08, 0, Math.PI * 2); g.fill();
      const layer = (base, amp, col, cap) => {
        const pts = []; for (let x = 0; x <= tw; x += tw / 14) pts.push([x, h - base - rnd() * amp]);
        pts[pts.length - 1][1] = pts[0][1];
        g.fillStyle = col; g.beginPath(); g.moveTo(0, h); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(tw, h); g.fill();
        if (cap) { g.fillStyle = '#ffffff'; pts.forEach(([x, y], i) => { if (i && y < h - base - amp * 0.4) { g.beginPath(); g.moveTo(x - tw / 40, y + h * 0.06); g.lineTo(x, y); g.lineTo(x + tw / 40, y + h * 0.06); g.fill(); } }); }
      };
      layer(h * 0.12, h * 0.45, '#8fb4d9', true);
      layer(h * 0.04, h * 0.22, '#b9d3ec', true);
    } else if (this.theme === 'falls') {
      // 절벽 + 폭포
      for (let rep = 0; rep < 2; rep++) {
        const cx = tw * (0.25 + rep * 0.5);
        g.fillStyle = '#3d7a4a';
        g.beginPath(); g.moveTo(cx - tw * 0.22, h); g.lineTo(cx - tw * 0.2, h * 0.3); g.lineTo(cx - tw * 0.06, h * 0.22); g.lineTo(cx - tw * 0.05, h); g.fill();
        g.beginPath(); g.moveTo(cx + tw * 0.05, h); g.lineTo(cx + tw * 0.06, h * 0.2); g.lineTo(cx + tw * 0.2, h * 0.32); g.lineTo(cx + tw * 0.22, h); g.fill();
        g.fillStyle = '#2f6a3c';
        g.fillRect(cx - tw * 0.2, h * 0.3, tw * 0.15, h * 0.08); g.fillRect(cx + tw * 0.06, h * 0.25, tw * 0.15, h * 0.08);
        const wf = g.createLinearGradient(0, h * 0.2, 0, h);
        wf.addColorStop(0, '#e9fbff'); wf.addColorStop(1, '#8fdcff');
        g.fillStyle = wf; g.fillRect(cx - tw * 0.055, h * 0.22, tw * 0.11, h * 0.78);
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
        for (let i = 0; i < 12; i++) { const x = cx - tw * 0.05 + rnd() * tw * 0.1; g.beginPath(); g.moveTo(x, h * 0.25); g.lineTo(x, h); g.stroke(); }
        g.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(cx + (rnd() - 0.5) * tw * 0.16, h * 0.95, h * 0.05 * (0.6 + rnd()), 0, Math.PI * 2); g.fill(); }
      }
      // 무지개
      g.globalAlpha = 0.35; ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = h * 0.015; g.beginPath(); g.arc(tw * 0.25, h * 1.05, h * (0.55 - i * 0.017), Math.PI * 1.1, Math.PI * 1.6); g.stroke(); });
      g.globalAlpha = 1;
    } else {
      g.fillStyle = 'rgba(255,230,140,0.95)'; g.beginPath(); g.arc(tw * 0.15, h * 0.3, h * 0.07, 0, Math.PI * 2); g.fill();
      // 도시 스카이라인
      [[0.55, '#8fa9c7'], [0.35, '#6c86a8']].forEach(([maxH, col], layerI) => {
        for (let x = 0; x < tw;) {
          const bw = tw * (0.02 + rnd() * 0.035), bh = h * (0.12 + rnd() * maxH);
          g.fillStyle = col; g.fillRect(x, h - bh, bw, bh);
          if (layerI === 1) { g.fillStyle = 'rgba(255,240,170,0.7)'; for (let wy = h - bh + 6; wy < h - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 5; wx += 8) if (rnd() > 0.45) g.fillRect(wx, wy, 3, 4); }
          x += bw + tw * 0.004;
        }
      });
      g.fillStyle = '#5e8f52'; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= tw; x += tw / 30) g.lineTo(x, h - h * 0.04 - Math.sin(x / tw * Math.PI * 6) * h * 0.02);
      g.lineTo(tw, h); g.fill();
    }
    this.bg = cv; this.bgW = tw;
  }

  drawBackground() {
    if (!this.bg) this.buildBackground();
    const off = ((this.bgShift % this.bgW) + this.bgW) % this.bgW;
    this.ctx.drawImage(this.bg, -off, 0);
    this.ctx.drawImage(this.bg, this.bgW - off, 0);
  }

  // ── 노면 ──
  drawProp(xw, z, h, side, scale = 1) {
    const { ctx } = this; const p = this.project(xw, 0, z); const k = p.k * scale;
    if (p.y < this.h0) return;
    const variant = h % 7;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.lineWidth = Math.max(1, 0.05 * k); ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    if (this.theme === 'snow') {
      if (variant === 0) { // 눈사람
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, -0.45 * k, 0.45 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -1.1 * k, 0.32 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff7b00'; ctx.beginPath(); ctx.moveTo(0, -1.1 * k); ctx.lineTo(side * -0.35 * k, -1.05 * k); ctx.lineTo(0, -1.0 * k); ctx.fill();
        ctx.fillStyle = '#e63946'; ctx.fillRect(-0.3 * k, -0.85 * k, 0.6 * k, 0.1 * k);
      } else { // 눈 덮인 전나무
        const t = 1 + (h % 3) * 0.25;
        ctx.fillStyle = '#6b4226'; ctx.fillRect(-0.12 * k, -0.5 * k, 0.24 * k, 0.5 * k);
        for (let j = 0; j < 3; j++) {
          const yb = -(0.4 + j * 0.7) * k * t, w = (1.0 - j * 0.25) * k * t;
          ctx.fillStyle = '#1f6f50'; ctx.beginPath(); ctx.moveTo(-w, yb); ctx.lineTo(0, yb - 1.0 * k * t); ctx.lineTo(w, yb); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-w * 0.45, yb - 0.55 * k * t); ctx.lineTo(0, yb - 1.0 * k * t); ctx.lineTo(w * 0.45, yb - 0.55 * k * t); ctx.fill();
        }
      }
    } else if (this.theme === 'falls') {
      if (variant < 2) { // 바위
        ctx.fillStyle = '#8d99ae'; ctx.beginPath(); ctx.ellipse(0, -0.3 * k, 0.8 * k, 0.45 * k, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(0, 0, 1.0 * k, 0.12 * k, 0, 0, Math.PI * 2); ctx.fill();
      } else { // 야자수
        const t = 1 + (h % 3) * 0.2;
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 0.22 * k; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * -0.4 * k, -1.4 * k * t, side * -0.2 * k, -2.6 * k * t); ctx.stroke();
        ctx.fillStyle = '#2d9c4a';
        const tx = side * -0.2 * k, ty = -2.6 * k * t;
        for (let a = 0; a < 6; a++) { const ang = (a / 6) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(tx + Math.cos(ang) * 0.55 * k, ty + Math.sin(ang) * 0.25 * k + 0.1 * k, 0.7 * k, 0.16 * k, ang, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#7a4e1d'; ctx.beginPath(); ctx.arc(tx, ty + 0.15 * k, 0.14 * k, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      if (variant < 3) { // 가로등
        ctx.fillStyle = '#9aa5b1'; ctx.fillRect(-0.06 * k, -3.2 * k, 0.12 * k, 3.2 * k);
        ctx.fillRect(side > 0 ? -1.0 * k : 0, -3.2 * k, 1.0 * k, 0.1 * k);
        ctx.fillStyle = '#fff3b0'; ctx.fillRect(side > 0 ? -1.05 * k : 0.75 * k, -3.15 * k, 0.3 * k, 0.12 * k);
      } else if (variant === 3) { // 표지판
        ctx.fillStyle = '#9aa5b1'; ctx.fillRect(-0.05 * k, -1.8 * k, 0.1 * k, 1.8 * k);
        ctx.fillStyle = '#1d6fd1'; ctx.fillRect(-0.9 * k, -2.6 * k, 1.8 * k, 0.9 * k);
        ctx.fillStyle = '#fff'; ctx.font = `800 ${0.32 * k}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('수학 IC', 0, -2.15 * k);
      } else { // 가로수
        ctx.fillStyle = '#7a4e1d'; ctx.fillRect(-0.1 * k, -1 * k, 0.2 * k, 1 * k);
        ctx.fillStyle = '#3e9e4f'; ctx.beginPath(); ctx.arc(0, -1.5 * k, 0.75 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#56b762'; ctx.beginPath(); ctx.arc(-0.2 * k, -1.7 * k, 0.4 * k, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ── 노면 ──
  drawGround(st) {
    const { ctx, W, H, h0 } = this; const P = PALETTE[this.theme];
    const step = Math.max(2, Math.round(2 * this.dpr));
    const gate = st.gate;
    const n = this.lanes;
    const b = splitBoundary(n);
    const c0 = this.curveAt(KART_Z);
    for (let y = Math.floor(h0) + 1; y < H; y += step) {
      const z = (this.camY * this.s) / (y - h0);
      if (z > Z_MAX * 1.6) continue;
      const k = this.s / z;
      const s = this.sAt(z);
      const sm = ((s % TRACK_LEN) + TRACK_LEN) % TRACK_LEN;
      const stripe = Math.floor((s + 1000) / SEG) & 1;
      const w = splitWidthAt(s);
      const cx = W / 2 + (this.curveAt(z) - c0 - this.camX) * k;
      const X = (wx) => cx + wx * k;
      const left = -R - w / 2, right = R + w / 2;
      ctx.fillStyle = P.off[stripe]; ctx.fillRect(0, y, W, step);
      ctx.fillStyle = P.road[stripe]; ctx.fillRect(X(left), y, (right - left) * k, step);
      // 테마 질감
      if (this.theme === 'falls') {
        const hsh = hashStr(Math.floor((s + 1000) / 1.3)) % 1000;
        if (hsh < 260) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(X(left) + ((hsh * 7) % 100) / 100 * (right - left) * k, y, R * 0.25 * k, step); }
      } else if (this.theme === 'snow') {
        const hsh = hashStr(Math.floor((s + 1000) / 0.9)) % 1000;
        if (hsh < 180) { ctx.fillStyle = 'rgba(150,190,230,0.35)'; ctx.fillRect(X(left) + ((hsh * 13) % 100) / 100 * (right - left) * k, y, R * 0.08 * k, step); }
      }
      const rw = 0.28 * k;
      ctx.fillStyle = P.rumble[stripe];
      ctx.fillRect(X(left) - rw, y, rw, step); ctx.fillRect(X(right), y, rw, step);
      // 갈래길 가운데 섬
      if (w > 0.03) {
        ctx.fillStyle = P.island[stripe]; ctx.fillRect(X(b - w / 2), y, w * k, step);
        ctx.fillStyle = P.rumble[stripe];
        const ir = Math.min(w / 2, 0.22) * k;
        ctx.fillRect(X(b - w / 2), y, ir, step); ctx.fillRect(X(b + w / 2) - ir, y, ir, step);
      }
      // 출발·결승선 (매 바퀴)
      if (sm < 1.6 || st.startLine && z > 4.2 && z < 5.4) {
        const cells = 14; const cw = ((right - left) * k) / cells;
        for (let i = 0; i < cells; i++) { ctx.fillStyle = (i + Math.floor(z * 3)) % 2 ? '#111' : '#fff'; ctx.fillRect(X(left) + i * cw, y, cw, step); }
      }
      // 가속 발판 (한 코스 안에만, 화살표는 앞쪽을 가리킴)
      for (const pad of PADS) {
        if (sm >= pad.s && sm < pad.s + 6) for (const pl of padLanes(pad, n, Math.floor(s / TRACK_LEN))) {
          const px = laneXAt(pl, n, w);
          const hw = (R / n) * 0.78;
          ctx.fillStyle = '#00b4d8'; ctx.fillRect(X(px - hw), y, 2 * hw * k, step);
          const f = 1 - ((sm - pad.s) % 1.5) / 1.5;
          ctx.fillStyle = '#ffffff';
          const ax = hw * 0.75 * f;
          ctx.fillRect(X(px - 0.07 - ax), y, 0.14 * k, step); ctx.fillRect(X(px - 0.07 + ax), y, 0.14 * k, step);
          ctx.fillStyle = '#ffe14d'; ctx.fillRect(X(px - hw), y, 0.08 * k, step); ctx.fillRect(X(px + hw - 0.08), y, 0.08 * k, step);
        }
      }
      // 맵별 장애물 바닥 (눈더미 / 돌부리 자리 / 흙탕물 웅덩이)
      if (this.hazardSeed != null) {
        const hz = hazardAt(Math.floor(s / TRACK_LEN), n, this.hazardSeed, this.theme);
        const rel = hz ? sm - hz.s : -1;
        if (hz && rel >= 0 && rel < hz.len) for (const hl of hz.lanes) {
          const px = laneXAt(hl, n, w), full = (R / n) * 0.92;
          const edge = Math.min(1, rel / 1.6, (hz.len - rel) / 1.6);
          if (hz.kind === 'snowdrift') {
            const hw = full * (0.55 + 0.45 * edge) + Math.sin(rel * 2.3 + hl) * 0.06;
            ctx.fillStyle = '#7fa3cf'; ctx.fillRect(X(px - hw - 0.14), y, (2 * hw + 0.28) * k, step);
            ctx.fillStyle = stripe ? '#ffffff' : '#f1f7ff'; ctx.fillRect(X(px - hw), y, 2 * hw * k, step);
            if ((Math.floor(rel * 2.5) + hl) % 3 === 0) { ctx.fillStyle = '#b9d0ec'; ctx.fillRect(X(px - hw * (0.5 + 0.3 * Math.sin(rel * 1.3))), y, hw * 0.45 * k, step); ctx.fillRect(X(px + hw * 0.2), y, hw * 0.3 * k, step); }
          } else if (hz.kind === 'mud') {
            const u = Math.min(1, rel / hz.len) * 2 - 1;            // -1 ~ 1 (타원 모양)
            const hw = full * Math.sqrt(Math.max(0, 1 - u * u)) * 0.95 + 0.05;
            ctx.fillStyle = '#4a3220'; ctx.fillRect(X(px - hw - 0.07), y, (2 * hw + 0.14) * k, step);
            ctx.fillStyle = '#6b4a2b'; ctx.fillRect(X(px - hw), y, 2 * hw * k, step);
            if (u > -0.55 && u < 0.1) { // 하늘이 비친 물빛
              const hv = hw * 0.45 * Math.sqrt(Math.max(0, 1 - ((u + 0.22) / 0.33) ** 2));
              ctx.fillStyle = 'rgba(190,210,225,0.55)'; ctx.fillRect(X(px - hw * 0.25 - hv), y, 2 * hv * k, step);
            }
          } else {
            const hw = full * 0.7 * (0.5 + 0.5 * edge);
            ctx.fillStyle = 'rgba(40,60,70,0.45)'; ctx.fillRect(X(px - hw), y, 2 * hw * k, step);
          }
        }
      }
      // 정답 코스 구역(게이트 앞) 색칠
      const inGate = gate && z < gate.z + 0.3 && z > gate.z - 22;
      if (inGate) {
        const a = 0.25 + 0.25 * Math.min(1, (z - (gate.z - 22)) / 6);
        const half = R / n;
        for (let i = 0; i < n; i++) {
          const lx = laneXAt(i, n, w);
          ctx.globalAlpha = a; ctx.fillStyle = LANE_COLORS[i];
          ctx.fillRect(X(lx - half + 0.06), y, (2 * half - 0.12) * k, step);
        }
        ctx.globalAlpha = 1;
      }
      // 차선
      if (inGate || stripe === 0) {
        ctx.fillStyle = inGate ? '#ffffff' : P.lane;
        const lw = inGate ? 0.14 : 0.1;
        for (let i = 1; i < n; i++) {
          const base = -R + (i * 2 * R) / n;
          if (w > 0.03 && Math.abs(base - b) < 1e-6) continue;
          ctx.fillRect(X(spreadX(base, w, n)) - (lw / 2) * k, y, lw * k, step);
        }
      }
      // 고가도로 아래: 그쪽 갈래는 위에 따로 그리므로 바닥은 그늘진 땅으로
      const zone = w > 0.03 ? zoneAt(s) : null;
      if (zone && zone.kind === 'overpass' && overpassElev(s) > 0.02) {
        const x1 = zone.side > 0 ? b + w / 2 : left - 0.3, x2 = zone.side > 0 ? right + 0.3 : b - w / 2;
        ctx.fillStyle = P.off[stripe]; ctx.fillRect(X(x1), y, (x2 - x1) * k, step);
        ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(X(x1), y, (x2 - x1) * k, step);
      }
    }
    // 원경 안개
    const fog = ctx.createLinearGradient(0, h0, 0, h0 + (H - h0) * 0.22);
    fog.addColorStop(0, P.fog); fog.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fog; ctx.fillRect(0, h0, W, (H - h0) * 0.22);
  }


  // ── 고가도로·지하터널 구조물 ──
  quad(pts, fill) {
    const { ctx } = this;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  structures(st, objs) {
    const n = this.lanes, b = splitBoundary(n);
    let z = 0.3;
    while (z < Z_MAX) {
      const dz = z < 3 ? 0.9 : z < 20 ? 1.5 : z < 50 ? 3 : 5;
      const z1 = z, z2 = z + dz; z = z2;
      const s1 = this.sAt(z1), s2 = this.sAt(z2);
      const zone = zoneAt(s1) || zoneAt(s2);
      if (!zone) continue;
      const w1 = splitWidthAt(s1), w2 = splitWidthAt(s2);
      const side = zone.side;
      const seg = { z1, z2, s1, s2, side, b, n,
        in1: b + (side * w1) / 2, in2: b + (side * w2) / 2, out1: side * (R + w1 / 2), out2: side * (R + w2 / 2) };
      if (zone.kind === 'overpass') {
        seg.e1 = overpassElev(s1); seg.e2 = overpassElev(s2);
        if (seg.e1 < 0.02 && seg.e2 < 0.02) continue;
        seg.w1 = w1;
        objs.push({ z: z2, draw: () => this.drawDeck(seg, st.gate) });
      } else if (tunnelCovered(s1) && tunnelCovered(s2)) {
        objs.push({ z: z1 - 0.01, draw: () => this.drawTunnelSeg(seg) });
      }
    }
    SPLITS.filter((zn) => zn.kind === 'tunnel').forEach((zn) => {
      this.forEachAhead(zn.a + TUNNEL_IN, (pz) => objs.push({ z: pz - 0.02, draw: () => this.drawPortal(pz, zn.side, true) }));
      this.forEachAhead(zn.b - TUNNEL_IN, (pz) => objs.push({ z: pz - 0.02, draw: () => this.drawPortal(pz, zn.side, false) }));
    });
  }
  drawDeck(g, gate) {
    const P = PALETTE[this.theme]; const { ctx } = this;
    const pr = (x, e, z) => this.project(x, e, z);
    const { z1, z2, e1, e2, in1, in2, out1, out2, side, n, b } = g;
    const stripe = Math.floor((g.s1 + 1000) / SEG) & 1;
    // 기둥
    if (Math.floor(g.s1 / 12) !== Math.floor(g.s2 / 12) && e1 > 0.3) {
      [in1 + side * 0.45, out1 - side * 0.45].forEach((x) => {
        const top = pr(x, e1 - 0.3, z1), bot = pr(x, 0, z1);
        ctx.fillStyle = '#8d99ae'; ctx.fillRect(top.x - 0.17 * top.k, top.y, 0.34 * top.k, bot.y - top.y);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(top.x, top.y, 0.17 * top.k, bot.y - top.y);
      });
    }
    // 옆면
    this.quad([pr(in1, e1 - 0.4, z1), pr(in1, e1, z1), pr(in2, e2, z2), pr(in2, e2 - 0.4, z2)], '#9aa5b1');
    this.quad([pr(out1, e1 - 0.4, z1), pr(out1, e1, z1), pr(out2, e2, z2), pr(out2, e2 - 0.4, z2)], '#9aa5b1');
    // 노면
    this.quad([pr(in1, e1, z1), pr(out1, e1, z1), pr(out2, e2, z2), pr(in2, e2, z2)], P.road[stripe]);
    // 정답 코스 색칠 + 차선
    const inGate = gate && z1 < gate.z + 0.3 && z1 > gate.z - 22;
    const half = R / n;
    for (let i = 0; i < n; i++) {
      const lx1 = laneXAt(i, n, g.w1);
      if ((lx1 >= b ? 1 : -1) !== side) continue;
      const lx2 = laneXAt(i, n, splitWidthAt(g.s2));
      if (inGate) { ctx.globalAlpha = 0.45; this.quad([pr(lx1 - half + 0.06, e1, z1), pr(lx1 + half - 0.06, e1, z1), pr(lx2 + half - 0.06, e2, z2), pr(lx2 - half + 0.06, e2, z2)], LANE_COLORS[i]); ctx.globalAlpha = 1; }
    }
    if (inGate || stripe === 0) {
      for (let i = 1; i < n; i++) {
        const base = -R + (i * 2 * R) / n;
        if (Math.abs(base - b) < 1e-6 || (base > b ? 1 : -1) !== side) continue;
        const x1 = spreadX(base, g.w1, n), x2 = spreadX(base, splitWidthAt(g.s2), n), lw = inGate ? 0.07 : 0.05;
        this.quad([pr(x1 - lw, e1, z1), pr(x1 + lw, e1, z1), pr(x2 + lw, e2, z2), pr(x2 - lw, e2, z2)], inGate ? '#ffffff' : P.lane);
      }
    }
    // 방호벽
    [[in1, in2], [out1, out2]].forEach(([a1, a2]) => {
      this.quad([pr(a1, e1, z1), pr(a1, e1 + 0.38, z1), pr(a2, e2 + 0.38, z2), pr(a2, e2, z2)], stripe ? '#f1f3f5' : '#dee2e6');
      this.quad([pr(a1, e1 + 0.3, z1), pr(a1, e1 + 0.38, z1), pr(a2, e2 + 0.38, z2), pr(a2, e2 + 0.3, z2)], stripe ? '#e63946' : '#ffffff');
    });
  }
  drawTunnelSeg(g) {
    const P = PALETTE[this.theme];
    const pr = (x, e, z) => this.project(x, e, z);
    const { z1, z2, in1, in2, out1, out2, side } = g;
    const H = TUNNEL_H;
    const stripe = Math.floor((g.s1 + 1000) / SEG) & 1;
    const o1 = out1 + side * 0.25, o2 = out2 + side * 0.25;
    this.quad([pr(in1, H, z1), pr(o1, H, z1), pr(o2, H, z2), pr(in2, H, z2)], stripe ? '#3d4249' : '#454b53');
    if (Math.floor(g.s1 / 6) !== Math.floor(g.s2 / 6)) {
      const cx = (in1 + o1) / 2;
      this.quad([pr(cx - 0.35, H - 0.02, z1), pr(cx + 0.35, H - 0.02, z1), pr(cx + 0.35, H - 0.02, z1 + 0.5), pr(cx - 0.35, H - 0.02, z1 + 0.5)], '#fff3b0');
    }
    this.quad([pr(in1, 0, z1), pr(in1, H, z1), pr(in2, H, z2), pr(in2, 0, z2)], stripe ? '#adb5bd' : '#b8c0c8');
    this.quad([pr(o1, 0, z1), pr(o1, H, z1), pr(o2, H, z2), pr(o2, 0, z2)], stripe ? '#adb5bd' : '#b8c0c8');
    this.quad([pr(in1, 0.55, z1), pr(in1, 0.75, z1), pr(in2, 0.75, z2), pr(in2, 0.55, z2)], '#ffd60a');
    this.quad([pr(o1, 0.55, z1), pr(o1, 0.75, z1), pr(o2, 0.75, z2), pr(o2, 0.55, z2)], '#ffd60a');
    // 바깥에서 보이는 지붕 위 (풀·눈)
    this.quad([pr(in1, H, z1), pr(in1, H + 0.35, z1), pr(in2, H + 0.35, z2), pr(in2, H, z2)], P.island[0]);
  }
  drawPortal(z, side, entry) {
    const { ctx } = this;
    const s = this.sAt(z), w = splitWidthAt(s), b = splitBoundary(this.lanes);
    const xa = b + (side * w) / 2, xb = side * (R + w / 2 + 0.25);
    const L = Math.min(xa, xb) - 0.3, Rr = Math.max(xa, xb) + 0.3, H = TUNNEL_H;
    const p = (x, e) => this.project(x, e, z);
    const tl = p(L, H + 0.7), br = p(Rr, 0);
    const oL = p(L + 0.45, 0), oR = p(Rr - 0.45, 0), oT = p((L + Rr) / 2, H - 0.1), oS = p(L + 0.45, H * 0.62);
    ctx.save();
    ctx.beginPath();
    ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.moveTo(oL.x, oL.y); ctx.lineTo(oS.x, oS.y);
    ctx.quadraticCurveTo(oL.x, oT.y, oT.x, oT.y); ctx.quadraticCurveTo(oR.x, oT.y, oR.x, oS.y);
    ctx.lineTo(oR.x, oR.y); ctx.closePath();
    ctx.fillStyle = '#868e96'; ctx.fill('evenodd');
    ctx.strokeStyle = '#495057'; ctx.lineWidth = Math.max(1, 0.05 * tl.k ?? 1); ctx.stroke();
    if (entry) {
      ctx.beginPath(); ctx.moveTo(oL.x, oL.y); ctx.lineTo(oS.x, oS.y);
      ctx.quadraticCurveTo(oL.x, oT.y, oT.x, oT.y); ctx.quadraticCurveTo(oR.x, oT.y, oR.x, oS.y); ctx.lineTo(oR.x, oR.y); ctx.closePath();
      const g = ctx.createLinearGradient(0, oT.y, 0, oL.y); g.addColorStop(0, '#05050a'); g.addColorStop(1, '#2b2d42');
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = '#ffd60a';
      for (let i = 0; i < 3; i++) { const lp = p(L + 0.9 + i * ((Rr - L - 1.8) / 2), H * 0.85); ctx.beginPath(); ctx.arc(lp.x, lp.y, Math.max(1.5, 0.06 * lp.k), 0, Math.PI * 2); ctx.fill(); }
    }
    const top = p((L + Rr) / 2, H + 0.35);
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.max(8, 0.32 * top.k)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(entry ? '수학 터널' : 'EXIT', top.x, top.y);
    ctx.restore();
  }

  // ── 길가 오브젝트 ──
  roadsideObjects(st, list) {
    const sp = 9;
    const base = Math.floor(st.dist / sp);
    const b = splitBoundary(this.lanes);
    for (let i = 1; i < Z_MAX / sp; i++) {
      const idx = base + i;
      const z = idx * sp - st.dist + KART_Z * 0.2;
      if (z < 1.2) continue;
      const w = splitWidthAt(this.sAt(z));
      const h = hashStr('o' + idx);
      const side = idx % 2 ? 1 : -1;
      const x = side * (R + w / 2 + 1.2 + (h % 100) / 40);
      list.push({ z, draw: () => this.drawProp(x, z, h, side) });
      if (h % 5 === 0) list.push({ z: z + 0.5, draw: () => this.drawProp(-x - side * 0.8, z + 0.5, h >> 3, -side) });
      if (w > 1.7 && idx % 2 === 0) list.push({ z: z + 0.2, draw: () => this.drawProp(b, z + 0.2, (h >> 5) | 1, side, 0.55) });
    }
  }

  /** 트랙 위 고정 지점(바퀴마다 반복)이 지금 화면 깊이 z 어디에 있는지 */
  forEachAhead(trackS, fn) {
    const lapBase = Math.floor(this.dist / TRACK_LEN) * TRACK_LEN;
    for (const off of [-TRACK_LEN, 0, TRACK_LEN]) {
      const abs = lapBase + off + trackS;
      const z = abs - this.dist + KART_Z;
      if (z > 1.0 && z < Z_MAX) fn(z, abs);
    }
  }

  drawRamp(z) {
    const { ctx } = this; const w = splitWidthAt(this.sAt(z));
    const L = -R - w / 2, Rt = R + w / 2, z2 = z + 4, hh = 0.55;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const xa = L + ((Rt - L) * i) / n, xb = L + ((Rt - L) * (i + 1)) / n;
      const a = this.project(xa, 0, z), bq = this.project(xb, 0, z), c = this.project(xb, hh, z2), d = this.project(xa, hh, z2);
      ctx.fillStyle = i % 2 ? '#ffd60a' : '#1b1b2f';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bq.x, bq.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
    }
    const a = this.project(L, hh, z2), bq = this.project(Rt, hh, z2);
    ctx.strokeStyle = '#ff6b00'; ctx.lineWidth = Math.max(2, 0.08 * a.k); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bq.x, bq.y); ctx.stroke();
    // 받침대
    ctx.fillStyle = '#6c757d';
    [L, Rt].forEach((x) => { const top = this.project(x, hh, z2), bot = this.project(x, 0, z2); ctx.fillRect(top.x - 0.06 * top.k, top.y, 0.12 * top.k, bot.y - top.y); });
  }

  /** 폭포 코스의 돌부리: 물살 위로 튀어나온 바위 3개 + 물보라 */
  drawRocks(x, z, seed) {
    const { ctx } = this; const half = (R / this.lanes) * 0.8;
    const rocks = [[-0.45, 0.55, 0.5], [0.05, 0.75, 0.62], [0.5, 0.5, 0.45]];
    rocks.forEach(([ox, hgt, wid], i) => {
      const bx = x + ox * half;
      const p0 = this.project(bx, 0, z), p1 = this.project(bx, hgt, z);
      const k = p0.k, wpx = wid * half * k, top = p1.y;
      // 물보라
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.ellipse(p0.x, p0.y, wpx * 1.15, Math.max(2, wpx * 0.22), 0, 0, Math.PI * 2); ctx.fill();
      // 바위 (울퉁불퉁한 다각형)
      const j = (a) => Math.sin(seed * 3.1 + i * 2.7 + a) * 0.12;
      ctx.fillStyle = ['#6c757d', '#7b828a', '#5f666d'][i];
      ctx.beginPath();
      ctx.moveTo(p0.x - wpx, p0.y);
      ctx.lineTo(p0.x - wpx * (0.85 + j(1)), p0.y - (p0.y - top) * 0.55);
      ctx.lineTo(p0.x - wpx * (0.35 + j(2)), top + (p0.y - top) * j(3));
      ctx.lineTo(p0.x + wpx * (0.2 + j(4)), top);
      ctx.lineTo(p0.x + wpx * (0.8 + j(5)), p0.y - (p0.y - top) * 0.5);
      ctx.lineTo(p0.x + wpx, p0.y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.moveTo(p0.x - wpx * 0.35, top + 2); ctx.lineTo(p0.x + wpx * 0.2, top); ctx.lineTo(p0.x, p0.y - (p0.y - top) * 0.45); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(30,35,40,0.5)'; ctx.lineWidth = Math.max(1, k * 0.03); ctx.stroke();
    });
  }
  /** 설원 코스의 눈더미 앞쪽 둔덕 */
  drawSnowMound(x, z, seed) {
    const { ctx } = this; const half = (R / this.lanes) * 0.9;
    for (let i = 0; i < 4; i++) {
      const ox = (i / 3 - 0.5) * 1.5 * half, hgt = 0.42 + 0.14 * Math.sin(seed + i * 1.9);
      const p0 = this.project(x + ox, 0, z), p1 = this.project(x + ox, hgt, z);
      const rw = half * 0.42 * p0.k;
      ctx.fillStyle = '#7fa3cf'; ctx.beginPath(); ctx.ellipse(p0.x, p0.y, rw * 1.08, Math.max(2, p0.y - p1.y + 2), 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(p0.x, p0.y - 1, rw, Math.max(2, p0.y - p1.y), 0, Math.PI, 0); ctx.fill();
    }
  }
  drawItemBox(x, z, seed, base = 0) {
    const { ctx } = this; const t = this.time;
    const bob = Math.sin(t * 3 + seed) * 0.08;
    const p = this.project(x, base + 0.95 + bob, z); const k = p.k;
    const sz = 0.62 * k;
    ctx.save(); ctx.translate(p.x, p.y);
    // 바닥 그림자
    const g0 = this.project(x, base, z);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, g0.y - p.y, sz * 0.5, sz * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    const ang = t * 1.6 + seed;
    const sx = 0.55 + 0.45 * Math.abs(Math.cos(ang));
    ctx.scale(sx, 1); ctx.rotate(Math.sin(ang) * 0.15);
    const gr = ctx.createLinearGradient(-sz / 2, -sz / 2, sz / 2, sz / 2);
    gr.addColorStop(0, '#ff5ec4'); gr.addColorStop(0.5, '#8f5bff'); gr.addColorStop(1, '#2ec5ff');
    ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 0.25 * k;
    ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-sz / 2, -sz / 2, sz, sz, sz * 0.18) : ctx.rect(-sz / 2, -sz / 2, sz, sz); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, sz * 0.07); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-sz * 0.4, -sz * 0.42, sz * 0.8, sz * 0.18);
    ctx.fillStyle = '#ffffff'; ctx.font = `900 ${sz * 0.72}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#4a1d96'; ctx.lineWidth = Math.max(1, sz * 0.06); ctx.strokeText('?', 0, sz * 0.04); ctx.fillText('?', 0, sz * 0.04);
    ctx.restore();
  }

  drawBanana(x, z, base = 0) {
    const { ctx } = this; const p = this.project(x, base + 0.12, z); const k = p.k;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0.12 * k, 0.35 * k, 0.06 * k, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = 0.2 * k; ctx.beginPath(); ctx.arc(0, -0.25 * k, 0.32 * k, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 0.14 * k; ctx.stroke();
    ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 0.04 * k; ctx.beginPath(); ctx.arc(0, -0.25 * k, 0.28 * k, 0.3 * Math.PI, 0.6 * Math.PI); ctx.stroke();
    ctx.fillStyle = '#6b4226'; ctx.fillRect(-0.32 * k, -0.12 * k, 0.07 * k, 0.07 * k);
    ctx.restore();
  }

  // ── 정답 게이트(아치) ──
  drawGateArch(z, label, colorful = true) {
    const { ctx } = this;
    const w = splitWidthAt(this.sAt(z));
    const L = this.project(-R - w / 2 - 0.3, 0, z), Rt = this.project(R + w / 2 + 0.3, 0, z);
    const sg = this.sAt(z);
    const top = this.project(0, 3.0 + overpassElev(sg) + (tunnelCovered(sg) ? 0.6 : 0), z).y;
    const k = L.k;
    const pw = 0.3 * k;
    ctx.fillStyle = '#2b2d42';
    ctx.fillRect(L.x - pw, top, pw, L.y - top); ctx.fillRect(Rt.x, top, pw, Rt.y - top);
    const bh = 0.55 * k;
    const grad = ctx.createLinearGradient(L.x, 0, Rt.x, 0);
    if (colorful) { grad.addColorStop(0, '#ff006e'); grad.addColorStop(0.5, '#8338ec'); grad.addColorStop(1, '#3a86ff'); }
    else { grad.addColorStop(0, '#111'); grad.addColorStop(1, '#333'); }
    ctx.fillStyle = grad; ctx.fillRect(L.x - pw, top - bh, Rt.x - L.x + pw * 2, bh);
    if (!colorful) {
      const cells = 16, cw = (Rt.x - L.x + pw * 2) / cells;
      for (let i = 0; i < cells; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#fff' : '#111'; ctx.fillRect(L.x - pw + i * cw, top - bh + (j * bh) / 2, cw, bh / 2); }
    }
    if (label && k > 2) {
      ctx.font = `italic 900 ${bh * 0.62}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (!colorful) { ctx.fillStyle = '#e63946'; ctx.fillRect((L.x + Rt.x) / 2 - bh * 2.2, top - bh * 1.05, bh * 4.4, bh * 1.1); }
      ctx.fillStyle = '#fff';
      ctx.fillText(label, (L.x + Rt.x) / 2, top - bh / 2);
    }
  }

  // ── 파티클 ──
  updateParticles(st, dt) {
    const { W, H } = this;
    if (st.inTunnel) this.particles = this.particles.filter((p) => p.kind !== 'flake');
    if (this.theme === 'snow' && !st.inTunnel && this.particles.length < 70) this.particles.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 30, vy: 60 + Math.random() * 90, r: 1.5 + Math.random() * 3 * this.dpr, kind: 'flake' });
    if (st.boost && Math.random() < 0.9) for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ x: W / 2 + Math.cos(a) * W * 0.12, y: this.h0 + 40 + Math.sin(a) * H * 0.1, vx: Math.cos(a) * 1400, vy: Math.sin(a) * 900, life: 0.5, kind: 'line' });
    }
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'flake') { p.x -= (st.lean || 0) * 120 * dt; return p.y < H + 10; }
      if (p.kind === 'smoke') { p.r += dt * 30 * this.dpr; }
      p.life -= dt; return p.life > 0;
    });
  }

  drawParticles() {
    const { ctx } = this;
    this.particles.forEach((p) => {
      if (p.kind === 'flake') { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      else if (p.kind === 'smoke') { ctx.fillStyle = `rgba(230,230,230,${Math.min(0.7, p.life)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      else if (p.kind === 'spark') { ctx.fillStyle = p.color || '#ffd60a'; ctx.globalAlpha = Math.min(1, p.life * 2); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      else { ctx.strokeStyle = `rgba(200,250,255,${p.life * 1.6})`; ctx.lineWidth = 3 * this.dpr; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); ctx.stroke(); }
    });
  }
  burst(x, y, n, color, speed = 500) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6) * this.dpr;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, r: (3 + Math.random() * 5) * this.dpr, life: 0.5 + Math.random() * 0.4, kind: 'spark', color });
    }
  }

  // ── 이펙트(충돌 별, 폭발, 로켓, 경보 등) ──
  drawEffects(me) {
    const { ctx, W, H } = this; const t = this.time;
    const headY = me.y - 1.6 * me.k * 0.92;
    this.effects = this.effects.filter((e) => {
      const age = t - e.t0;
      if (e.type === 'stars') {
        if (age > 0.8) return false;
        for (let i = 0; i < 5; i++) {
          const a = age * 9 + (i * Math.PI * 2) / 5;
          const x = me.x + Math.cos(a) * me.k * 0.45, y = headY - me.k * 0.25 + Math.sin(a) * me.k * 0.12;
          this.star(x, y, me.k * 0.1, '#ffd60a');
        }
        ctx.save(); ctx.font = `italic 900 ${me.k * 0.4}px system-ui`; ctx.textAlign = 'center';
        ctx.globalAlpha = 1 - age / 0.8; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = me.k * 0.05;
        ctx.strokeText('쿵!', me.x + me.k * 0.7, headY - me.k * 0.4 - age * 40); ctx.fillText('쿵!', me.x + me.k * 0.7, headY - me.k * 0.4 - age * 40);
        ctx.restore(); return true;
      }
      if (e.type === 'boom') {
        if (age > 0.7) return false;
        const r = me.k * (0.4 + age * 2.2);
        ctx.save(); ctx.globalAlpha = 1 - age / 0.7;
        const g = ctx.createRadialGradient(me.x, headY, 0, me.x, headY, r);
        g.addColorStop(0, '#fff7ae'); g.addColorStop(0.4, '#ff9f1c'); g.addColorStop(1, 'rgba(230,57,70,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(me.x, headY, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        return true;
      }
      if (e.type === 'rocket') {
        const d = 1.1; if (age > d) return false;
        const f = age / d;
        const x = me.x + (W / 2 - me.x) * f + Math.sin(f * 9) * 20 * this.dpr;
        const y = headY - (headY - this.h0 * 0.35) * Math.sin(f * Math.PI / 2);
        const sc = me.k * 0.5 * (1 - f * 0.75);
        this.particles.push({ x, y: y + sc * 0.8, vx: (Math.random() - 0.5) * 40, vy: 60, r: sc * 0.25, life: 0.6, kind: 'smoke' });
        this.missile(x, y, sc, 0);
        return true;
      }
      if (e.type === 'incoming') {
        const d = e.dur; if (age > d) return false;
        const f = age / d;
        ctx.save(); ctx.strokeStyle = `rgba(255,30,60,${0.6 + Math.sin(t * 20) * 0.4})`; ctx.lineWidth = 4 * this.dpr;
        const rr = me.k * (0.9 - f * 0.3);
        ctx.beginPath(); ctx.arc(me.x, headY + me.k * 0.4, rr, 0, Math.PI * 2); ctx.stroke();
        [0, 1, 2, 3].forEach((i) => { const a = i * Math.PI / 2 + t * 2; ctx.beginPath(); ctx.moveTo(me.x + Math.cos(a) * rr * 0.7, headY + me.k * 0.4 + Math.sin(a) * rr * 0.7); ctx.lineTo(me.x + Math.cos(a) * rr * 1.3, headY + me.k * 0.4 + Math.sin(a) * rr * 1.3); ctx.stroke(); });
        ctx.restore();
        if (f > 0.45) { const g = (f - 0.45) / 0.55; this.missile(me.x + (1 - g) * W * 0.2, -40 + (headY + 40) * g, me.k * 0.45, Math.PI * 0.75); }
        return true;
      }
      if (e.type === 'waterball') {
        const d = 0.8; if (age > d) return false;
        const f = age / d;
        const x = me.x + (W / 2 - me.x) * f, y = headY - Math.sin(f * Math.PI) * H * 0.25 - (headY - this.h0) * f;
        const r = me.k * 0.35 * (1 - f * 0.8);
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        g.addColorStop(0, '#e0f7ff'); g.addColorStop(1, '#1e88e5');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        return true;
      }
      if (e.type === 'padflash') {
        if (age > 0.5) return false;
        ctx.save(); ctx.globalAlpha = 0.5 * (1 - age / 0.5);
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
        g.addColorStop(0, 'rgba(0,229,255,0)'); g.addColorStop(1, 'rgba(0,229,255,1)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
        return true;
      }
      return age < 2;
    });
  }
  star(x, y, r, color) {
    const { ctx } = this; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = Math.max(1, r * 0.15); ctx.stroke();
  }
  missile(x, y, s, rot) {
    const { ctx } = this; ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const fl = ctx.createRadialGradient(0, s * 0.9, 0, 0, s * 0.9, s * 0.7);
    fl.addColorStop(0, '#fff'); fl.addColorStop(0.4, '#ffb703'); fl.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = fl; ctx.beginPath(); ctx.ellipse(0, s * 0.95, s * 0.22, s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e63946'; ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.quadraticCurveTo(s * 0.26, -s * 0.4, s * 0.2, s * 0.5); ctx.lineTo(-s * 0.2, s * 0.5); ctx.quadraticCurveTo(-s * 0.26, -s * 0.4, 0, -s * 0.8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f1faee'; ctx.fillRect(-s * 0.2, -s * 0.05, s * 0.4, s * 0.15);
    ctx.fillStyle = '#457b9d'; [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(d * s * 0.18, s * 0.2); ctx.lineTo(d * s * 0.42, s * 0.6); ctx.lineTo(d * s * 0.18, s * 0.5); ctx.fill(); ctx.stroke(); });
    ctx.restore();
  }

  drawFog(amount) {
    if (amount <= 0) return;
    const { ctx, W, H } = this; const t = this.time;
    const a = Math.min(1, amount);
    ctx.save();
    ctx.fillStyle = `rgba(225,230,235,${0.72 * a})`; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const x = ((i * 0.37 + t * 0.03 * (i % 3 + 1)) % 1.3 - 0.15) * W, y = (0.2 + (i % 4) * 0.2) * H;
      const r = (0.25 + (i % 3) * 0.1) * Math.max(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.55 * a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ── 표지판(HTML) ──
  ensureSigns(choices) {
    const key = JSON.stringify(choices || []);
    if (this.signKey === key) return;
    this.signKey = key;
    this.overlay.innerHTML = '';
    this.signs = (choices || []).map((c, i) => {
      const el = document.createElement('div');
      el.className = 'gate-sign';
      el.style.setProperty('--lane', LANE_COLORS[i]);
      el.innerHTML = `<b>${LANE_LABELS[i]}</b><span>${mathHTML(c)}</span>`;
      this.overlay.appendChild(el);
      return el;
    });
  }

  placeSigns(gate) {
    if (!gate) { this.signs.forEach((el) => (el.style.display = 'none')); return; }
    const laneW = (2 * R) / this.lanes;
    const w = splitWidthAt(this.sAt(gate.z));
    this.signs.forEach((el, i) => {
      const lx = laneXAt(i, this.lanes, w);
      const p = this.project(lx, surfaceH(lx, this.sAt(gate.z), this.lanes) + 2.3, gate.z);
      const wantW = laneW * 0.9 * p.k * this.cssScale;
      const scale = wantW / 220;
      if (scale < 0.06 || gate.z < 1) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.opacity = gate.highlight != null ? (i === gate.highlight ? '1' : '0.35') : '1';
      el.style.transform = `translate(${p.x * this.cssScale}px, ${p.y * this.cssScale}px) translate(-50%, -50%) scale(${scale})`;
    });
  }

  /**
   * st: { dist, speed, playerX, lean, boost, slow, me:{avatar,name,theme,spin,flip,lift,bubble,shield}, gate, finish, startLine,
   *       others:[{dd,x,label,avatar,theme,spin,flip,lift,bubble,shield,boost}], hazards:[{dd,x}], items:boolean, picked(key), fog }
   */
  render(st, dt) {
    this.time += dt;
    this.dist = st.dist;
    this.camY = this.camH + (st.camElev || 0);
    const { ctx, W, H } = this;
    this.buildCurve(st.dist);
    // 카메라: 기본은 캐릭터를 65% 따라가고, 터널·고가도로처럼 갈라진 길에서는 그 길 안에 머묾
    let camT = st.playerX * 0.65;
    const zn = zoneAt(st.dist), wz = splitWidthAt(st.dist);
    if (zn && wz > 0.4) {
      const b = splitBoundary(this.lanes), side = st.playerX >= b ? 1 : -1;
      const lo = side > 0 ? b + wz / 2 : -R - wz / 2, hi = side > 0 ? R + wz / 2 : b - wz / 2;
      const m = Math.min(0.7, (hi - lo) / 2 - 0.05);
      camT = Math.max(lo + m, Math.min(hi - m, camT));
    }
    this.camXs = this.camXs == null ? camT : this.camXs + (camT - this.camXs) * Math.min(1, dt * 6);
    this.camX = this.camXs;
    const boostZoom = st.boost ? 1.06 : 1;
    const sBase = this.s; this.s = sBase / boostZoom;
    this.bgShift += curvatureAt(st.dist) * VIS_CURVE * st.speed * dt * W * 0.9;
    const shake = st.boost || st.shake ? (Math.random() - 0.5) * (st.shake ? 10 : 3) * this.dpr : 0;
    ctx.save(); ctx.translate(shake, shake * 0.5);
    this.drawBackground();
    this.drawGround(st);
    const objs = [];
    this.roadsideObjects(st, objs);
    JUMPS.forEach((js) => this.forEachAhead(js, (z) => objs.push({ z: z + 2, draw: () => this.drawRamp(z) })));
    this.structures(st, objs);
    // 돌부리·눈더미 입체 (바닥 위로 튀어나온 부분)
    if (this.hazardSeed != null) this.forEachAhead(HAZARD_S, (z, abs) => {
      const hz = hazardAt(Math.floor(abs / TRACK_LEN), this.lanes, this.hazardSeed, this.theme);
      if (!hz || hz.kind === 'mud') return;
      const w = splitWidthAt(abs);
      hz.lanes.forEach((li) => {
        const x = laneXAt(li, this.lanes, w);
        if (hz.kind === 'rock') objs.push({ z: z + 0.6, draw: () => this.drawRocks(x, z + 0.6, li) });
        else objs.push({ z: z + 0.3, draw: () => this.drawSnowMound(x, z + 0.3, li) });
      });
    });
    if (st.items) ITEM_ROWS.forEach((row, ri) => this.forEachAhead(row.s, (z, abs) => {
      const w = splitWidthAt(abs);
      rowLanes(row, this.lanes).forEach((li) => {
        if (st.boxAvail && !st.boxAvail(ri, li)) return;
        const bx = laneXAt(li, this.lanes, w);
        objs.push({ z, draw: () => this.drawItemBox(bx, z, ri * 3 + li, surfaceH(bx, abs, this.lanes)) });
      });
    }));
    (st.hazards || []).forEach((h) => { const z = KART_Z + h.dd; if (z > 1 && z < 80) objs.push({ z, draw: () => this.drawBanana(h.x, z, surfaceH(h.x, this.sAt(z), this.lanes)) }); });
    if (st.gate && st.gate.z > 0.6) objs.push({ z: st.gate.z, draw: () => this.drawGateArch(st.gate.z, st.gate.label, true) });
    if (st.finish && st.finish.z > 0.6) objs.push({ z: st.finish.z, draw: () => this.drawGateArch(st.finish.z, 'FINISH', false) });
    if (st.startLine) objs.push({ z: 4.8, draw: () => this.drawGateArch(4.8, 'START', false) });
    (st.others || []).forEach((o) => {
      const z = KART_Z + o.dd;
      if (z < 1.3 || z > 90) return;
      objs.push({ z, draw: () => { const p = this.project(o.x, surfaceH(o.x, this.sAt(z), this.lanes), z); drawRider(ctx, p.x, p.y, p.k, { ...o, av: o.avatar, t: this.time + (o.seed || 0), moving: true, speedRatio: 1 }); } });
    });
    objs.sort((a, b) => b.z - a.z).forEach((o) => o.draw());
    const me = this.project(st.playerX, st.camElev || 0, KART_Z);
    drawRider(ctx, me.x, me.y, me.k, { ...st.me, av: st.me.avatar, t: this.time, lean: st.lean, boost: st.boost, moving: st.speed > 1, speedRatio: st.speed / 25 });
    this.updateParticles(st, dt);
    this.drawParticles();
    this.drawEffects(me);
    ctx.restore();
    if (st.boost) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(0,200,255,0)'); g.addColorStop(1, 'rgba(0,200,255,0.35)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (st.slow > 0) { ctx.fillStyle = `rgba(255,40,60,${0.18 * Math.min(1, st.slow)})`; ctx.fillRect(0, 0, W, H); }
    if (st.inTunnel) {
      const g = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.2, W / 2, H * 0.55, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(10,10,30,0.15)'); g.addColorStop(1, 'rgba(5,5,15,0.7)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    this.drawFog(st.fog || 0);
    this.placeSigns(st.gate && st.gate.z > 0.8 && !(st.fog > 0.5) ? st.gate : null);
    this.meScreen = { x: me.x * this.cssScale, y: me.y * this.cssScale };
    this.s = sBase;
  }
}
