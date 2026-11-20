// 문제 파일 파서 — 브라우저(교사 콘솔 '파일 직접 불러오기')와 Node(빌드 스크립트) 공용
// 지원 형식: .csv (엑셀), .txt (Q:/A:/X: 형식), .json

export function titleFromFilename(name) {
  return name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]*/, '').replace(/[_]+/g, ' ').trim() || name;
}

function parseCSVRows(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((s) => s.trim())).filter((r) => r.some((s) => s));
}

function makeQuestion(q, answer, wrongs, time, explain, img) {
  return {
    q: String(q ?? '').trim(),
    answer: String(answer ?? '').trim(),
    wrong: (wrongs || []).map((w) => String(w ?? '').trim()).filter(Boolean),
    time: Number(time) > 0 ? Math.min(60, Math.max(5, Number(time))) : null,
    explain: String(explain ?? '').trim(),
    img: String(img ?? '').trim(),
  };
}

function parseCSV(text) {
  const rows = parseCSVRows(text);
  if (!rows.length) return [];
  let col = { q: 0, a: 1, w: [2, 3, 4], t: 5, e: 6, i: 7 };
  const head = rows[0].map((h) => h.replace(/\s/g, ''));
  if (head.some((h) => /문제|question/i.test(h))) {
    rows.shift();
    const find = (re) => head.findIndex((h) => re.test(h));
    col = {
      q: find(/문제|question/i),
      a: find(/^정답|answer/i),
      w: head.map((h, i) => (/오답|wrong/i.test(h) ? i : -1)).filter((i) => i >= 0),
      t: find(/시간|time/i),
      e: find(/해설|풀이|explain/i),
      i: find(/그림|이미지|image|img/i),
    };
  }
  return rows.map((r) => makeQuestion(r[col.q], r[col.a], col.w.map((i) => r[i]), col.t >= 0 ? r[col.t] : null, col.e >= 0 ? r[col.e] : '', col.i >= 0 ? r[col.i] : ''));
}

function parseTXT(text) {
  const out = []; let cur = null; let title = null;
  const flush = () => { if (cur) out.push(makeQuestion(cur.q, cur.a, cur.w, cur.t, cur.e, cur.i)); cur = null; };
  text.split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s) return;
    const m = s.match(/^(#|Q|문제|A|정답|X|오답|T|시간|E|해설|I|그림)\s*[:：]?\s*(.*)$/i);
    if (!m) { if (cur && !cur.a) cur.q += '\n' + s; return; }
    const tag = m[1].toUpperCase(); const val = m[2];
    if (tag === '#') { if (!title) title = val; return; }
    if (tag === 'Q' || tag === '문제') { flush(); cur = { q: val, a: '', w: [], t: null, e: '', i: '' }; }
    else if (!cur) return;
    else if (tag === 'A' || tag === '정답') cur.a = val;
    else if (tag === 'X' || tag === '오답') cur.w.push(val);
    else if (tag === 'T' || tag === '시간') cur.t = parseFloat(val);
    else if (tag === 'E' || tag === '해설') cur.e = val;
    else if (tag === 'I' || tag === '그림') cur.i = val;
  });
  flush();
  return { title, questions: out };
}

function parseJSON(text) {
  const j = JSON.parse(text);
  const list = Array.isArray(j) ? j : j.questions || [];
  return {
    title: Array.isArray(j) ? null : j.title,
    questions: list.map((x) => makeQuestion(x.q ?? x.question ?? x.문제, x.answer ?? x.a ?? x.정답, x.wrong ?? x.wrongs ?? x.오답, x.time ?? x.시간, x.explain ?? x.해설, x.img ?? x.image ?? x.그림)),
  };
}

/** 파일 내용 → { title, questions, warnings } */
export function parseQuestionFile(filename, text) {
  text = text.replace(/^\uFEFF/, '');
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let title = null; let questions = [];
  if (ext === 'csv') questions = parseCSV(text);
  else if (ext === 'json') ({ title, questions } = parseJSON(text));
  else ({ title, questions } = parseTXT(text));
  const warnings = [];
  const valid = [];
  questions.forEach((q, i) => {
    if (!q.q || !q.answer) { warnings.push(`${i + 1}번: 문제나 정답이 비어 있어 건너뜀`); return; }
    if (!q.wrong.length) { warnings.push(`${i + 1}번: 오답이 하나도 없어 건너뜀 (오답 1~3개 필요)`); return; }
    if (q.wrong.length > 5) { warnings.push(`${i + 1}번: 오답은 5개까지만 사용 (코스가 최대 6개)`); q.wrong = q.wrong.slice(0, 5); }
    valid.push(q);
  });
  return { title: title || titleFromFilename(filename), questions: valid, warnings };
}
