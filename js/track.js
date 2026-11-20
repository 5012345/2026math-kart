// 순환 코스 정의: 한 바퀴 = 한 문제
//  0m 출발·결승선 → 150 아이템 상자 → 330~540 고가도로 갈림길 → 700 가속발판 → 880 점프대
//  → 1060~1270 지하터널 갈림길 → 1440 문제통과지점 → 1600 결승선
export const TRACK_LEN = 1600;   // 한 바퀴 (m)
export const R = 4.5;            // 도로 반폭 (최대 6코스, 코스 하나 1.5)
export const MAX_LANES = 6;
const SPLIT_MAX = 3.0;           // 갈래길 사이 섬 폭
export const CHECKPOINT = 1440;  // 문제통과지점 (매 바퀴)

// [시작, 끝, 회전각(도)]  + 오른쪽 / - 왼쪽  → 합계 360° (한 바퀴). 각 지점은 직선 구간에 놓임
const TURNS = [
  [196, 285, 73], [558, 693, 62], [729, 818, 57], [909, 1051, 40],
  [1284, 1419, 76], [1473, 1568, 52],
];
// 갈래길: kind 'overpass'(고가도로, side 쪽 길이 위로 올라감) / 'tunnel'(지하터널, side 쪽 길이 터널로 들어감)
//  side: 1 = 오른쪽 갈래, -1 = 왼쪽 갈래
export const SPLITS = [
  { a: 330, b: 540, kind: 'overpass', side: 1 },
  { a: 1060, b: 1270, kind: 'tunnel', side: -1 },
];
export const JUMPS = [880];
// 가속발판 1곳: 한 칸 걸러 놓이고, 바퀴마다 짝·홀 코스가 번갈아 바뀜 (늘 한 코스 안에만 놓임)
export const PADS = [{ s: 700, parity: 0 }];
export const padLanes = (pad, n, lap = 0) => [...Array(n).keys()].filter((i) => i % 2 === (pad.parity + lap) % 2);
// 아이템 상자 1곳: 모든 코스에 하나씩
export const ITEM_ROWS = [{ s: 150 }];
export const rowLanes = (row, n) => [...Array(n).keys()];
export const BOX_RESPAWN = 4000; // 상자 다시 생기는 시간(ms)
export const OVERPASS_H = 1.8;   // 고가도로 높이
export const TUNNEL_H = 2.7;     // 터널 천장 높이
const ELEV_RAMP = 55;            // 고가도로 오르막·내리막 길이
export const TUNNEL_IN = 50;     // 갈래 시작 후 터널 입구까지

/** 문제 qi(0부터)를 판정하는 누적 위치 */
export const checkpointAbs = (qi) => qi * TRACK_LEN + CHECKPOINT;

const mod = (s) => ((s % TRACK_LEN) + TRACK_LEN) % TRACK_LEN;

/** 위치 s에서의 곡률 (rad/m) — 사인 모양으로 부드럽게 들어가고 나옴 */
export function curvatureAt(s) {
  s = mod(s);
  for (const [a, b, deg] of TURNS) {
    if (s >= a && s < b) {
      const peak = ((deg * Math.PI) / 180) * Math.PI / (2 * (b - a));
      return peak * Math.sin((Math.PI * (s - a)) / (b - a));
    }
  }
  return 0;
}

const smooth = (t) => t * t * (3 - 2 * t);
/** 갈래길 섬 폭 */
export function splitWidthAt(s) {
  s = mod(s);
  for (const { a, b } of SPLITS) {
    if (s > a && s < b) {
      const ramp = 35;
      const t = Math.min(1, (s - a) / ramp, (b - s) / ramp);
      return SPLIT_MAX * smooth(Math.max(0, t));
    }
  }
  return 0;
}
/** 지금 위치의 갈래길 정보 */
export function zoneAt(s) {
  s = mod(s);
  return SPLITS.find((z) => s > z.a && s < z.b) || null;
}
/** 고가도로 높이 (그 갈래 위) */
export function overpassElev(s) {
  const z = zoneAt(s); if (!z || z.kind !== 'overpass') return 0;
  s = mod(s);
  const t = Math.min(1, (s - z.a - 20) / ELEV_RAMP, (z.b - 20 - s) / ELEV_RAMP);
  return OVERPASS_H * smooth(Math.max(0, t));
}
/** 터널 덮개 구간인지 */
export function tunnelCovered(s) {
  const z = zoneAt(s); if (!z || z.kind !== 'tunnel') return false;
  s = mod(s);
  return s > z.a + TUNNEL_IN && s < z.b - TUNNEL_IN;
}
/** x가 갈래길의 어느 쪽인지 (1 오른쪽, -1 왼쪽) */
export const sideOf = (x, n) => (x >= splitBoundary(n) ? 1 : -1);
/** 노면 높이 */
export function surfaceH(x, s, n) {
  const z = zoneAt(s);
  if (!z || z.kind !== 'overpass') return 0;
  return sideOf(x, n) === z.side ? overpassElev(s) : 0;
}
/** 코스 이동 제한: 두 갈래가 완전히 갈라진 구간 (고가도로 위·아래, 터널 안·밖) */
export function laneLockAt(s) {
  const z = zoneAt(s); if (!z) return null;
  const m = mod(s);
  if (z.kind === 'overpass' && overpassElev(m) > 0.25) return z;
  if (z.kind === 'tunnel' && m > z.a + TUNNEL_IN - 12 && m < z.b - TUNNEL_IN + 12) return z;
  return null;
}

/** 갈래가 나뉘는 기준 x (코스 수에 따라) */
export const splitBoundary = (n) => -R + Math.floor(n / 2) * (2 * R) / n;
/** 기본 x 좌표를 갈래길 폭 w 만큼 양쪽으로 벌림 */
export const spreadX = (x, w, n) => (w <= 0 ? x : x < splitBoundary(n) ? x - w / 2 : x + w / 2);
export const laneBaseX = (i, n) => -R + ((i + 0.5) * 2 * R) / n;
export const laneXAt = (i, n, w) => spreadX(laneBaseX(i, n), w, n);

// ── 미니맵용 코스 모양 (실제 곡률을 적분해 닫힌 고리로) ──
function buildShape() {
  const pts = []; let x = 0, y = 0, h = -Math.PI / 2;
  const step = 4;
  for (let s = 0; s <= TRACK_LEN; s += step) {
    pts.push([x, y]);
    h += curvatureAt(s) * step;
    x += Math.cos(h) * step; y += Math.sin(h) * step;
  }
  // 닫힘 오차 보정
  const [ex, ey] = [x - pts[0][0], y - pts[0][1]];
  const fixed = pts.map(([px, py], i) => [px - (ex * i) / pts.length, py - (ey * i) / pts.length]);
  const xs = fixed.map((p) => p[0]), ys = fixed.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const sc = 88 / Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  const offX = (100 - (Math.max(...xs) - minX) * sc) / 2, offY = (100 - (Math.max(...ys) - minY) * sc) / 2;
  return fixed.map(([px, py]) => [offX + (px - minX) * sc, offY + (py - minY) * sc]);
}
export const SHAPE = buildShape();
export const SHAPE_PATH = 'M' + SHAPE.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';
/** 거리 d(누적) → 미니맵 좌표 */
export function mapPoint(d) {
  const f = (mod(d) / TRACK_LEN) * (SHAPE.length - 1);
  const i = Math.floor(f), t = f - i;
  const a = SHAPE[i], b = SHAPE[Math.min(SHAPE.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
export const lapOf = (d) => Math.floor(Math.max(0, d) / TRACK_LEN) + 1;
