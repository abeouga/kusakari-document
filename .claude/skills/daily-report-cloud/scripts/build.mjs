#!/usr/bin/env node
// 検査・組み立てスクリプト: Claudeが書いた work/<日付>.report.json を検査し、
// 問題が無ければ日報のファイル一式(ローカル用と公開用)を書き出す。
// 使い方: node build.mjs <YYYY-MM-DD>
// 検査で1つでも問題があれば、何も書かずに終わる。
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, resolveDay, formatLocal, readJsonIfExists, writeIfChanged, fail, WORK_DIR, PUBLISH_DIR, TEMPLATE_DIR } from './lib.mjs';

const config = loadConfig();
const date = process.argv[2];
if (!date) fail('使い方: node build.mjs <YYYY-MM-DD>');
const day = resolveDay(date, config);

const collected = readJsonIfExists(path.join(WORK_DIR, `${date}.json`));
if (!collected) fail(`${date} の収集結果がありません。先に collect.mjs ${date} を実行してください。`);
const reportFile = path.join(WORK_DIR, `${date}.report.json`);
let report;
try {
  report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
} catch (error) {
  fail(`${reportFile} を読めません。JSONとして正しいか確認してください。(${error.message})`);
}

// ---- IDから実体(リンク先・作者)を引く表 ----
const entities = new Map();
const mentioned = new Set(); // 本文やコミットメッセージに出てきた番号
const repoByPrefix = new Map();
for (const r of collected.repos) {
  repoByPrefix.set(r.prefix, r);
  for (const c of r.commits) {
    entities.set(c.id, { kind: 'commit', repo: r.name, author: c.author, title: c.subject, label: `コミット ${c.sha.slice(0, 7)}`, url: c.url });
    c.refs.forEach((n) => mentioned.add(n));
  }
  for (const i of r.issues) {
    entities.set(i.id, { kind: 'issue', repo: r.name, author: i.author, title: i.title, label: `issue #${i.number}`, url: i.url });
    i.refs.forEach((n) => mentioned.add(n));
  }
  for (const p of r.pulls) {
    entities.set(p.id, { kind: 'pr', repo: r.name, author: p.author, title: p.title, label: `PR #${p.number}`, url: p.url });
    p.refs.forEach((n) => mentioned.add(n));
  }
}
/** IDを実体にする。この日に動きが無くても、本文中に番号が出てきたissue・PRなら通す。 */
function resolve(id) {
  if (entities.has(id)) return entities.get(id);
  const m = /^([a-z0-9]+)-(issue|pr)-(\d+)$/.exec(id || '');
  if (m && repoByPrefix.has(m[1]) && mentioned.has(Number(m[3]))) {
    const r = repoByPrefix.get(m[1]);
    return {
      kind: m[2], repo: r.name, author: '', title: '',
      label: `${m[2] === 'pr' ? 'PR' : 'issue'} #${m[3]}`,
      url: `https://github.com/${r.github}/${m[2] === 'pr' ? 'pull' : 'issues'}/${m[3]}`,
    };
  }
  return null;
}

// ---- 検査 ----
const errors = [];
const notes = [];
const STATUSES = ['confirmed', 'proposed', 'in_progress', 'dropped'];
const isText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const seen = new Set();

