// 収集スクリプトと組み立てスクリプトが共通で使う部品。
// クラウド用: スキルは kusakari-document/.claude/skills/daily-report-cloud に置く前提。
// 日報フォルダは kusakari-document からの相対パス、集めるリポジトリはクローンされた場所を探して使う。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// スキルが <kusakari-document>/.claude/skills/daily-report-cloud にあるときの kusakari-document のフォルダ。
// config.json の outputDir と repos の path は、ここからの相対パスとして読む。
export const PROJECT_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
export const WORK_DIR = path.join(SKILL_DIR, 'work');
export const PUBLISH_DIR = path.join(SKILL_DIR, 'publish');
export const TEMPLATE_DIR = path.join(SKILL_DIR, 'template');

export function loadConfig() {
  const config = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.json'), 'utf8'));
  if (!/^\d{2}:\d{2}$/.test(config.boundary)) fail(`config.json の boundary は "03:00" の形で書いてください: ${config.boundary}`);
  if (!/^[+-]\d{2}:\d{2}$/.test(config.utcOffset)) fail(`config.json の utcOffset は "+09:00" の形で書いてください: ${config.utcOffset}`);
  // 日報フォルダ。相対パスなら kusakari-document からの位置。
  config.outputDir = path.resolve(PROJECT_ROOT, config.outputDir || '日報');
  return config;
}

function gitOut(cwd, args) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', timeout: 30000 });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

/** フォルダが git リポジトリで、origin が GitHub の owner/name を指していれば true。 */
function isRepoOf(dir, github) {
  if (!dir || !fs.existsSync(path.join(dir, '.git'))) return false;
  const url = gitOut(dir, ['remote', 'get-url', 'origin']) || '';
  return url.toLowerCase().replace(/\.git$/, '').endsWith(github.toLowerCase());
}

/**
 * 集めるリポジトリのクローンを探す。クラウドではクローンの置き場所が決まっていないので、次の順に探す。
 * 1. repos の path(kusakari-document からの相対パス)
 * 2. 環境変数 DAILY_REPORT_REPOS_DIR の下の <name>
 * 3. kusakari-document と同じ階層、いまのフォルダ、その1つ上の階層の <name>
 * 4. 上の階層の中の、origin が repos の github を指すフォルダ(名前が違っても見つける)
 * 見つからなければ null。
 */
export function findRepoPath(repo) {
  const bases = [...new Set([
    process.env.DAILY_REPORT_REPOS_DIR, path.resolve(PROJECT_ROOT, '..'), process.cwd(), path.resolve(process.cwd(), '..'),
  ].filter(Boolean).map((p) => path.resolve(p)))];
  const candidates = [];
  if (repo.path) candidates.push(path.resolve(PROJECT_ROOT, repo.path));
  for (const base of bases) candidates.push(path.join(base, repo.name));
  candidates.push(process.cwd());
  for (const dir of candidates) if (isRepoOf(dir, repo.github)) return dir;
  for (const base of bases) {
    let children = [];
    try { children = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(base, d.name)); } catch { /* 読めない */ }
    for (const dir of children) if (isRepoOf(dir, repo.github)) return dir;
  }
  return null;
}

/**
 * クラウドのクローンは、履歴が浅い(shallow)ことや、既定のブランチしか取っていないことがある。
 * その日のコミットとブランチを正しく数えるため、全部のブランチの全部の履歴を取る。失敗したら理由を返す。
 */
export function ensureFullHistory(repoPath, timeout = 300000) {
  const run = (args) => spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: repoPath, encoding: 'utf8', timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const refspec = '+refs/heads/*:refs/remotes/origin/*';
  const fetchSpecs = (gitOut(repoPath, ['config', '--get-all', 'remote.origin.fetch']) || '').split('\n');
  if (!fetchSpecs.includes(refspec)) run(['config', '--add', 'remote.origin.fetch', refspec]);
  const shallow = gitOut(repoPath, ['rev-parse', '--is-shallow-repository']) === 'true';
  const r = run(['fetch', '--prune', '--quiet', ...(shallow ? ['--unshallow'] : []), 'origin']);
  if (r.status !== 0) return (r.stderr || String(r.error || '')).trim().split('\n').pop() || 'git fetch に失敗';
  // origin/HEAD が無いと既定のブランチが分からないので、リモートから設定する(失敗しても origin/main とみなす)。
  if (!gitOut(repoPath, ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'])) run(['remote', 'set-head', 'origin', '--auto']);
  return null;
}

/** コミットする人の名前とメールが無いとき(クラウドの新しいクローン)だけ、このリポジトリに設定する。 */
export function ensureGitIdentity(repoPath) {
  if (!gitOut(repoPath, ['config', 'user.name'])) spawnSync('git', ['config', 'user.name', 'daily-report (cloud)'], { cwd: repoPath });
  if (!gitOut(repoPath, ['config', 'user.email'])) spawnSync('git', ['config', 'user.email', 'daily-report@users.noreply.github.com'], { cwd: repoPath });
}

export function fail(message) {
  console.error(`エラー: ${message}`);
  process.exit(1);
}

function toMinutes(hhmm) {
  const sign = hhmm.startsWith('-') ? -1 : 1;
  const [h, m] = hhmm.replace(/^[+-]/, '').split(':').map(Number);
  return sign * (h * 60 + m);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** エポックミリ秒を、設定の時差つきの文字列 (2026-11-12T03:00:00+09:00) にする。 */
export function formatLocal(ms, config) {
  const shifted = new Date(ms + toMinutes(config.utcOffset) * 60000);
  return shifted.toISOString().slice(0, 19) + config.utcOffset;
}

/**
 * 対象の1日を決める。
 * 1日は「その日付の区切り時刻」から24時間。区切りが03:00なら 11/12 03:00 〜 11/13 03:00 が 11/12。
 * 日付の指定が無ければ、すでに終わっている直近の1日(前日)にする。
 */
export function resolveDay(dateArg, config, nowMs = Date.now()) {
  const offsetMs = toMinutes(config.utcOffset) * 60000;
  const boundaryMs = toMinutes(config.boundary) * 60000;
  // いま属している日付(区切り時刻より前なら、まだ前の日付に属する)
  const logicalToday = new Date(nowMs + offsetMs - boundaryMs).toISOString().slice(0, 10);

  let date = dateArg;
  if (!date) {
    date = new Date(Date.parse(logicalToday + 'T00:00:00Z') - DAY_MS).toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z'))
      || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) {
    fail(`日付は 2026-11-12 の形で指定してください: ${date}`);
  }
  const startMs = Date.parse(date + 'T00:00:00Z') + boundaryMs - offsetMs;
  const endMs = startMs + DAY_MS;
  if (startMs > nowMs) fail(`${date} はまだ始まっていません(開始は ${formatLocal(startMs, config)})。`);
  return {
    date,
    startMs,
    endMs,
    start: formatLocal(startMs, config),
    end: formatLocal(endMs, config),
    provisional: endMs > nowMs,
  };
}

export function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 中身が変わったときだけ書く。書いたら true。 */
export function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return true;
}
