#!/usr/bin/env node
// コミットとプッシュのスクリプト: 日報フォルダ(config.json の outputDir)の変更だけをコミットし、プッシュする。
// 使い方: node commit.mjs <YYYY-MM-DD> [--trailer "Co-Authored-By: ..."] [--no-push] [--dir <日報フォルダ>]
//         node commit.mjs --message "<件名>" [--trailer "..."]   日報を作らずに、ひな形だけを直したとき
//
// 決まり:
// - コミットするのは日報フォルダの中と、このスキルの config.json だけ。同じリポジトリのほかのファイルは、変更があっても触らない。
// - いまのブランチにコミットし、同じ名前のリモートのブランチにプッシュする。強制プッシュ(--force)はしない。
// - プッシュが断られたとき(ほかの人の変更が先に入っている)は、作業ツリーがきれいなときだけ
//   git pull --rebase をして1回やり直す。きれいでないとき、ぶつかったときは、何もせずに知らせる。
// - 失敗してもコミットは手元に残る。結果は最後の1行にJSONで出す。
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, fail, ensureGitIdentity, SKILL_DIR } from './lib.mjs';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || null;
// --message は、日報を作らずにひな形だけを直したときの件名。指定したときは日付が要らない。
const customSubject = (option('--message') || '').trim();
if (!date && !customSubject) fail('使い方: node commit.mjs <YYYY-MM-DD> [--trailer "..."] [--no-push]  または  node commit.mjs --message "<件名>" [--trailer "..."]');
const config = loadConfig();
const gitConfig = { autoCommit: true, autoPush: true, ...(config.git || {}) };
const outputDir = path.resolve(option('--dir') || config.outputDir);
const trailer = option('--trailer');
const noPush = args.includes('--no-push') || !gitConfig.autoPush;

const result = { date, committed: false, pushed: false, commit: null, branch: null, message: null, note: null };
const finish = (note, code = 0) => {
  result.note = note;
  console.log(note);
  console.log('結果(次の1行はJSON):');
  console.log(JSON.stringify(result));
  process.exit(code);
};

if (!gitConfig.autoCommit) finish('config.json の git.autoCommit が false なので、コミットしていません。');

// 認証を聞かれて止まらないようにする(鍵のパスフレーズなどを聞かれたら、待たずに失敗させる)。
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes' };
function git(cwd, gitArgs, { allowFail = false, timeout = 120000 } = {}) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...gitArgs], { cwd, env, encoding: 'utf8', timeout });
  const out = { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
  if (!out.ok && !allowFail) finish(`git ${gitArgs.join(' ')} が失敗しました: ${out.stderr || out.stdout || r.error || ''}`, 1);
  return out;
}

const top = git(outputDir, ['rev-parse', '--show-toplevel'], { allowFail: true });
if (!top.ok) finish(`${outputDir} は git のリポジトリの中にありません。コミットしていません。`, 1);
const repo = path.resolve(top.stdout);
const rel = path.relative(repo, outputDir).split(path.sep).join('/') || '.';
// クラウド用: 年が変わって新しい Artifact を作ったとき、その URL は config.json に書かれる。
// 次の回のクラウドの実行でも使えるよう、スキルの config.json も一緒にコミットする(同じリポジトリの中にあるときだけ)。
const configRel = path.relative(repo, path.join(SKILL_DIR, 'config.json')).split(path.sep).join('/');
const paths = configRel.startsWith('..') || path.isAbsolute(configRel) ? [rel] : [rel, configRel];

const branch = git(repo, ['branch', '--show-current']).stdout;
if (!branch) finish('ブランチに乗っていない状態(detached HEAD)なので、コミットしていません。', 1);
result.branch = branch;
if (gitConfig.branch && gitConfig.branch !== branch) {
  finish(`いまのブランチは ${branch} です。config.json の git.branch は ${gitConfig.branch} なので、コミットしていません。`, 1);
}

// 日報フォルダの中だけを見る。
const changed = git(repo, ['status', '--porcelain', '--', ...paths]).stdout;
if (!changed) {
  // 前の回のプッシュが失敗していると、コミットが手元に残っている。勝手には送らず、数だけ知らせる。
  const ahead = git(repo, ['rev-list', '--count', '@{u}..HEAD'], { allowFail: true });
  const waiting = ahead.ok && Number(ahead.stdout) > 0 ? `まだプッシュしていないコミットが ${ahead.stdout} 個あります(git push で送れます)。` : '';
  finish(`日報フォルダに変更が無いので、コミットしていません。${waiting}`);
}

// その日の日報が前のコミットにあったかで、「追加」か「更新」かを決める。
let subject = customSubject;
if (!subject) {
  const existed = git(repo, ['cat-file', '-e', `HEAD:${rel}/json/${date}.json`], { allowFail: true }).ok;
  subject = `${date.replace(/-/g, '/')}の日報を${existed ? '更新' : '追加'}`;
}
const message = trailer ? `${subject}\n\n${trailer}` : subject;
result.message = subject;

git(repo, ['add', '--', ...paths]);
// クラウドの新しいクローンには、コミットする人の名前とメールが無いことがある。
ensureGitIdentity(repo);
// パスを付けてコミットするので、ほかのファイルが先にステージされていても、日報フォルダ(と config.json)の分だけが入る。
git(repo, ['commit', '-m', message, '--', ...paths]);
result.committed = true;
result.commit = git(repo, ['rev-parse', '--short', 'HEAD']).stdout;

if (noPush) finish(`コミットしました(${result.commit} ${subject})。プッシュはしていません。`);

const push = () => git(repo, ['push', 'origin', branch], { allowFail: true, timeout: 180000 });
let pushed = push();
if (!pushed.ok && /rejected|non-fast-forward|fetch first/i.test(pushed.stderr)) {
  // ほかの人の変更が先に入っている。作業ツリーがきれいなときだけ、取り込んでからやり直す。
  const dirty = git(repo, ['status', '--porcelain']).stdout;
  if (dirty) {
    finish(`コミットしました(${result.commit})。プッシュは断られました(リモートに新しい変更があります)。`
      + 'リポジトリにコミットしていない変更があるので、自動では取り込んでいません。git pull --rebase をしてから git push をしてください。', 1);
  }
  const pull = git(repo, ['pull', '--rebase', 'origin', branch], { allowFail: true, timeout: 180000 });
  if (!pull.ok) {
    git(repo, ['rebase', '--abort'], { allowFail: true });
    finish(`コミットしました(${result.commit})。リモートの変更を取り込めませんでした(ぶつかっています)。手で git pull をして直してから git push をしてください。`, 1);
  }
  result.commit = git(repo, ['rev-parse', '--short', 'HEAD']).stdout;
  pushed = push();
}
if (!pushed.ok) {
  finish(`コミットしました(${result.commit})。プッシュに失敗しました: ${pushed.stderr.split('\n').slice(-3).join(' / ')}`, 1);
}
result.pushed = true;
finish(`コミットしてプッシュしました(${result.commit} ${subject}、ブランチ ${branch})。`);