function checkId(where, id, allowManual) {
  if (typeof id !== 'string') { errors.push(`${where}: id がありません。`); return; }
  if (seen.has(id)) errors.push(`${where}: id "${id}" が重複しています。1つのIDは1項目だけにしてください。`);
  seen.add(id);
  if (allowManual) {
    if (!/^manual-[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`${where}: 手入力の id は manual-英小文字と数字 の形にしてください: "${id}"`);
  } else if (!resolve(id)) {
    errors.push(`${where}: id "${id}" は収集結果にありません。digest に出てくるIDをそのまま使ってください。`);
  }
}
function checkRefs(where, refs) {
  if (refs === undefined) return;
  if (!Array.isArray(refs)) { errors.push(`${where}: refs は配列にしてください。`); return; }
  for (const ref of refs) if (!resolve(ref)) errors.push(`${where}: refs の "${ref}" は収集結果にありません。`);
}

if (report.date !== date) errors.push(`date が "${report.date}" です。"${date}" にしてください。`);
if (!Array.isArray(report.summary) || report.summary.length < 1 || report.summary.length > 3 || !report.summary.every((s) => isText(s, 200))) {
  errors.push('summary は1〜3個の文(各200字まで)の配列にしてください。');
}
for (const key of ['specs', 'changes']) {
  if (!Array.isArray(report[key])) { errors.push(`${key} は配列にしてください(無ければ空の配列)。`); report[key] = []; }
}
if ('mustRead' in report) errors.push('mustRead(今日読むべき差分)は廃止しました。report.json から消してください。');
report.specs.forEach((s, i) => {
  const where = `specs[${i}]`;
  checkId(where, s.id, false);
  if (!STATUSES.includes(s.status)) errors.push(`${where}: status は ${STATUSES.join(' / ')} のどれかにしてください。`);
  if (!isText(s.title, 80)) errors.push(`${where}: title は1〜80字にしてください。`);
  if (!isText(s.body, 600)) errors.push(`${where}: body は1〜600字にしてください。`);
  if (!isText(s.reason, 200)) errors.push(`${where}: reason(判定理由)は1〜200字にしてください。`);
  if (typeof s.needsCheck !== 'boolean') errors.push(`${where}: needsCheck は true か false にしてください。`);
  checkRefs(where, s.refs);
});
report.changes.forEach((c, i) => {
  const where = `changes[${i}]`;
  checkId(where, c.id, false);
  if (!isText(c.title, 80)) errors.push(`${where}: title は1〜80字にしてください。`);
  if (!isText(c.body, 600)) errors.push(`${where}: body は1〜600字にしてください。`);
  if (c.withSpec !== undefined && typeof c.withSpec !== 'boolean') errors.push(`${where}: withSpec は true か false にしてください。`);
  if (c.withSpec && !(c.refs || []).some((r) => /-issue-\d+$/.test(r))) {
    errors.push(`${where}: withSpec が true なら、決まった仕様のissueのIDを refs に入れてください。`);
  }
  checkRefs(where, c.refs);
});
// 仕様と変更をまとめたのに、同じissueが「確定した仕様」にも残っていないか
const mergedIssues = new Set(report.changes.filter((c) => c.withSpec).flatMap((c) => c.refs || []));
report.specs.forEach((s, i) => {
  if (s.status === 'confirmed' && mergedIssues.has(s.id)) {
    errors.push(`specs[${i}]: "${s.id}" は変更内容(withSpec)にまとめたので、specs から消してください。`);
  }
});

const manual = report.manual || { raw: '', items: [] };
if (typeof manual.raw !== 'string' || !Array.isArray(manual.items)) {
  errors.push('manual は { "raw": "文章", "items": [...] } の形にしてください(無ければ raw を空文字、items を空の配列)。');
} else {
  if (!manual.raw.trim() && manual.items.length) errors.push('manual.raw が空なのに manual.items があります。呼び出し時に書かれた文章だけを項目にしてください。');
  const before = collected.previous && collected.previous.manual && collected.previous.manual.raw;
  if (before && before.trim() && !manual.raw.includes(before.trim())) {
    errors.push('前の版の手入力(manual.raw)が消えています。前の文章をそのまま残し、新しい文章はその後ろに足してください。');
  }
  manual.items.forEach((m, i) => {
    const where = `manual.items[${i}]`;
    checkId(where, m.id, true);
    if (!isText(m.title, 80)) errors.push(`${where}: title は1〜80字にしてください。`);
    if (!isText(m.body, 600)) errors.push(`${where}: body は1〜600字にしてください。`);
  });
}
if (report.specs.length > 12) notes.push(`仕様の項目が ${report.specs.length} 個あります。5分で読める量(12個まで)にまとめられないか見直してください。`);
if (report.changes.length > 12) notes.push(`変更内容の項目が ${report.changes.length} 個あります。機能単位にまとめられないか見直してください。`);

if (errors.length) {
  console.error(`検査で ${errors.length} 件の問題が見つかりました。何も書き出していません。`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

// ---- 日報データを組み立てる ----
const titleOf = (e) => (e.title ? `${e.label} ${e.title.length > 40 ? e.title.slice(0, 40) + '…' : e.title}` : e.label);
function expand(item) {
  const own = resolve(item.id);
  const refEntities = (item.refs || []).filter((r) => r !== item.id).map(resolve);
  const authors = [...new Set([own, ...refEntities.filter((e) => e.kind !== 'issue')].map((e) => e.author).filter(Boolean))];
  const seenUrl = new Set();
  const links = [own, ...refEntities]
    .filter((e) => (seenUrl.has(e.url) ? false : seenUrl.add(e.url)))
    .map((e) => ({ kind: e.kind, label: titleOf(e), url: e.url }));
  return { repo: own.repo, authors, links };
}

const data = {
  schema: 1,
  date,
  window: { start: day.start, end: day.end },
  provisional: day.provisional,
  generatedAt: formatLocal(Date.now(), config),
  summary: report.summary,
  specs: report.specs.map((s) => ({ id: s.id, status: s.status, needsCheck: s.needsCheck, title: s.title, body: s.body, reason: s.reason, ...expand(s) })),
  changes: report.changes.map((c) => ({ id: c.id, withSpec: Boolean(c.withSpec), title: c.title, body: c.body, ...expand(c) })),
  manual: { raw: manual.raw, items: manual.items.map((m) => ({ id: m.id, title: m.title, body: m.body })) },
};

const outDir = config.outputDir;
const year = date.slice(0, 4);
const publishRoot = path.join(PUBLISH_DIR, year);
const changedLocal = [];
const changedPublish = [];
const writeLocal = (rel, content) => { if (writeIfChanged(path.join(outDir, rel), content)) changedLocal.push(rel); };
const writePublish = (rel, content) => { if (writeIfChanged(path.join(publishRoot, rel), content)) changedPublish.push(rel); };

// 1) 元データ(JSON)。ローカルだけに置く。作り直しのときの引き継ぎ元にもなる。
writeLocal(`json/${date}.json`, JSON.stringify(data, null, 1) + '\n');

// 2) その日のデータ。ブラウザが <script> で読めるようJavaScriptの形に包む。
const HEAD = '(window.NIPPO=window.NIPPO||{}).days=window.NIPPO.days||{};';
const dayJs = `${HEAD}window.NIPPO.days[${JSON.stringify(date)}]=${JSON.stringify(data)};\n`;
writeLocal(`data/${date}.js`, dayJs);
writePublish(`data/${date}.js`, dayJs);

// 3) 日付の一覧。JSONを全部読み直して作るので、いつも実際のファイルと合う。
const entries = fs.readdirSync(path.join(outDir, 'json'))
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(outDir, 'json', f), 'utf8')))
  .map((d) => ({
    date: d.date,
    provisional: d.provisional,
    summary: d.summary[0],
    counts: {
      // 実装と一緒に「変更内容」にまとめた仕様も、確定の数に入れる
      confirmed: d.specs.filter((s) => s.status === 'confirmed').length + d.changes.filter((c) => c.withSpec).length,
      proposed: d.specs.filter((s) => s.status === 'proposed').length,
      needsCheck: d.specs.filter((s) => s.needsCheck).length,
      changes: d.changes.length,
    },
    // 要確認の項目のID。ページは、コメントで「要確認を外す」とされた項目をこの中から数え、一覧の数を減らす。
    needsCheckIds: d.specs.filter((s) => s.needsCheck).map((s) => s.id),
  }))
  .sort((a, b) => b.date.localeCompare(a.date));
