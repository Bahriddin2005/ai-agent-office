// Tasks handed to agents from the office UI. With the office server running
// they are executed by the Claude Code CLI using the agent's own definition;
// without it they are simulated so the office still shows the whole flow.
import type { OfficeData } from './data';
import { currentLang, t } from './i18n';
import type { Connection, TaskEvent } from './live/connection';
import type { Actor, Cast } from './sim/actors';
import type { Director } from './sim/director';

export interface OfficeTask {
  id: string;
  agentId: string;
  agentName: string;
  prompt: string;
  status: 'queued' | 'running' | 'done' | 'error';
  mode: 'claude' | 'simulated';
  output: string;
  log: string[];
  startedAt: number;
  cost?: number;
}

export class TaskManager {
  readonly tasks: OfficeTask[] = [];
  private fns: (() => void)[] = [];
  private controllers = new Map<string, ReturnType<Director['beginTask']>>();

  constructor(
    readonly data: OfficeData,
    readonly cast: Cast,
    readonly director: Director,
    readonly conn: Connection,
  ) {
    conn.onTask((e) => this.onServer(e));
  }

  onChange(fn: () => void) {
    this.fns.push(fn);
  }
  private changed() {
    for (const fn of this.fns) fn();
  }

  async dispatch(prompt: string, agentId: string) {
    const actor = this.cast.byItem.get(agentId);
    const item = this.data.byId.get(agentId);
    if (!item || !actor) return;
    let id = `local-${Date.now().toString(36)}`;
    let mode: OfficeTask['mode'] = 'simulated';
    if (this.conn.status === 'live') {
      try {
        const res = await this.conn.dispatch(agentId, prompt);
        id = res.id;
        mode = res.mode;
      } catch (err) {
        this.director.log({ kind: 'system', icon: '⚠️', text: String((err as Error).message || err) });
      }
    }
    const task: OfficeTask = { id, agentId, agentName: item.name, prompt, status: 'running', mode, output: '', log: [], startedAt: Date.now() };
    this.tasks.unshift(task);
    this.controllers.set(id, this.director.beginTask(actor, prompt));
    this.director.log({ kind: 'task', icon: '📨', text: `${item.name} ← ${prompt.slice(0, 80)}`, actor, itemId: agentId });
    this.changed();
    if (id.startsWith('local-')) this.simulate(task, actor);
  }

  private onServer(e: TaskEvent) {
    const task = this.tasks.find((x) => x.id === e.id);
    if (!task) return;
    const ctl = this.controllers.get(e.id);
    if (e.phase === 'progress' || e.phase === 'tool') {
      if (e.text) {
        task.log.push(e.text);
        ctl?.progress(e.text);
      }
    } else if (e.phase === 'done' || e.phase === 'error') {
      task.status = e.phase;
      task.output = e.result || e.text || '';
      task.cost = e.cost;
      ctl?.finish(e.phase === 'done');
      this.controllers.delete(e.id);
      this.director.log({ kind: 'task', icon: e.phase === 'done' ? '✅' : '⚠️', text: `${task.agentName}: ${task.prompt.slice(0, 60)}`, itemId: task.agentId });
    }
    this.changed();
  }

  private simulate(task: OfficeTask, actor: Actor) {
    const skills = (this.data.neighbors.get(task.agentId) || [])
      .map((n) => this.data.byId.get(n.id))
      .filter((i) => i && i.type !== 'agent')
      .slice(0, 3)
      .map((i) => i!.name);
    const uz = currentLang() === 'uz';
    const steps = uz
      ? ['📘 Skillarni o‘qiyapti', '🔎 Vazifani tahlil qilyapti', '🧩 Reja tuzyapti', '✍️ Javob yozyapti']
      : ['📘 Reading skills', '🔎 Analysing the task', '🧩 Planning', '✍️ Writing the answer'];
    const ctl = this.controllers.get(task.id);
    steps.forEach((s, k) =>
      setTimeout(() => {
        task.log.push(s);
        ctl?.progress(s);
        this.changed();
      }, 2500 + k * 2600),
    );
    setTimeout(() => {
      const item = this.data.byId.get(task.agentId)!;
      const dept = this.data.dept.get(item.dept)!;
      task.status = 'done';
      task.output = [
        `**${item.name}** · ${uz ? dept.uz : dept.name} · _${t().simulated}_`,
        '',
        `> ${task.prompt}`,
        '',
        uz ? '### Reja' : '### Plan',
        `1. ${uz ? 'Rol' : 'Role'}: ${item.description.slice(0, 160)}`,
        ...(skills.length ? skills.map((s, k) => `${k + 2}. ${uz ? 'Skill' : 'Skill'}: \`${s}\``) : []),
        `${skills.length + 2}. ${uz ? 'Natijani tekshirish va hisobot' : 'Verify and report'}`,
        '',
        t().simulatedNote,
      ].join('\n');
      ctl?.finish(true);
      this.controllers.delete(task.id);
      this.director.log({ kind: 'task', icon: '✅', text: `${task.agentName}: ${task.prompt.slice(0, 60)}`, actor, itemId: task.agentId });
      this.changed();
    }, 2500 + steps.length * 2600 + 1500);
  }
}
