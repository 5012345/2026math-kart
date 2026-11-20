#!/usr/bin/env node
// 설치 없이 쓰는 로컬 서버:  node tools/serve.mjs   (기본 포트 5173)
// 문제 폴더(questions/)를 요청 때마다 다시 읽으므로 파일을 넣고 교사 콘솔에서 '새로고침'만 하면 반영됩니다.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuestionSets } from './build-questions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || process.argv[2] || 5173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/data/question-sets.json') {
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
    return res.end(buildQuestionSets({ quiet: true }));
  }
  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n🏁 수학 레이싱 로컬 서버 실행 중`);
  console.log(`   교사 콘솔: http://localhost:${PORT}/teacher.html`);
  Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal)
    .forEach((n) => console.log(`   같은 와이파이: http://${n.address}:${PORT}/teacher.html`));
  console.log(`   문제 폴더: ${path.resolve(root, '..', 'questions')}\n`);
});
