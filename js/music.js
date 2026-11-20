// ─────────────────────────────────────────────────────────────
// 배경음악 + 효과음 신시사이저 (Web Audio API, 음원 파일 없이 직접 합성)
//  곡 3개 모두 이 앱을 위해 새로 만든 곡입니다.
// ─────────────────────────────────────────────────────────────

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'F#5' → MIDI 번호 */
export function midi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** 'Am', 'G', 'D7' → 화음 구성음 (근음 MIDI, 3화음) */
function chord(name) {
  const m = /^([A-G][#b]?)(m?)(7?)$/.exec(name);
  const root = midi(m[1] + '3');
  const tones = [0, m[2] ? 3 : 4, 7];
  if (m[3]) tones.push(m[2] ? 10 : 10);
  return { root, tones };
}

/** 멜로디 한 마디(16칸): 'E5 - G5 . ...'  음이름=새 음, '-'=늘이기, '.'=쉼 → [{step, note, len}] */
function parseBar(str) {
  const tk = str.trim().split(/\s+/);
  if (tk.length !== 16) throw new Error('마디는 16칸이어야 해요: ' + str);
  const out = [];
  tk.forEach((t, i) => {
    const n = midi(t); if (n == null) return;
    let len = 1; while (tk[i + len] === '-') len++;
    out.push({ step: i, note: n, len });
  });
  return out;
}

// ── 곡 데이터 ──
//  bass: 16칸 ('1' 근음, '5' 5도, '8' 옥타브 위, '.' 쉼)  pad: 'x' 화음 / '-' 늘이기
//  drums: k 킥, s 스네어, h 하이햇, j 썰매방울, sh 셰이커
export const SONGS = {
  // 🛷 설원 눈썰매 — 썰매방울이 짤랑이는 밝은 C장조 폴카풍
  snow: {
    title: '눈꽃 썰매 질주', bpm: 152, swing: 0.1,
    lead: 'bell', bass: 'round', pad: 'stab',
    chords: ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G'],
    melody: [
      'E5 - G5 - C6 - - - B5 - G5 - A5 - - -',
      'A5 - C6 - A5 - E5 - G5 - - - . . . .',
      'F5 - A5 - C6 - A5 - G5 - F5 - E5 - D5 -',
      'D5 - G5 - B5 - D6 - B5 - - - . . . .',
      'E5 - G5 - C6 - E6 - D6 - C6 - B5 - G5 -',
      'E5 - G5 - B5 - - - A5 - G5 - E5 - - -',
      'F5 - A5 - C6 - F6 - E6 - D6 - C6 - A5 -',
      'G5 - B5 - D6 - - - G5 - - - . . . .',
    ],
    bassPat: '1...5...1...5.5.',
    padPat: '..x...x...x...x.',
    drums: { k: 'x.......x.......', s: '....x.......x...', j: 'x.x.x.x.x.x.x.x.', h: '' },
  },
  // 🏄 폭포 서핑 — 통통 튀는 기타 느낌의 G장조 서프·트로피컬
  falls: {
    title: '폭포 위의 서핑', bpm: 134, swing: 0.16,
    lead: 'pluck', bass: 'round', pad: 'skank',
    chords: ['G', 'D', 'C', 'D', 'G', 'C', 'Am', 'D'],
    melody: [
      'B4 . D5 . G5 - - . F#5 . E5 . D5 - - .',
      'D5 . F#5 . A5 - - . B5 - A5 - F#5 - - -',
      'E5 . G5 . C6 - - . B5 . A5 . G5 - - .',
      'F#5 - - . A5 - - . D6 - - - . . . .',
      'G5 . B5 . D6 - - . B5 . G5 . E5 - - .',
      'E5 . G5 . C6 - - . E6 - D6 - C6 - - -',
      'A5 . C6 . E6 - - . D6 . C6 . A5 - - .',
      'F#5 - A5 - D6 - - - C6 - B5 - A5 - - -',
    ],
    bassPat: '1..1..5.8..8..5.',
    padPat: '..x...x...x...x.',
    drums: { k: 'x.....x...x.....', s: '....x.......x...', sh: 'x.x.x.x.x.x.x.x.', h: '' },
  },
  // 🚴 고속도로 자전거 — 빠르게 달리는 A단조 신스팝·유로비트
  road: {
    title: '하이웨이 스프린트', bpm: 158, swing: 0,
    lead: 'saw', bass: 'saw', pad: 'pad',
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'],
    melody: [
      'A5 - - . E5 - - . A5 - B5 - C6 - B5 -',
      'A5 - - . F5 - - . A5 - C6 - F6 - E6 -',
      'E6 - - . C6 - - . G5 - C6 - E6 - D6 -',
      'D6 - - . B5 - - . G5 - - - . . . .',
      'A5 - C6 - E6 - A6 - G6 - E6 - C6 - E6 -',
      'F6 - E6 - C6 - A5 - C6 - - - A5 - - -',
      'B5 - D6 - G6 - D6 - B5 - D6 - G5 - B5 -',
      'G#5 - - - B5 - - - E6 - - - . . . .',
    ],
    bassPat: '1.8.1.8.1.8.1.8.',
    padPat: 'x---------------',
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
  },
};
for (const s of Object.values(SONGS)) s.bars = s.melody.map(parseBar);

/** 짧은 노이즈 버퍼 (드럼·효과음 공용, 한 번만 만듦) */
function noiseBuffer(ctx) {
  const n = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** 합성 도구 모음 (효과음·음악 공통) */
export class Synth {
  constructor(ctx) { this.ctx = ctx; this.nb = noiseBuffer(ctx); }
  env(g, t, vol, a, d, s = 0, rel = 0.05, hold = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    if (s > 0) { g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * s), t + a + d); g.gain.setValueAtTime(Math.max(0.0001, vol * s), t + a + d + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + hold + rel); return t + a + d + hold + rel; }
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); return t + a + d;
  }
  osc(out, type, f, t, end, { detune = 0, slideTo = 0, vib = 0 } = {}) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), end);
    if (vib) { const l = this.ctx.createOscillator(); const lg = this.ctx.createGain(); l.frequency.value = vib; lg.gain.value = f * 0.03; l.connect(lg).connect(o.frequency); l.start(t); l.stop(end + 0.05); }
    o.connect(out); o.start(t); o.stop(end + 0.05); return o;
  }
  /** 노이즈 한 번: filter 'lowpass'|'highpass'|'bandpass', f→fTo 로 쓸어내림 */
  noise(out, t, dur, vol, { type = 'bandpass', f = 1400, fTo = 0, q = 0.8, a = 0.002 } = {}) {
    const s = this.ctx.createBufferSource(); s.buffer = this.nb;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, vol, a, dur);
    s.connect(fl).connect(g).connect(out);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }
  /** 음 하나 (악기 이름으로) */
  note(out, inst, n, t, dur, vol = 1) {
    const f = hz(n), c = this.ctx;
    const g = c.createGain(); g.connect(out);
    if (inst === 'bell') {           // 글로켄슈필 같은 맑은 종소리
      const end = this.env(g, t, 0.16 * vol, 0.004, 0.9);
      this.osc(g, 'sine', f, t, end); this.osc(g, 'sine', f * 2.01, t, t + 0.25); this.osc(g, 'triangle', f, t, end);
    } else if (inst === 'pluck') {   // 통통 튀는 기타
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(500, t + 0.3); fl.connect(g);
      const end = this.env(g, t, 0.13 * vol, 0.003, Math.min(0.5, dur + 0.15));
      this.osc(fl, 'square', f, t, end); this.osc(fl, 'triangle', f * 2, t, end);
    } else if (inst === 'saw') {     // 신스 리드
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(2600, t); fl.Q.value = 2; fl.connect(g);
      const end = this.env(g, t, 0.07 * vol, 0.01, 0.08, 0.7, 0.08, Math.max(0, dur - 0.09));
      this.osc(fl, 'sawtooth', f, t, end, { detune: -7, vib: 5.5 }); this.osc(fl, 'sawtooth', f, t, end, { detune: 7 });
    } else if (inst === 'round') {   // 둥근 베이스
      const end = this.env(g, t, 0.22 * vol, 0.005, Math.min(0.35, dur + 0.1));
      this.osc(g, 'triangle', f, t, end); this.osc(g, 'sine', f, t, end);
    } else if (inst === 'sawbass') { // 유로비트 베이스
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(250, t + 0.15); fl.connect(g);
      const end = this.env(g, t, 0.16 * vol, 0.004, 0.16);
      this.osc(fl, 'sawtooth', f, t, end);
    } else if (inst === 'stab' || inst === 'skank') { // 짧은 화음 (오프비트)
      const fl = c.createBiquadFilter(); fl.type = inst === 'skank' ? 'highpass' : 'lowpass'; fl.frequency.value = inst === 'skank' ? 500 : 1800; fl.connect(g);
      const end = this.env(g, t, 0.05 * vol, 0.003, 0.12);
      this.osc(fl, inst === 'skank' ? 'square' : 'triangle', f, t, end);
    } else if (inst === 'pad') {     // 길게 깔리는 화음
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1100; fl.connect(g);
      const end = this.env(g, t, 0.035 * vol, 0.15, 0.2, 0.8, 0.3, Math.max(0, dur - 0.35));
      this.osc(fl, 'sawtooth', f, t, end, { detune: -10 }); this.osc(fl, 'sawtooth', f, t, end, { detune: 10 });
    } else if (inst === 'brass') {   // 팡파르용 금관
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(700, t); fl.frequency.linearRampToValueAtTime(3200, t + 0.06); fl.frequency.linearRampToValueAtTime(1800, t + 0.25); fl.connect(g);
      const end = this.env(g, t, 0.12 * vol, 0.03, 0.1, 0.75, 0.25, Math.max(0, dur - 0.13));
      this.osc(fl, 'sawtooth', f, t, end, { detune: -6, vib: 5 }); this.osc(fl, 'sawtooth', f, t, end, { detune: 6 }); this.osc(fl, 'square', f / 2, t, end);
    }
  }
  kick(out, t, vol = 1) { const g = this.ctx.createGain(); g.connect(out); const end = this.env(g, t, 0.5 * vol, 0.002, 0.28); this.osc(g, 'sine', 150, t, end, { slideTo: 42 }); }
  snare(out, t, vol = 1) { this.noise(out, t, 0.14, 0.22 * vol, { type: 'highpass', f: 1500 }); const g = this.ctx.createGain(); g.connect(out); this.osc(g, 'triangle', 210, t, this.env(g, t, 0.12 * vol, 0.002, 0.08)); }
  hat(out, t, vol = 1) { this.noise(out, t, 0.045, 0.09 * vol, { type: 'highpass', f: 7500 }); }
  shaker(out, t, vol = 1) { this.noise(out, t, 0.06, 0.06 * vol, { type: 'bandpass', f: 5500, q: 1.5, a: 0.015 }); }
  jingle(out, t, vol = 1) { // 썰매 방울
    for (let i = 0; i < 3; i++) { this.noise(out, t + i * 0.012, 0.05, 0.05 * vol, { type: 'bandpass', f: 6500 + i * 900, q: 6 }); }
    const g = this.ctx.createGain(); g.connect(out); this.osc(g, 'sine', 2637 + Math.random() * 300, t, this.env(g, t, 0.025 * vol, 0.002, 0.12));
  }
  crash(out, t, vol = 1) { this.noise(out, t, 1.6, 0.18 * vol, { type: 'highpass', f: 5000, fTo: 3000 }); }
  /** 박수 소리 (dur초 동안, 점점 잦아듦) */
  applause(out, t, dur = 3, vol = 1) {
    const n = Math.round(dur * 55);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.pow(Math.random(), 1.4) * dur;
      const fade = 1 - (tt - t) / dur;
      this.noise(out, tt, 0.02 + Math.random() * 0.03, (0.05 + Math.random() * 0.08) * vol * (0.3 + 0.7 * fade), { type: 'bandpass', f: 900 + Math.random() * 1800, q: 1.2 });
    }
  }
}

