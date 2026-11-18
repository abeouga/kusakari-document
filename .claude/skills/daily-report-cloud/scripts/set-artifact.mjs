#!/usr/bin/env node
// 公開先のArtifactのURLを config.json に保存する。
// 使い方: node set-artifact.mjs <年> <URL>   例: node set-artifact.mjs 2026 https://claude.ai/code/artifact/xxxx
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, fail } from './lib.mjs';

const [year, url] = process.argv.slice(2);
if (!/^\d{4}$/.test(year || '') || !/^https:\/\/claude\.ai\//.test(url || '')) {
  fail('使い方: node set-artifact.mjs <年> <https://claude.ai/... のURL>');
}
const file = path.join(SKILL_DIR, 'config.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.artifacts = Object.assign({}, config.artifacts, { [year]: url });
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log(`${year}年の公開先を保存しました: ${url}`);
