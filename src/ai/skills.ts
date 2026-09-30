// Skills the agents actually use. For every step of a crew the office picks
// the skills that fit the task best — the agent's own linked skills first,
// then the best matches in the whole library (Agent Reach for internet
// research, Graphify for knowledge graphs, ...) — and hands their
// instructions to the agent with the task. Use cases from the 500 AI Agents
// catalogue serve as examples when a whole product is planned.
import type { Item, OfficeData } from '../data';
import { tokenize } from '../router';

interface Doc {
  item: Item;
  tf: Map<string, number>;
}

/** Words nearly every agent project shares: they say nothing about the subject. */
const GENERIC = new Set(['ai', 'agent', 'agents', 'automation', 'automat', 'workflow', 'system', 'platform', 'app', 'application', 'tool', 'data', 'task', 'multi', 'assistant', 'bot', 'web', 'website', 'frontend', 'design', 'ui']);

/** Characters of one skill's instructions that go into a prompt. */
const SKILL_CHARS = 1800;

export class SkillBook {
  private skills: Doc[] = [];
  private cases: Doc[] = [];
  private idf = new Map<string, number>();
  private bodies: Promise<Record<string, string>> | null = null;

  constructor(private data: OfficeData) {
    const df = new Map<string, number>();
    for (const item of data.registry.items) {
      const useCase = item.type === 'guide' && (item.tags || []).includes('use-case');
      if (item.type !== 'skill' && !useCase) continue;
      const tf = new Map<string, number>();
      const add = (text: string | undefined, w: number) => {
        for (const tok of tokenize(text || '')) tf.set(tok, (tf.get(tok) || 0) + w);
      };
      add((item.title || item.name).replace(/[-_]/g, ' '), 3);
      add(item.description, 1);
      add((item.tags || []).join(' '), 1.5);
      for (const k of tf.keys()) df.set(k, (df.get(k) || 0) + 1);
      (useCase ? this.cases : this.skills).push({ item, tf });
    }
    const N = this.skills.length + this.cases.length;
    for (const [k, v] of df) this.idf.set(k, Math.log(1 + N / v));
  }

  private score(doc: Doc, q: string[]) {
    let s = 0;
    for (const tok of q) {
      const f = doc.tf.get(tok);
      if (f) s += Math.log(1 + f) * (this.idf.get(tok) || 0);
    }
    return s;
  }

  /**
   * The skills an agent should use for a step. `focus` is what this step does
   * ("Telegram bot", "Database") and counts double; `context` is the user's
   * whole request. Relevant skills the agent is linked to (or its team works
   * with) rank above equally relevant strangers.
   */
  pick(agentId: string, focus: string, context: string, n = 3, preferred: string[] = []): Item[] {
    const qf = [...new Set(tokenize(focus))];
    const qc = [...new Set(tokenize(context))].filter((t) => !qf.includes(t));
    if (!qf.length && !qc.length) return [];
    const own = new Set((this.data.neighbors.get(agentId) || []).filter((l) => l.out).map((l) => l.id));
    const team = new Set(preferred);
    const scored = this.skills
      .map((d) => {
        const base = 2 * this.score(d, qf) + this.score(d, qc);
        const boost = own.has(d.item.id) ? 1.8 : team.has(d.item.id) ? 1.4 : 1;
        return { item: d.item, s: base * boost };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    const top = scored[0]?.s || 0;
    // Only skills that are really about the task: a clear share of the best match.
    return scored.filter((x) => x.s >= Math.max(2.5, top * 0.45)).slice(0, n).map((x) => x.item);
  }

  /** Real agent projects similar to what the user wants (examples for planning). */
  useCases(text: string, n = 5): Item[] {
    const q = [...new Set(tokenize(text))];
    if (!q.length) return [];
    // Match on the subject (school, travel, hospital…), not on words every agent project shares.
    const topic = q.filter((t) => !GENERIC.has(t));
    return this.cases
      .map((d) => ({ item: d.item, s: this.score(d, topic) }))
      .filter((x) => x.s > 3)
      .sort((a, b) => b.s - a.s)
      .slice(0, n)
      .map((x) => x.item);
  }

  /** A skill's own instructions (loaded once, on first use). */
  async text(id: string): Promise<string> {
    this.bodies ||= fetch('data/skills.json')
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
      .catch(() => ({}));
    const body = (await this.bodies)[id] || '';
    return body.length > SKILL_CHARS ? `${body.slice(0, SKILL_CHARS)}\n…` : body;
  }

  /** The block added to an agent's instructions. */
  async block(skills: Item[]): Promise<string> {
    if (!skills.length) return '';
    const parts = await Promise.all(skills.map(async (s) => `### Skill: ${s.name}\n${(await this.text(s.id)) || s.description}`));
    return [
      'SKILLS FOR THIS TASK — the office library gave you these skills. Use them: follow their steps and rules where they apply, and name the skill when it shaped your answer. Ignore any part that needs tools you do not have.',
      ...parts,
    ].join('\n\n');
  }
}
