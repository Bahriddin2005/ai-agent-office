#!/usr/bin/env node
// Real test of the office's team agents with the Claude Code CLI.
// Every member of every team gets its team's test task (in Uzbek), runs
// with its own instructions as the system prompt and no tools, and is timed.
// A separate judge call scores each answer 1-10. Results go to
// public/data/benchmarks.json and drive the "fastest" / "best" badges.
//
//   npm run benchmark                    # all teams
//   npm run benchmark -- --team coder    # one team
//   options: --concurrency 4  --judge-model sonnet
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dataDir = join(root, 'public', 'data');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const onlyTeam = opt('team');
const concurrency = Number(opt('concurrency', 4));
const judgeModel = opt('judge-model', 'sonnet');

const registry = JSON.parse(readFileSync(join(dataDir, 'registry.json'), 'utf8'));
const { teams } = JSON.parse(readFileSync(join(dataDir, 'teams.json'), 'utf8'));
const prompts = JSON.parse(readFileSync(join(dataDir, 'prompts.json'), 'utf8'));
const byId = new Map(registry.items.map((i) => [i.id, i]));
const outPath = join(dataDir, 'benchmarks.json');
// Run in an empty folder so no project CLAUDE.md leaks into the agents' context.
const neutralDir = join(tmpdir(), 'ai-agent-office-bench');
mkdirSync(neutralDir, { recursive: true });
const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { results: [] };

export function personaPrompt(item, body) {
  return [
    `You are "${item.name}", an AI agent working in the AI Agent Office.`,
    `Your role: ${item.description}`,
    '',
    body,
    '',
    'Rules for this reply: answer in the language the user writes in (Uzbek if the message is in Uzbek, using Latin script).',
    'Be concrete and useful. Keep it under about 250 words. You have no tools; answer from your own knowledge and say when something is an estimate.',
  ].join('\n');
}

function claude(prompt, { system, model, timeoutMs = 240_000 }) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const a = ['-p', prompt, '--system-prompt', system, '--tools', '', '--no-session-persistence', '--output-format', 'json'];
    if (model) a.push('--model', model);
    const p = spawn('claude', a, { stdio: ['ignore', 'pipe', 'pipe'], cwd: neutralDir });
    let out = '';
    let err = '';
    const timer = setTimeout(() => p.kill('SIGTERM'), timeoutMs);
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (err += c));
    p.on('close', (code) => {
      clearTimeout(timer);
      const seconds = (Date.now() - started) / 1000;
      try {
        const j = JSON.parse(out);
        resolveRun({ ok: !j.is_error && code === 0, text: j.result || '', seconds, cost: j.total_cost_usd, model: Object.keys(j.modelUsage || {})[0] });
      } catch {
        resolveRun({ ok: false, text: err.slice(-400) || out.slice(-400), seconds });
      }
    });
  });
}

const modelOf = (item) => (['haiku', 'sonnet', 'opus'].includes(item.model) ? item.model : 'sonnet');

async function judge(task, answer) {
  const system = 'You grade answers from AI agents. Reply with ONLY a JSON object: {"score": <integer 1-10>, "verdict": "<one short sentence in Uzbek (Latin script)>"}.';
  const prompt = [
    'Task given to the agent (in Uzbek):',
    task,
    '',
    'Agent answer:',
    answer.slice(0, 6000),
    '',
    'Score 1-10 for: does it do exactly what was asked, is it correct, concrete and actionable, is it in Uzbek, is it clear and not padded. 9-10 only for excellent answers.',
  ].join('\n');
  const r = await claude(prompt, { system, model: judgeModel });
  const m = /\{[\s\S]*\}/.exec(r.text);
  try {
    const j = JSON.parse(m[0]);
    return { score: Math.max(1, Math.min(10, Number(j.score) || 0)), verdict: String(j.verdict || '') };
  } catch {
    return { score: null, verdict: 'judge failed' };
  }
}

const jobs = [];
for (const t of teams) {
  if (onlyTeam && t.id !== onlyTeam) continue;
  for (const m of t.members) jobs.push({ team: t, id: m.id });
}
console.log(`▶ ${jobs.length} agent runs, concurrency ${concurrency}`);

const results = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    const item = byId.get(job.id);
    const run = await claude(job.team.test, { system: personaPrompt(item, prompts[job.id] || ''), model: modelOf(item) });
    const grade = run.ok ? await judge(job.team.test, run.text) : { score: 0, verdict: 'xato: javob olinmadi' };
    const r = {
      team: job.team.id,
      agentId: job.id,
      model: run.model || modelOf(item),
      seconds: Math.round(run.seconds * 10) / 10,
      ok: run.ok,
      score: grade.score,
      verdict: grade.verdict,
      words: run.text.split(/\s+/).filter(Boolean).length,
      answer: run.text.slice(0, 1500),
      cost: run.cost,
    };
    results.push(r);
    console.log(`${r.ok ? '✓' : '✗'} ${job.team.id.padEnd(10)} ${item.name.padEnd(32)} ${String(r.seconds).padStart(6)}s  score ${r.score}  ${r.model}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const keep = previous.results.filter((r) => !results.some((n) => n.team === r.team && n.agentId === r.agentId));
const all = [...keep, ...results].sort((a, b) => a.team.localeCompare(b.team) || (b.score ?? 0) - (a.score ?? 0) || a.seconds - b.seconds);
writeFileSync(outPath, JSON.stringify({ ranAt: new Date().toISOString(), judgeModel, results: all }, null, 1));
console.log(`✓ ${results.length} results → public/data/benchmarks.json`);
