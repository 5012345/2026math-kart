// 레이서 + 탈것 뒷모습 (썰매 / 서핑보드 / 자전거)
// 좌표는 월드 단위(1 = 도로폭의 1/6). 바닥 접점이 (0,0), 위쪽이 음수.
import { drawEars, drawAvatarFront, shade, COLORS } from './common.js';

const OUT = '#1b1b2f';
const SKIN = '#ffd9b8';
const LW = 0.035;

function riderNumber(name) {
  const m = String(name || '').match(/^\s*(\d{1,2})/);
  return m ? m[1] : (String(name || '?').trim()[0] || '?');
}

/** 외곽선이 있는 굵은 선(팔다리) */
function limb(g, pts, w, color) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); };
  path(); g.strokeStyle = OUT; g.lineWidth = w + LW * 2; g.stroke();
  path(); g.strokeStyle = color; g.lineWidth = w; g.stroke();
}
function blob(g, x, y, rx, ry, fill, stroke = true) {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = OUT; g.lineWidth = LW; g.stroke(); }
}
function text(g, str, x, y, size, color, weight = 900) {
  g.save(); g.scale(0.01, 0.01);
  g.font = `italic ${weight} ${size * 100}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.fillText(str, x * 100, y * 100);
  g.restore();
}

/** 헬멧 뒷모습 */
function helmetBack(g, cx, cy, r, av) {
  const c = av?.color || COLORS[4];
  g.save(); g.translate(cx, cy);
  g.lineWidth = LW;
  drawEars(g, av?.ears, r, c, true);
  // 셸
  const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  grad.addColorStop(0, shade(c, 0.28)); grad.addColorStop(0.6, c); grad.addColorStop(1, shade(c, -0.22));
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = grad; g.fill(); g.strokeStyle = OUT; g.stroke();
  // 가운데 레이싱 줄무늬
  g.save(); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#ffffff'; g.fillRect(-r * 0.16, -r, r * 0.32, r * 2);
  g.fillStyle = shade(c, -0.3); g.fillRect(-r * 0.05, -r, r * 0.1, r * 2);
  // 아래 테두리(턱 부분)
  g.fillStyle = '#2b2d42'; g.fillRect(-r, r * 0.55, r * 2, r * 0.5);
  g.restore();
  // 통풍구
  g.fillStyle = OUT;
  [-0.55, 0.55].forEach((sx) => { g.beginPath(); g.ellipse(sx * r, -r * 0.25, r * 0.07, r * 0.2, sx * 0.4, 0, Math.PI * 2); g.fill(); });
  // 고글 끈
  g.fillStyle = '#ffd60a'; g.fillRect(-r * 0.98, -r * 0.02, r * 1.96, r * 0.16);
  g.strokeStyle = OUT; g.strokeRect(-r * 0.98, -r * 0.02, r * 1.96, r * 0.16);
  // 하이라이트
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(-r * 0.45, -r * 0.55, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** 상체(레이싱 슈트) 뒷모습 + 등번호 */
function torsoBack(g, by, bw, ty, tw, av, name, lean = 0) {
  const c = av?.color || COLORS[4];
  const dark = shade(c, -0.25);
  g.save();
  g.beginPath();
  g.moveTo(-bw / 2, by);
  g.lineTo(-tw / 2, ty + 0.12);
  g.quadraticCurveTo(-tw / 2, ty, -tw / 2 + 0.12, ty - 0.02);
  g.lineTo(tw / 2 - 0.12, ty - 0.02);
  g.quadraticCurveTo(tw / 2, ty, tw / 2, ty + 0.12);
  g.lineTo(bw / 2, by);
  g.closePath();
  const grad = g.createLinearGradient(-tw / 2, 0, tw / 2, 0);
  grad.addColorStop(0, dark); grad.addColorStop(0.3, c); grad.addColorStop(0.7, c); grad.addColorStop(1, dark);
  g.fillStyle = grad; g.fill();
  g.save(); g.clip();
  // 옆 패널 + 가운데 줄
  g.fillStyle = '#ffffff'; g.fillRect(-tw / 2, ty + (by - ty) * 0.72, tw, 0.05);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-0.02, ty, 0.04, by - ty);
  g.restore();
  g.strokeStyle = OUT; g.lineWidth = LW; g.stroke();
  // 등번호 원
  const ny = ty + (by - ty) * 0.42;
  blob(g, 0, ny, 0.15, 0.13, '#ffffff');
  text(g, riderNumber(name), 0, ny + 0.01, 0.17, OUT);
  // 칼라(목)
  blob(g, 0, ty - 0.01, 0.12, 0.05, shade(c, -0.35));
  g.restore();
}

function glove(g, x, y) { blob(g, x, y, 0.075, 0.07, '#2b2d42'); blob(g, x - 0.02, y - 0.02, 0.025, 0.02, '#ffffff', false); }
/** 양팔 그리기: 평소 자세(rest)와 만세 자세 사이를 o.cheer(0~1)로 섞음. 손 위치 [왼손, 오른손] 반환 */
function arms(g, o, sh, rest, w) {
  const c = Math.max(0, Math.min(1, o.cheer || 0));
  const t = o.t || 0;
  const mix = (a, b) => [a[0] + (b[0] - a[0]) * c, a[1] + (b[1] - a[1]) * c];
  return [-1, 1].map((s, i) => {
    const [e0, h0] = rest[i];
    const wave = Math.sin(t * 14 + i * 1.7) * 0.05;
    const elbow = mix(e0, [s * (sh[0] + 0.24), sh[1] - 0.3]);
    const hand = mix(h0, [s * (sh[0] + 0.2) + wave, sh[1] - 0.78 + Math.abs(wave) * 0.4]);
    limb(g, [[s * sh[0], sh[1]], elbow, hand], w, o.av?.color || '#4361ee');
    glove(g, hand[0], hand[1]);
    return hand;
  });
}

function boostFlames(g, pts, t) {
  pts.forEach(([x, y]) => {
    const len = 0.35 + Math.random() * 0.25;
    const grad = g.createRadialGradient(x, y, 0, x, y + len * 0.3, len);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(120,240,255,0.95)'); grad.addColorStop(1, 'rgba(40,110,255,0)');
    g.fillStyle = grad; g.beginPath(); g.ellipse(x, y + len * 0.25, 0.12 + Math.sin(t * 40) * 0.02, len, 0, 0, Math.PI * 2); g.fill();
  });
}

// ── 썰매 ──
function drawSled(g, o) {
  const { av, t, moving } = o;
  // 눈보라
  if (moving) {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 8; i++) { const s = i % 2 ? 1 : -1; blob(g, s * (0.5 + Math.random() * 0.35), -Math.random() * 0.22, 0.05 + Math.random() * 0.07, 0.04 + Math.random() * 0.05, 'rgba(255,255,255,0.85)', false); }
  }
  if (o.boost) boostFlames(g, [[-0.32, -0.18], [0.32, -0.18]], t);
  // 러너(스키 날)
  g.lineCap = 'round';
  [-0.5, 0.5].forEach((sx) => {
    limb(g, [[sx, -0.38], [sx * 1.02, -0.06], [sx * 1.04, 0.0]], 0.05, '#adb5bd');
    g.strokeStyle = OUT; g.lineWidth = 0.05; g.beginPath(); g.arc(sx * 1.04 + (sx > 0 ? -0.06 : 0.06), -0.06, 0.07, sx > 0 ? 0 : Math.PI, Math.PI / 2, sx > 0); g.stroke();
    g.strokeStyle = '#ced4da'; g.lineWidth = 0.03; g.stroke();
  });
  // 상체 (썰매 안에 앉아 있음)
  torsoBack(g, -0.36, 0.6, -0.92, 0.7, av, o.name);
  // 팔 + 손잡이 줄
  const sway = Math.sin(t * 6) * 0.02;
  if ((o.cheer || 0) < 0.3) { g.strokeStyle = '#e09f3e'; g.lineWidth = 0.025; g.beginPath(); g.moveTo(-0.62, -0.5); g.quadraticCurveTo(0, -0.42, 0.62, -0.5); g.stroke(); }
  arms(g, o, [0.31, -0.86], [[[-0.52, -0.68], [-0.62, -0.52 + sway]], [[0.52, -0.68], [0.62, -0.52 - sway]]], 0.12);
  // 목도리 (펄럭)
  const f = Math.sin(t * 14);
  g.beginPath(); g.moveTo(0.05, -0.95); g.quadraticCurveTo(0.35, -1.0 + f * 0.04, 0.55, -0.92 + f * 0.08); g.lineTo(0.5, -0.84 + f * 0.06); g.quadraticCurveTo(0.3, -0.9, 0.06, -0.88); g.closePath();
  g.fillStyle = '#ffd60a'; g.fill(); g.strokeStyle = OUT; g.lineWidth = LW; g.stroke();
  // 썰매 뒤판
  g.beginPath();
  g.moveTo(-0.66, -0.5); g.lineTo(0.66, -0.5); g.lineTo(0.6, -0.12); g.quadraticCurveTo(0, -0.06, -0.6, -0.12); g.closePath();
  const wg = g.createLinearGradient(0, -0.5, 0, -0.1); wg.addColorStop(0, '#e63946'); wg.addColorStop(1, '#a4161a');
  g.fillStyle = wg; g.fill(); g.strokeStyle = OUT; g.lineWidth = LW; g.stroke();
  // 나무 등받이 테두리
  g.fillStyle = '#b5651d'; g.fillRect(-0.7, -0.56, 1.4, 0.08); g.strokeRect(-0.7, -0.56, 1.4, 0.08);
  g.fillStyle = '#d4a373'; [-0.45, 0, 0.45].forEach((x) => g.fillRect(x - 0.03, -0.55, 0.06, 0.06));
  // 번호판 + 반사판
  g.fillStyle = '#ffffff'; g.fillRect(-0.2, -0.38, 0.4, 0.17); g.strokeRect(-0.2, -0.38, 0.4, 0.17);
  text(g, riderNumber(o.name), 0, -0.295, 0.13, '#a4161a');
  blob(g, -0.48, -0.3, 0.06, 0.05, '#ff9f1c'); blob(g, 0.48, -0.3, 0.06, 0.05, '#ff9f1c');
  return -1.25; // 헬멧 중심 y
}

// ── 서핑보드 ──
function drawSurf(g, o) {
  const { av, t, moving } = o;
  // 물보라 V자
  if (moving) {
    for (let i = 0; i < 10; i++) {
      const s = i % 2 ? 1 : -1;
      blob(g, s * (0.3 + Math.random() * 0.6), -0.05 - Math.random() * 0.3, 0.05 + Math.random() * 0.08, 0.04 + Math.random() * 0.06, 'rgba(255,255,255,0.9)', false);
    }
  }
  // 보드
  g.beginPath();
  g.moveTo(-0.34, -0.02);
  g.quadraticCurveTo(-0.42, -0.35, -0.12, -0.9);
  g.quadraticCurveTo(0, -1.02, 0.12, -0.9);
  g.quadraticCurveTo(0.42, -0.35, 0.34, -0.02);
  g.quadraticCurveTo(0, 0.06, -0.34, -0.02);
  const bg = g.createLinearGradient(0, -1, 0, 0); bg.addColorStop(0, '#ffd166'); bg.addColorStop(0.55, '#ff8c42'); bg.addColorStop(1, '#ef476f');
  g.fillStyle = bg; g.fill(); g.strokeStyle = OUT; g.lineWidth = LW; g.stroke();
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(-0.04, -0.92); g.lineTo(0.04, -0.92); g.lineTo(0.06, -0.02); g.lineTo(-0.06, -0.02); g.fill();
  // 핀 3개
  g.fillStyle = '#264653';
  [[-0.2, 0.0], [0, 0.03], [0.2, 0.0]].forEach(([x, y]) => { g.beginPath(); g.moveTo(x - 0.04, y - 0.02); g.lineTo(x, y + 0.12); g.lineTo(x + 0.04, y - 0.02); g.fill(); });
  if (o.boost) boostFlames(g, [[-0.15, 0.0], [0.15, 0.0]], t);
  // 리쉬 줄
  g.strokeStyle = '#06d6a0'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(0.25, -0.03); g.bezierCurveTo(0.45, 0.02, 0.4, -0.2, 0.24, -0.2); g.stroke();
  // 다리 (웅크린 자세)
  const bob = Math.sin(t * 5) * 0.025;
  const suit = '#1d3557';
  limb(g, [[-0.22, -0.2], [-0.33, -0.45 + bob], [-0.14, -0.66 + bob]], 0.15, suit);
  limb(g, [[0.22, -0.2], [0.33, -0.45 + bob], [0.14, -0.66 + bob]], 0.15, suit);
  blob(g, -0.22, -0.2, 0.09, 0.05, '#2b2d42'); blob(g, 0.22, -0.2, 0.09, 0.05, '#2b2d42');
  // 다리 색 줄
  g.strokeStyle = av.color; g.lineWidth = 0.03;
  g.beginPath(); g.moveTo(-0.33, -0.45 + bob); g.lineTo(-0.15, -0.64 + bob); g.moveTo(0.33, -0.45 + bob); g.lineTo(0.15, -0.64 + bob); g.stroke();
  // 상체
  g.save(); g.translate(0, bob);
  torsoBack(g, -0.64, 0.42, -1.1, 0.66, av, o.name);
  // 팔 (균형 잡기)
  const wv = Math.sin(t * 3) * 0.06 + (o.lean || 0) * 0.15;
  arms(g, o, [0.3, -1.04], [[[-0.58, -0.96 + wv], [-0.86, -1.0 + wv * 1.6]], [[0.58, -0.96 - wv], [0.86, -1.0 - wv * 1.6]]], 0.11);
  g.restore();
  return -1.4 + bob;
}

// ── 자전거 ──
function drawBike(g, o) {
  const { av, t } = o;
  const p = t * 11 * (o.speedRatio || 1);
  // 뒷바퀴
  blob(g, 0, -0.36, 0.085, 0.37, '#1b1b2f');
  blob(g, 0, -0.36, 0.045, 0.31, '#adb5bd', false);
  blob(g, 0, -0.36, 0.03, 0.27, '#343a40', false);
  g.strokeStyle = '#dee2e6'; g.lineWidth = 0.01;
  for (let i = 0; i < 6; i++) { const a = p + (i * Math.PI) / 3; g.beginPath(); g.moveTo(0, -0.36); g.lineTo(Math.cos(a) * 0.03, -0.36 + Math.sin(a) * 0.27); g.stroke(); }
  blob(g, 0, -0.36, 0.04, 0.04, '#ced4da');
  if (o.boost) boostFlames(g, [[-0.14, -0.12], [0.14, -0.12]], t);
  // 프레임 (시트 스테이)
  limb(g, [[-0.03, -0.36], [-0.07, -0.86]], 0.035, '#e63946');
  limb(g, [[0.03, -0.36], [0.07, -0.86]], 0.035, '#e63946');
  // 흙받이 + 후미등
  g.strokeStyle = OUT; g.lineWidth = 0.07; g.beginPath(); g.arc(0, -0.38, 0.37, -Math.PI * 0.9, -Math.PI * 0.1); g.stroke();
  g.strokeStyle = '#6c757d'; g.lineWidth = 0.045; g.stroke();
  g.fillStyle = '#ff1744'; g.fillRect(-0.07, -0.72, 0.14, 0.07); g.strokeStyle = OUT; g.lineWidth = LW; g.strokeRect(-0.07, -0.72, 0.14, 0.07);
  g.fillStyle = 'rgba(255,60,60,0.35)'; g.beginPath(); g.arc(0, -0.685, 0.14, 0, Math.PI * 2); g.fill();
  // 페달링 다리
  const ly = Math.sin(p), ry = -ly;
  const legs = (side, ph) => {
    const pedal = [side * 0.2, -0.3 + ph * 0.13];
    const knee = [side * 0.25, -0.64 + ph * 0.08];
    limb(g, [[side * 0.1, -0.9], knee, pedal], 0.13, '#264653');
    blob(g, pedal[0], pedal[1] + 0.02, 0.07, 0.045, '#ffffff');
    g.fillStyle = '#495057'; g.fillRect(pedal[0] - 0.08, pedal[1] + 0.04, 0.16, 0.025);
  };
  legs(-1, ly); legs(1, ry);
  // 안장
  blob(g, 0, -0.9, 0.17, 0.06, '#212529');
  // 핸들바 (몸 뒤에 가려짐)
  g.strokeStyle = '#495057'; g.lineWidth = 0.04; g.beginPath(); g.moveTo(-0.5, -1.16); g.lineTo(0.5, -1.16); g.stroke();
  // 상체 (앞으로 숙임)
  torsoBack(g, -0.9, 0.44, -1.36, 0.68, av, o.name);
  // 팔 → 핸들
  arms(g, o, [0.31, -1.3], [[[-0.46, -1.22], [-0.51, -1.15]], [[0.46, -1.22], [0.51, -1.15]]], 0.11);
  return -1.56;
}

/**
 * 레이서 그리기
 * o: { av, name, theme, t, lean, boost, moving, speedRatio, spin(rad), flip(rad), lift(월드단위 높이), cheer(0~1 만세), wobble(0~1 휘청), invincible(정답 무적), bubble, shield, label }
 */
export function drawRider(ctx, x, y, k, o) {
  const u = k * 0.92;
  const av = o.av || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(u, u);
  // 그림자 (공중이면 작아짐)
  const lift = o.lift || 0;
  ctx.fillStyle = `rgba(0,0,0,${0.25 / (1 + lift)})`;
  ctx.beginPath(); ctx.ellipse(0, 0.02, 0.75 / (1 + lift * 0.5), 0.12 / (1 + lift * 0.5), 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, -lift);
  if (o.flip) { ctx.translate(0, -0.7); ctx.rotate(o.flip); ctx.translate(0, 0.7); }
  const face = Math.cos(o.spin || 0);
  if (o.spin) ctx.scale(Math.max(0.3, Math.abs(face)), 1);
  ctx.rotate((o.lean || 0) * 0.1);
  if (o.wobble) { // 돌부리에 걸려 좌우로 휘청
    const w = Math.min(1, o.wobble), tt = (o.t || 0) * 11;
    ctx.translate(Math.sin(tt + 0.7) * 0.14 * w, 0);
    ctx.rotate(Math.sin(tt) * 0.32 * w);
  }
  if (o.invincible) { // 정답 무적: 무지개빛 오라 + 반짝이
    const tt = o.t || 0, hue = (tt * 220) % 360;
    const gr = ctx.createRadialGradient(0, -0.8, 0.2, 0, -0.8, 1.35);
    gr.addColorStop(0, `hsla(${hue},100%,70%,0.55)`); gr.addColorStop(0.6, `hsla(${(hue + 60) % 360},100%,60%,0.3)`); gr.addColorStop(1, `hsla(${(hue + 120) % 360},100%,60%,0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, -0.8, 1.25, 1.45, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) { // 무지개 테두리
      ctx.strokeStyle = `hsla(${(hue + i * 90) % 360},100%,62%,${0.85 - i * 0.2})`; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.ellipse(0, -0.8, 1.18 - i * 0.09, 1.38 - i * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const a = tt * 3 + (i / 5) * Math.PI * 2, r = 1.05 + Math.sin(tt * 6 + i) * 0.1;
      const sx = Math.cos(a) * r, sy = -0.8 + Math.sin(a) * r * 1.15, sz = 0.09 + 0.04 * Math.sin(tt * 9 + i);
      ctx.fillStyle = `hsl(${(hue + i * 70) % 360},100%,75%)`;
      ctx.beginPath(); for (let j = 0; j < 8; j++) { const rr = j % 2 ? sz * 0.4 : sz, aa = (j / 8) * Math.PI * 2; ctx.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr); } ctx.closePath(); ctx.fill();
    }
  }
  const theme = o.theme || 'snow';
  const headY = theme === 'falls' ? drawSurf(ctx, { ...o, av }) : theme === 'road' ? drawBike(ctx, { ...o, av }) : drawSled(ctx, { ...o, av });
  if (face >= 0) helmetBack(ctx, 0, headY, 0.31, av);
  else drawAvatarFront(ctx, 0, headY, 0.31, av);
  if (o.shield) {
    const a = 0.45 + Math.sin((o.t || 0) * 10) * 0.15;
    ctx.strokeStyle = `rgba(120,255,200,${a + 0.3})`; ctx.lineWidth = 0.06;
    ctx.fillStyle = `rgba(120,255,200,${a * 0.35})`;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2 + (o.t || 0); const px = Math.cos(ang) * 1.05, py = -0.75 + Math.sin(ang) * 1.05; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  if (o.bubble) {
    ctx.save(); ctx.translate(x, y - lift * u); ctx.scale(u, u);
    const wob = Math.sin((o.t || 0) * 8) * 0.05;
    const bg = ctx.createRadialGradient(-0.3, -1.1, 0.1, 0, -0.75, 1.15);
    bg.addColorStop(0, 'rgba(255,255,255,0.75)'); bg.addColorStop(0.4, 'rgba(120,200,255,0.35)'); bg.addColorStop(1, 'rgba(40,120,255,0.55)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, -0.75, 1.1 + wob, 1.1 - wob, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.04; ctx.stroke();
    ctx.restore();
  }
  if (o.label) {
    ctx.save();
    const fs = Math.max(11, 0.26 * k);
    ctx.font = `800 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const ny = y - (1.95 + lift) * u - (theme === 'snow' ? 0 : 0.15 * u);
    const tw = ctx.measureText(o.label).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect?.(x - tw / 2, ny - fs - 4, tw, fs + 7, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(o.label, x, ny + 1);
    ctx.restore();
  }
}
