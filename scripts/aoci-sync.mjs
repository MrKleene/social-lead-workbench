#!/usr/bin/env node
// AOCI 索引核对入口。
//
// 语义条目只能由模型创作：MCP 的 aoci_maintain 签发候选批次，模型写 F/R/A/S 后由
// aoci_update_entry 提交。CLI 没有 maintain 子命令，所以这个脚本只做两件事：
// 报告当前债务，并给出下一步该在会话里调用哪个工具。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const candidates = [process.env.AOCI_BIN, 'aoci', path.join(homedir(), '.local', 'bin', 'aoci')].filter(Boolean);
const binary = candidates.find((candidate) => candidate === 'aoci' || existsSync(candidate));

if (!binary) {
    console.error('找不到 aoci 可执行文件：设置 AOCI_BIN 或把它装到 ~/.local/bin/aoci。');
    process.exit(2);
}

const result = spawnSync(binary, ['--repo', '.', 'check', '--json'], { encoding: 'utf8' });
if (result.error) {
    console.error(`aoci check 未能执行：${result.error.message}`);
    process.exit(2);
}

let report;
try {
    report = JSON.parse(result.stdout);
} catch {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 2);
}

const findings = Array.isArray(report.findings) ? report.findings : [];
if (report.ok && findings.length === 0) {
    console.log('AOCI 索引已对齐：没有待处理 finding。');
    process.exit(0);
}

const byCode = new Map();
for (const finding of findings) {
    const code = finding?.code ?? 'UNKNOWN';
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(finding?.target ?? '');
}

console.log(`AOCI 索引未对齐：${findings.length} 项 finding`);
for (const [code, targets] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${code}: ${targets.length}`);
    for (const target of targets.slice(0, 5)) console.log(`    - ${target}`);
    if (targets.length > 5) console.log(`    … 另有 ${targets.length - 5} 项`);
}

console.log('');
console.log('下一步在 Agent 会话里完成，CLI 不生成语义：');
console.log('  1. 调用 aoci_maintain 领取当前机器签发的候选批次');
console.log('  2. 逐项创作完整 Entry 后调用 aoci_update_entry 提交整批');
console.log('  3. 重复 1–2 直到 remaining 为 0，再跑 npm run aoci:check');
process.exit(1);
