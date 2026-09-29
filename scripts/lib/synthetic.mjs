// Agents that the office adds on top of the upstream files. Hermes, Graphify
// and Claude-Office are products rather than folders of agent definitions, so
// each one gets a desk through a small, attributed agent file built from its
// own repo. Upstream READMEs are added as guides.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

function agent({ source, name, description, tools, skills = [], dept, body, path, repo, ref }) {
  const fm = [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    `tools: ${tools.join(', ')}`,
    ...(skills.length ? [`skills: [${skills.join(', ')}]`] : []),
    '---',
    '',
  ].join('\n');
  const raw = fm + body.trim() + '\n';
  return {
    id: `agent:${source}:${name}`,
    type: 'agent',
    name,
    source,
    dept,
    description,
    path,
    url: `https://github.com/${repo}/blob/${ref}/${path}`,
    tools,
    tags: ['office-resident'],
    skillRefs: skills,
    relatedRefs: [],
    body,
    raw,
  };
}

function guide({ source, name, title, description, path, repo, ref, raw, dept }) {
  return {
    id: `guide:${source}:${name}`, type: 'guide', name, title, source, dept, description, path,
    url: `https://github.com/${repo}/blob/${ref}/${path}`, tools: [], tags: [], skillRefs: [], relatedRefs: [], body: raw, raw,
  };
}

export function SYNTHETIC(sourcesDir, lock) {
  const ref = (id, fallback) => lock[id]?.commit || fallback;
  const out = [];

  const soul = read(join(sourcesDir, 'hermes', 'SOUL.md'));
  out.push(
    agent({
      source: 'hermes',
      name: 'hermes',
      dept: 'ai',
      repo: 'NousResearch/hermes-agent',
      ref: ref('hermes', 'main'),
      path: 'SOUL.md',
      description: 'Hermes Agent by Nous Research: a direct, self-improving generalist. Learns from each task, turns repeated work into reusable skills and keeps knowledge persistent across sessions.',
      tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'Skill'],
      body: `${soul.trim()}

## Learning loop (from the Hermes README)

- After a complex task, capture what worked as a reusable skill in \`.claude/skills/\`.
- Improve existing skills when you use them and notice a gap.
- Persist durable facts about the user and project so the next session starts smarter.

_Source: NousResearch/hermes-agent (MIT). Persona text is the upstream SOUL.md._`,
    }),
  );

  out.push(
    agent({
      source: 'graphify',
      name: 'graphify-librarian',
      dept: 'data',
      repo: 'Graphify-Labs/graphify',
      ref: ref('graphify', 'v8'),
      path: 'graphify/skill.md',
      description: 'Knowledge librarian. Maps a codebase, docs or this whole office library into a Graphify knowledge graph and answers questions by traversing it instead of grepping.',
      tools: ['Read', 'Bash', 'Grep', 'Glob', 'Skill'],
      skills: ['graphify'],
      body: `You are the office librarian. Every agent, skill and command in the office lives in one knowledge graph, and you keep it navigable.

## How you work

1. If \`graphify-out/\` exists, answer questions with the graphify skill's query / path / explain tools first.
2. Otherwise build the graph: run \`/graphify <path>\` (install with \`uv tool install graphifyy && graphify install\`).
3. For the office library itself, run \`/graphify library/\` to graph every agent, skill and command gathered from the six source repos.
4. Always say whether a connection was EXTRACTED (explicit in the source) or INFERRED.

_Source: Graphify-Labs/graphify (Apache-2.0)._`,
    }),
  );

  out.push(
    agent({
      source: 'claude-office',
      name: 'office-manager',
      dept: 'academy',
      repo: 'W17ant/Claude-Office',
      ref: ref('claude-office', 'main'),
      path: 'scripts/chat-ai-watcher.sh',
      description: 'Front-desk office manager. Reads an incoming request, picks the best specialist agent(s) from the office directory, hands the task over and reports back with a short, witty status.',
      tools: ['Read', 'Grep', 'Glob', 'Task'],
      body: `You run the front desk of the AI Agent Office (inspired by W17ant/Claude-Office's office manager persona).

## Routing

- Bugs, errors, crashes → a debugger or build-resolver agent
- PRs, code review, git → a code-reviewer agent for the language in question
- UI, CSS, design → frontend & design agents
- Tests, coverage, e2e → TDD / e2e agents
- Auth, security, tokens → security reviewers
- Deploys, Docker, CI → DevOps agents
- Anything business, marketing or product → the matching department

Delegate with the Task tool using the specialist's name as \`subagent_type\`. Keep your own replies short and friendly; let the specialists do the work.

_Source idea: W17ant/Claude-Office (MIT)._`,
    }),
  );

  const readmes = [
    ['claude-office', 'W17ant/Claude-Office', 'main', 'academy'],
    ['graphify', 'Graphify-Labs/graphify', 'v8', 'data'],
    ['hermes', 'NousResearch/hermes-agent', 'main', 'ai'],
    ['ecc', 'affaan-m/ECC', 'main', 'academy'],
    ['claude-skills', 'alirezarezvani/claude-skills', 'main', 'academy'],
    ['best-practice', 'shanraisshan/claude-code-best-practice', 'main', 'academy'],
  ];
  for (const [id, repo, branch, dept] of readmes) {
    const raw = read(join(sourcesDir, id, 'README.md'));
    if (!raw) continue;
    const title = /^#\s+(.+)$/m.exec(raw)?.[1]?.replace(/<[^>]+>/g, '').trim() || id;
    out.push(
      guide({
        source: id, name: `${id}-readme`, title: `${title} — README`, dept, repo, ref: ref(id, branch), path: 'README.md', raw,
        description: `Overview of ${repo}: what it contains and how to install and use it.`,
      }),
    );
  }
  return out;
}