/** 배경음악 재생기: 앞으로 0.25초 분량을 계속 미리 예약 */
export class MusicPlayer {
  constructor(synth, out, song, isMuted) {
    this.s = synth; this.ctx = synth.ctx; this.song = song; this.isMuted = isMuted;
    this.gain = this.ctx.createGain(); this.gain.connect(out);
    const now = this.ctx.currentTime;
    this.gain.gain.setValueAtTime(0.0001, now); this.gain.gain.exponentialRampToValueAtTime(1, now + 1.2);
    this.step = 0; this.next = now + 0.1;
    this.total = song.bars.length * 16 * 4; // 구성: 테마 → 테마+아르페지오 → 브레이크 → 테마
    this.chords = song.chords.map(chord);
    this.timer = setInterval(() => this.schedule(), 40);
    this.schedule();
  }
  stop(fade = 0.6) {
    clearInterval(this.timer);
    const now = this.ctx.currentTime, g = this.gain;
    g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now); g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    setTimeout(() => g.disconnect(), fade * 1000 + 600);
  }
  schedule() {
    const spb = 60 / this.song.bpm / 4;
    const now = this.ctx.currentTime;
    if (this.next < now - 0.1) this.next = now + 0.05; // 탭이 잠깐 멈췄다 돌아오면 밀린 음은 건너뜀
    while (this.next < now + 0.25) {
      const t = this.next + (this.step % 2 ? this.song.swing * spb : 0);
      if (!this.isMuted()) this.play(this.step, t, spb);
      this.next += spb;
      this.step = (this.step + 1) % this.total;
    }
  }
  play(step, t, spb) {
    const S = this.song, s = this.s, out = this.gain;
    const nb = S.bars.length;
    const sec = Math.floor(step / (nb * 16));            // 0 테마, 1 테마+아르페지오, 2 브레이크, 3 테마
    const bar = Math.floor(step / 16) % nb, i = step % 16;
    const ch = this.chords[bar];
    // 멜로디 (브레이크 구간에서는 쉼)
    if (sec !== 2) for (const n of S.bars[bar]) if (n.step === i) s.note(out, S.lead, n.note, t, n.len * spb * 0.95);
    // 아르페지오 (화음음을 16분음표로 오르내림)
    if (sec === 1 || sec === 2) {
      const ARP = [0, 1, 2, 3, 2, 1];
      const k = ARP[i % ARP.length], tn = ch.tones[k % 3] + 12 * Math.floor(k / 3);
      if (sec === 2 || i % 2 === 0) s.note(out, S.lead === 'saw' ? 'pluck' : 'bell', ch.root + 24 + tn, t, spb * 0.9, sec === 2 ? 0.55 : 0.35);
    }
    // 베이스
    const b = S.bassPat[i];
    if (b && b !== '.') s.note(out, S.bass === 'saw' ? 'sawbass' : 'round', ch.root - 12 + (b === '5' ? 7 : b === '8' ? 12 : 0), t, spb * 1.6);
    // 화음
    if (S.padPat[i] === 'x') {
      let len = 1; while (S.padPat[i + len] === '-') len++;
      for (const tn of ch.tones.slice(0, 3)) s.note(out, S.pad, ch.root + 12 + tn, t, len * spb, S.pad === 'pad' ? 1 : 0.9);
    }
    // 드럼
    const D = S.drums;
    if (D.k?.[i] === 'x' && !(sec === 2 && bar < 4 && i % 8)) s.kick(out, t);
    if (D.s?.[i] === 'x') s.snare(out, t);
    if (D.h?.[i] === 'x' || (sec === 3 && i % 2 === 0)) s.hat(out, t, D.h?.[i] === 'x' ? 1 : 0.5);
    if (D.sh?.[i] === 'x') s.shaker(out, t, i % 4 === 2 ? 1.2 : 0.7);
    if (D.j?.[i] === 'x') s.jingle(out, t, i % 4 === 0 ? 1.1 : 0.7);
    // 8마디마다 마지막 박에 필인
    if (bar === nb - 1 && i >= 12 && D.s) s.snare(out, t, 0.5 + (i - 12) * 0.12);
  }
}
