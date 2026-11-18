#!/usr/bin/env node
// 取り込みのスクリプト: 日報フォルダ(config.json の outputDir)にリモートの新しい変更があれば、git pull で取り込む。
// 使い方: node sync.mjs [--dir <日報フォルダ>]
//
// 決まり:
// - 日報を作り始める前に実行する。前の版の手入力や日付の一覧を、最新のファイルから作るため。
// - 取り込むのは、リモートの新しいコミットが日報フォルダの中を変えているときだけ。
// - 手元にプッシュしていないコミットが無ければ、git pull --ff-only で取り込む(コミットを作らない取り込み)。
//   あるときは、作業ツリーがきれいなときだけ git pull --rebase をする。
// - 取り込めなかったときは、何も変えずに終了コード1で知らせる。
//   手元の変更を消したり退避したりする操作(reset、stash、checkout)はしない。
// - 結果は最後の1行にJSONで出す。
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, ensureFullHistory } from './lib.mjs';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const config = loadConfig();
const gitConfig = { autoPull: true, ...(config.git || {}) };
const outputDir = path.resolve(option('--dir') || config.outputDir);

const result = { checked: false, pulled: false, commits: 0, dates: [], branch: null, note: null };
const finish = (note, code = 0) => {
  result.note = note;
  console.log(note);
  console.log('結果(次の1行はJSON):');
  console.log(JSON.stringify(result));
  process.exit(code);
};

if (!gitConfig.autoPull) finish('config.json の git.autoPull が false なので、リモートの変更を確かめていません。');

// 認証を聞かれて止まらないようにする(鍵のパスフレーズなどを聞かれたら、待たずに失敗させる)。
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes' };
function git(cwd, gitArgs, { allowFail = false, timeout = 120000 } = {}) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...gitArgs], { cwd, env, encoding: 'utf8', timeout });
  const out = { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
  if (!out.ok && !allowFail) finish(`git ${gitArgs.join(' ')} が失敗しました: ${out.stderr || out.stdout || r.error || ''}`, 1);
  return out;
}
const tail = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean).slice(-3).join(' / ');

const top = git(outputDir, ['rev-parse', '--show-toplevel'], { allowFail: true });
if (!top.ok) finish(`${outputDir} は git のリポジトリの中にありません。リモートの変更を確かめていません。`, 1);
const repo = path.resolve(top.stdout);
const rel = path.relative(repo, outputDir).split(path.sep).join('/') || '.';

// クラウドのクローンは履歴が浅いことがあり、取り込み(git pull --rebase)が失敗しうるので、全部の履歴を取っておく。
const historyError = ensureFullHistory(repo);
if (historyError) finish(`リモートの変更を確かめられませんでした(git fetch に失敗): ${historyError}`, 1);

let branch = git(repo, ['branch', '--show-current']).stdout;
// クラウドの定期実行は、claude/ で始まるブランチや、ブランチに乗っていない状態で始まることがある。
// 日報は git.branch(main)に積むので、コミットしていない変更が無ければ、リモートの git.branch に切り替える。
if (gitConfig.branch && gitConfig.branch !== branch) {
  // 追跡していないファイル(スキルの work/ など)は切り替えで消えないので、数えない。
  const dirty = git(repo, ['status', '--porcelain', '--untracked-files=no']).stdout;
  if (dirty) {
    finish(`いまのブランチは ${branch || '(ブランチ無し)'} で、コミットしていない変更があるので、${gitConfig.branch} に切り替えていません。`, 1);
  }
  const switched = git(repo, ['checkout', '-B', gitConfig.branch, '--track', `origin/${gitConfig.branch}`], { allowFail: true });
  if (!switched.ok) finish(`${gitConfig.branch} に切り替えられませんでした: ${tail(switched.stderr)}`, 1);
  branch = gitConfig.branch;
}
if (!branch) finish('ブランチに乗っていない状態(detached HEAD)なので、リモートの変更を取り込めません。config.json の git.branch を設定してください。', 1);
result.branch = branch;

// リモートの今の状態を取ってくる(手元のファイルはまだ変えない)。
const fetched = git(repo, ['fetch', 'origin', branch], { allowFail: true, timeout: 180000 });
if (!fetched.ok) finish(`リモートの変更を確かめられませんでした(git fetch に失敗): ${tail(fetched.stderr)}`, 1);
result.checked = true;
const remote = `origin/${branch}`;

// リモートにだけあるコミットのうち、日報フォルダの中を変えているものを数える。
const behind = Number(git(repo, ['rev-list', '--count', `HEAD..${remote}`]).stdout);
const behindInDir = Number(git(repo, ['rev-list', '--count', `HEAD..${remote}`, '--', rel]).stdout);
if (behindInDir === 0) {
  const others = behind > 0 ? `(ほかのファイルを変えるコミットが ${behind} 個ありますが、日報フォルダの外なので取り込んでいません。)` : '';
  finish(`日報フォルダに、リモートの新しい変更はありません。取り込んでいません。${others}`);
}
result.commits = behindInDir;
// 取り込むと変わる日付(報告用)。
const files = git(repo, ['diff', '--name-only', `HEAD...${remote}`, '--', rel]).stdout.split('\n').filter(Boolean);
result.dates = [...new Set(files.map((f) => (/json\/(\d{4}-\d{2}-\d{2})\.json$/.exec(f) || [])[1]).filter(Boolean))].sort();
const what = `日報フォルダを変えるコミットが ${behindInDir} 個${result.dates.length ? `、日付は ${result.dates.join('、')}` : ''}`;

const ahead = Number(git(repo, ['rev-list', '--count', `${remote}..HEAD`]).stdout);
if (ahead === 0) {
  // 手元にだけあるコミットが無いので、リモートと同じ所まで進めるだけでよい。
  // コミットしていない変更が取り込むファイルと重なるときは、git が何も変えずに断る。
  const pull = git(repo, ['pull', '--ff-only', 'origin', branch], { allowFail: true, timeout: 180000 });
  if (!pull.ok) {
    finish(`リモートに新しい変更があります(${what})が、取り込めませんでした: ${tail(pull.stderr)}`
      + ' 手元のコミットしていない変更が、取り込むファイルと重なっている可能性があります。手元の変更をコミットするか元に戻してから、git pull をしてください。', 1);
  }
} else {
  // 手元にプッシュしていないコミットがある。作業ツリーがきれいなときだけ、リモートの変更の上に載せ直す。
  const dirty = git(repo, ['status', '--porcelain']).stdout;
  if (dirty) {
    finish(`リモートに新しい変更があります(${what})。手元にはプッシュしていないコミットが ${ahead} 個と、コミットしていない変更があるので、自動では取り込んでいません。`
      + '手元の変更をコミットするか元に戻してから、git pull --rebase をしてください。', 1);
  }
  const pull = git(repo, ['pull', '--rebase', 'origin', branch], { allowFail: true, timeout: 180000 });
  if (!pull.ok) {
    git(repo, ['rebase', '--abort'], { allowFail: true });
    finish(`リモートに新しい変更があります(${what})が、手元のプッシュしていないコミット ${ahead} 個とぶつかったので、取り込みをやめて元に戻しました。手で git pull をして直してください。`, 1);
  }
}
result.pulled = true;
finish(`リモートの変更を取り込みました(${what})。`);