const indexJs = (list) => `${HEAD}window.NIPPO.index=${JSON.stringify(list)};\n`;
writeLocal('data/index.js', indexJs(entries));
writePublish('data/index.js', indexJs(entries.filter((e) => e.date.startsWith(year))));

// 4) ひな形。見た目と処理は毎日同じファイルを使う。
for (const name of ['app.css', 'app.js']) {
  const content = fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8');
  writeLocal(name, content);
  writePublish(name, content);
}
const page = fs.readFileSync(path.join(TEMPLATE_DIR, 'page.html'), 'utf8');
// 公開用: Artifactは公開時に <html> や <body> を自分で付けるので、中身だけを渡す。
writePublish('page.html', page.replace('{{TITLE}}', `Kusakari 日報 ${year}`));
// ローカル用: 同じ中身を、ブラウザで直接開けるよう <html> で包む。
const RESET = ':root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}';
writeLocal('index.html', `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>${RESET}</style>\n</head>\n<body>\n${page.replace('{{TITLE}}', 'Kusakari 日報')}\n</body>\n</html>\n`);

// ---- 結果 ----
for (const n of notes) console.log(`注意: ${n}`);
console.log(`検査OK。${date}${day.provisional ? '(暫定)' : ''}: 仕様 ${data.specs.length} / 変更 ${data.changes.length}(うち仕様と一緒 ${data.changes.filter((c) => c.withSpec).length}) / 手入力 ${data.manual.items.length}`);
console.log(`ローカル: ${path.join(outDir, 'index.html')}`);
console.log('公開の材料(次の1行はJSON):');
console.log(JSON.stringify({
  year,
  artifactUrl: (config.artifacts && config.artifacts[year]) || null,
  publishRoot,
  page: path.join(publishRoot, 'page.html'),
  changedFiles: changedPublish.filter((f) => f !== 'page.html'),
  pageChanged: changedPublish.includes('page.html'),
}));
