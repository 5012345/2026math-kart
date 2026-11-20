#!/usr/bin/env node
// questions/ 폴더의 문제 파일들을 읽어 public/data/question-sets.json 으로 묶습니다.
// firebase deploy 할 때 자동 실행되며(firebase.json의 predeploy), 로컬 서버(serve.mjs)는 요청 때마다 다시 읽습니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQuestionFile } from '../public/js/question-parser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QDIR = path.join(root, 'questions');
const OUT = path.join(root, 'public', 'data', 'question-sets.json');
const IMG_SRC = path.join(QDIR, 'images');          // 문제 그림 폴더
const IMG_OUT = path.join(root, 'public', 'data', 'qimg');

function decode(buf) {
  // 엑셀에서 저장한 CSV는 EUC-KR(CP949)인 경우가 많아 자동 판별
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('euc-kr').decode(buf); }
}

export function buildQuestionSets({ quiet = false } = {}) {
  const files = fs.existsSync(QDIR)
    ? fs.readdirSync(QDIR).filter((f) => /\.(csv|txt|json)$/i.test(f) && !f.startsWith('_') && !f.startsWith('.')).sort((a, b) => a.localeCompare(b, 'ko'))
    : [];
  const sets = [];
  for (const f of files) {
    const { title, questions, warnings } = parseQuestionFile(f, decode(fs.readFileSync(path.join(QDIR, f))));
    // 그림: questions/images/ 에 있는 파일을 public/data/qimg/ 로 복사
    questions.forEach((q, i) => {
      if (!q.img) return;
      const src = path.join(IMG_SRC, q.img);
      if (!fs.existsSync(src)) { warnings.push(`${i + 1}번: 그림 파일 '${q.img}'을 questions/images 폴더에서 찾을 수 없어요`); q.img = ''; return; }
      fs.mkdirSync(IMG_OUT, { recursive: true });
      const dst = path.join(IMG_OUT, q.img);
      if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(src).mtimeMs) fs.copyFileSync(src, dst);
      q.img = `data/qimg/${encodeURIComponent(q.img)}`;
    });
    if (!quiet) {
      console.log(`  ${questions.length ? '✔' : '✖'} ${f} → "${title}" (${questions.length}문제)`);
      warnings.forEach((w) => console.log(`      ⚠ ${w}`));
    }
    if (questions.length) sets.push({ id: f, title, questions });
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const json = JSON.stringify({ builtAt: new Date().toISOString(), sets }, null, 1);
  fs.writeFileSync(OUT, json);
  return json;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('📚 문제 폴더 읽는 중:', QDIR);
  buildQuestionSets();
  console.log('✅ 완료 →', path.relative(root, OUT));
}
