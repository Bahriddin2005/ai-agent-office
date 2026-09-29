// Everything drawn in HTML over the 3D canvas: top bar, directory, inspector,
// activity feed, task bar + task list, graph-view controls and modals.
import type { Item, ItemType, OfficeData } from '../data';
import { displayName } from '../data';
import { t, toggleLang } from '../i18n';
import type { Connection, Status } from '../live/connection';
import type { Router } from '../router';
import type { Actor, Cast } from '../sim/actors';
import type { Director, FeedEntry } from '../sim/director';
import type { TaskManager } from '../tasks';
import type { GraphView } from './graphView';
import { renderMarkdown } from './markdown';

export interface HudApi {
  selectItem(id: string, fly?: boolean): void;
  selectActor(a: Actor | null): void;
  focusDept(id: string): void;
  focusActor(a: Actor): void;
  toggleGraph(): void;
  isGraph(): boolean;
  toggleNight(): boolean;
  isNight(): boolean;
  overview(): void;
  setFollow(on: boolean): void;
}

type Tab = ItemType | 'dept' | 'source';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string | null | undefined | false)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v as Record<string, string>)) el.style.setProperty(sk.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), sv);
    else if (k === 'className') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'value') (el as HTMLInputElement).value = String(v);
    else if (k === 'checked' || k === 'selected' || k === 'open' || k === 'hidden') (el as unknown as Record<string, boolean>)[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

const compact = (xs: (Node | null | undefined | false)[]) => xs.filter((x): x is Node => !!x);

const TYPE_ICON: Record<string, string> = { agent: '🧑‍💻', skill: '📘', command: '⌨️', guide: '📜', dept: '🏢', source: '📦' };

export class Hud {
  private root = document.getElementById('hud')!;
  private tab: Tab = 'agent';
  private query = '';
  private deptFilter = '';
  private sourceFilter = '';
  private selected: Item | null = null;
  private selectedActor: Actor | null = null;
  private pinnedAgent: Item | null = null;
  private feed: FeedEntry[] = [];
  private liveOnly = false;
  private following = false;
  private graphSearch = '';
  private hiredIds = new Set<string>();
  private el: Record<string, HTMLElement> = {};

  constructor(
    readonly data: OfficeData,
    readonly cast: Cast,
    readonly director: Director,
    readonly router: Router,
    readonly conn: Connection,
    readonly tasks: TaskManager,
    readonly graph: GraphView,
    readonly api: HudApi,
  ) {
    director.onFeed((e) => {
      this.feed.unshift(e);
      if (this.feed.length > 150) this.feed.length = 150;
      this.renderFeedSoon();
    });
    conn.onStatus((s) => this.renderStatus(s));
    tasks.onChange(() => this.renderTasks());
    this.build();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        (this.el.search as HTMLInputElement).focus();
      }
    });
  }

  // ------------------------------------------------------------- layout ---
  build() {
    this.root.textContent = '';
    const s = t();
    const c = this.data.registry.counts;
    this.el.status = h('button', { className: 'mode-badge', title: '' });
    this.el.nightBtn = h('button', { className: 'tb-btn', onclick: () => { this.api.toggleNight(); this.renderTopButtons(); } });
    this.el.graphBtn = h('button', { className: 'tb-btn', onclick: () => this.api.toggleGraph() });
    this.el.ambientBtn = h('button', { className: 'tb-btn', onclick: () => { this.director.ambient = !this.director.ambient; this.renderTopButtons(); } });
    const top = h(
      'header',
      { className: 'topbar' },
      h('div', { className: 'brand' }, h('span', { className: 'brand-logo' }, '🏢'), h('div', {}, h('b', {}, s.title), h('small', {}, s.subtitle))),
      h(
        'div',
        { className: 'stats' },
        ...(['agent', 'skill', 'command', 'guide'] as ItemType[]).map((k) =>
          h('button', { className: 'stat', onclick: () => { this.tab = k; this.showPanel('dir'); this.renderDirectory(); } }, h('b', {}, String(c[k] || 0)), ' ', { agent: s.agents, skill: s.skills, command: s.commands, guide: s.guides }[k]),
        ),
        h('button', { className: 'stat', onclick: () => { this.tab = 'source'; this.showPanel('dir'); this.renderDirectory(); } }, h('b', {}, String(this.data.registry.sources.length)), ' ', s.sources),
      ),
      h(
        'div',
        { className: 'tb-actions' },
        this.el.status,
        this.el.graphBtn,
        this.el.nightBtn,
        this.el.ambientBtn,
        h('button', { className: 'tb-btn', title: s.zoomOut, onclick: () => this.api.overview() }, '🎯'),
        h('button', { className: 'tb-btn', onclick: () => { toggleLang(); this.build(); } }, s.lang),
        h('button', { className: 'tb-btn', title: s.help, onclick: () => this.help() }, '❓'),
        h('button', { className: 'tb-btn mobile-only', onclick: () => this.togglePanel('dir') }, '📚'),
        h('button', { className: 'tb-btn mobile-only', onclick: () => this.togglePanel('feed') }, '📰'),
      ),
    );

    // Directory
    this.el.search = h('input', {
      className: 'search', type: 'search', placeholder: s.search, value: this.query,
      oninput: (e: Event) => { this.query = (e.target as HTMLInputElement).value; this.renderDirectory(); if (this.api.isGraph()) { this.graphSearch = this.query; this.graph.refresh(this.query); } },
    });
    this.el.tabs = h('div', { className: 'tabs' });
    this.el.filters = h('div', { className: 'filters' });
    this.el.list = h('div', { className: 'list' });
    const dir = h('aside', { className: 'panel dir', id: 'panel-dir' }, this.el.search, this.el.tabs, this.el.filters, this.el.list);

    // Inspector
    this.el.inspector = h('aside', { className: 'panel inspector', id: 'panel-inspector', hidden: true });

    // Feed + tasks
    this.el.feedList = h('div', { className: 'feed-list' });
    this.el.tasksList = h('div', { className: 'tasks-list' });
    this.el.feedTab = h('button', { className: 'ft-tab active', onclick: () => this.feedTab('feed') }, `📰 ${s.feed}`);
    this.el.tasksTab = h('button', { className: 'ft-tab', onclick: () => this.feedTab('tasks') }, `📨 ${s.tasks}`);
    const liveToggle = h('label', { className: 'live-only' }, h('input', { type: 'checkbox', checked: this.liveOnly, onchange: (e: Event) => { this.liveOnly = (e.target as HTMLInputElement).checked; this.renderFeed(); } }), ' LIVE');
    const feed = h('section', { className: 'panel feed', id: 'panel-feed' }, h('div', { className: 'ft-head' }, this.el.feedTab, this.el.tasksTab, liveToggle), this.el.feedList, this.el.tasksList);
    this.el.tasksList.hidden = true;

    // Task bar
    this.el.taskInput = h('input', {
      className: 'task-input', placeholder: s.taskPlaceholder,
      oninput: () => this.renderRoutes(),
      onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') this.send(); },
    });
    this.el.routes = h('div', { className: 'routes' });
    const taskbar = h(
      'section',
      { className: 'taskbar', id: 'taskbar' },
      h('div', { className: 'task-row' }, h('span', { className: 'task-icon' }, '⚡'), this.el.taskInput, h('button', { className: 'send', onclick: () => this.send() }, s.send)),
      this.el.routes,
    );

    // Graph controls
    this.el.graphPanel = h('aside', { className: 'panel graph-panel', hidden: true });

    this.el.modal = h('div', { className: 'modal', hidden: true, onclick: (e: Event) => { if (e.target === this.el.modal) this.closeModal(); } });
    this.el.toast = h('div', { className: 'toast', hidden: true });

    this.root.append(top, dir, this.el.inspector, feed, taskbar, this.el.graphPanel, this.el.modal, this.el.toast);
    this.renderStatus(this.conn.status);
    this.renderTopButtons();
    this.renderDirectory();
    this.renderFeed();
    this.renderTasks();
    this.renderRoutes();
    if (this.selected) this.inspect(this.selected, this.selectedActor);
    if (this.api.isGraph()) this.setGraphMode(true);
  }

  private showPanel(which: 'dir' | 'feed') {
    document.getElementById(`panel-${which}`)?.classList.add('open');
  }
  private togglePanel(which: 'dir' | 'feed') {
    const el = document.getElementById(`panel-${which}`);
    el?.classList.toggle('open');
  }

  private renderStatus(st: Status) {
    const s = t();
    const b = this.el.status;
    if (!b) return;
    b.className = `mode-badge ${st}`;
    b.textContent = st === 'live' ? `● ${s.live}` : st === 'connecting' ? '… ' : `◌ ${s.sim}`;
    const claude = this.conn.health ? (this.conn.health.claude ? ' · Claude CLI ✓' : ' · Claude CLI ✗') : '';
    b.title = (st === 'live' ? s.liveHint : s.simHint) + claude;
    b.onclick = () => this.toast(b.title, 6000);
  }

  renderTopButtons() {
    const s = t();
    this.el.nightBtn.textContent = this.api.isNight() ? '☀️' : '🌙';
    this.el.nightBtn.title = this.api.isNight() ? s.day : s.night;
    this.el.graphBtn.replaceChildren(this.api.isGraph() ? '🏢' : '🕸️', h('span', { className: 'lbl' }, ` ${this.api.isGraph() ? s.office : s.graph}`));
    this.el.graphBtn.title = this.api.isGraph() ? s.office : s.graph;
    this.el.ambientBtn.textContent = this.director.ambient ? '🤖' : '⏸️';
    this.el.ambientBtn.title = s.ambient;
    this.el.ambientBtn.classList.toggle('off', !this.director.ambient);
  }

  // ---------------------------------------------------------- directory ---
  private filtered(): Item[] {
    const terms = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.data.registry.items.filter((i) => {
      if (this.tab !== 'dept' && this.tab !== 'source' && i.type !== this.tab) return false;
      if (this.deptFilter && i.dept !== this.deptFilter) return false;
      if (this.sourceFilter && i.source !== this.sourceFilter) return false;
      if (!terms.length) return true;
      const hay = `${i.name} ${i.title || ''} ${i.description} ${(i.tags || []).join(' ')}`.toLowerCase();
      return terms.every((w) => hay.includes(w));
    });
  }

  renderDirectory() {
    const s = t();
    const tabs: [Tab, string][] = [
      ['agent', `🧑‍💻 ${s.agents}`],
      ['skill', `📘 ${s.skills}`],
      ['command', `⌨️ ${s.commands}`],
      ['guide', `📜 ${s.guides}`],
      ['dept', `🏢 ${s.departments}`],
      ['source', `📦 ${s.sources}`],
    ];
    this.el.tabs.replaceChildren(
      ...tabs.map(([k, label]) => h('button', { className: `tab${this.tab === k ? ' active' : ''}`, onclick: () => { this.tab = k; this.renderDirectory(); } }, label)),
    );
    const deptSel = h(
      'select',
      { onchange: (e: Event) => { this.deptFilter = (e.target as HTMLSelectElement).value; this.renderDirectory(); } },
      h('option', { value: '' }, `${s.dept}: ${s.all}`),
      ...this.data.registry.departments.map((d) => h('option', { value: d.id, selected: d.id === this.deptFilter }, `${d.emoji} ${d.name}`)),
    );
    const srcSel = h(
      'select',
      { onchange: (e: Event) => { this.sourceFilter = (e.target as HTMLSelectElement).value; this.renderDirectory(); } },
      h('option', { value: '' }, `${s.source}: ${s.all}`),
      ...this.data.registry.sources.map((x) => h('option', { value: x.id, selected: x.id === this.sourceFilter }, x.short)),
    );
    this.el.filters.replaceChildren(deptSel, srcSel);
    this.el.filters.hidden = this.tab === 'dept' || this.tab === 'source';

    if (this.tab === 'dept') {
      this.el.list.replaceChildren(
        ...this.data.registry.departments.map((d) =>
          h(
            'button',
            { className: 'row', style: { '--dot': d.color }, onclick: () => { this.deptFilter = d.id; this.tab = 'agent'; this.api.focusDept(d.id); this.renderDirectory(); } },
            h('span', { className: 'dot' }),
            h('div', { className: 'row-main' }, h('b', {}, `${d.emoji} ${d.name}`), h('small', {}, `${d.uz} · ${d.counts.agent || 0} ${s.agents.toLowerCase()} · ${d.counts.skill || 0} ${s.skills.toLowerCase()} · ${d.counts.command || 0} ${s.commands.toLowerCase()}`)),
          ),
        ),
      );
      return;
    }
    if (this.tab === 'source') {
      this.el.list.replaceChildren(
        ...this.data.registry.sources.map((x) =>
          h(
            'div',
            { className: 'row source-row', style: { '--dot': x.color } },
            h('span', { className: 'dot' }),
            h(
              'div',
              { className: 'row-main' },
              h('b', {}, x.label),
              h('small', {}, x.role),
              h('small', {}, `${x.counts.agent || 0} ${s.agents.toLowerCase()} · ${x.counts.skill || 0} ${s.skills.toLowerCase()} · ${x.counts.command || 0} ${s.commands.toLowerCase()} · ${x.license}`),
              h(
                'div',
                { className: 'row-actions' },
                h('button', { className: 'chip', onclick: () => { this.sourceFilter = x.id; this.tab = 'agent'; this.renderDirectory(); } }, `🔎 ${s.all}`),
                h('a', { className: 'chip', href: `https://github.com/${x.repo}`, target: '_blank', rel: 'noopener noreferrer' }, `🔗 ${x.repo}`),
              ),
            ),
          ),
        ),
      );
      return;
    }
    const items = this.filtered();
    const LIMIT = 160;
    const rows: HTMLElement[] = items.slice(0, LIMIT).map((i) => this.itemRow(i));
    if (!items.length) rows.push(h('div', { className: 'empty' }, s.noResults));
    if (items.length > LIMIT) rows.push(h('div', { className: 'empty' }, `+${items.length - LIMIT} …`));
    this.el.list.replaceChildren(h('div', { className: 'count' }, `${items.length}`), ...rows);
  }

  private itemRow(i: Item) {
    const d = this.data.dept.get(i.dept)!;
    const src = this.data.source.get(i.source)!;
    const actor = this.cast.byItem.get(i.id);
    return h(
      'button',
      { className: `row${this.selected?.id === i.id ? ' active' : ''}`, style: { '--dot': d.color }, onclick: () => this.api.selectItem(i.id) },
      h('span', { className: 'dot' }),
      h(
        'div',
        { className: 'row-main' },
        h('b', {}, displayName(i), actor?.live ? h('span', { className: 'live-dot', title: 'live' }) : null),
        h('small', {}, i.description),
      ),
      h('span', { className: 'src', style: { '--src': src.color } }, src.short),
    );
  }

  // ---------------------------------------------------------- inspector ---
  inspect(item: Item | null, actor: Actor | null = null) {
    this.selected = item;
    this.selectedActor = actor;
    const box = this.el.inspector;
    const s = t();
    if (!item && !actor) {
      box.hidden = true;
      this.renderDirectory();
      return;
    }
    box.hidden = false;
    box.classList.add('open');
    if (!item && actor) {
      const title = actor.kind === 'lead' ? s.lead : actor.kind === 'boss' ? s.you : `${s.visitor}: ${actor.name}`;
      const desc =
        actor.kind === 'lead'
          ? 'Claude Code — the lead agent at reception. Live hook events (tools, skills, subagents) show up here.'
          : actor.kind === 'boss'
            ? 'You. Prompts you type into Claude Code appear as speech bubbles.'
            : 'A subagent type that has no desk in the office (for example general-purpose, Explore or Plan). It sits at a visitor desk while it works.';
      box.replaceChildren(
        ...compact([
          h('div', { className: 'insp-head' }, h('h2', {}, title), h('button', { className: 'x', onclick: () => this.api.selectActor(null) }, '✕')),
          h('p', { className: 'desc' }, desc),
          actor.liveTask ? h('p', { className: 'current' }, `⚡ ${actor.liveTask}`) : null,
        ]),
      );
      return;
    }
    const it = item!;
    const d = this.data.dept.get(it.dept)!;
    const src = this.data.source.get(it.source)!;
    const a = actor || this.cast.byItem.get(it.id) || null;
    const links = this.data.neighbors.get(it.id) || [];
    const groups: [string, typeof links][] = [
      [s.usesSkills, links.filter((l) => l.out && l.rel === 'uses_skill')],
      [s.delegates, links.filter((l) => l.out && (l.rel === 'delegates_to' || l.rel === 'invokes'))],
      [s.relatedTo, links.filter((l) => l.rel === 'related_to')],
      [s.usedBy, links.filter((l) => !l.out && l.rel !== 'related_to')],
    ];
    const statusLine = a ? h('p', { className: 'status' }) : null;
    this.el.statusLine = statusLine as HTMLElement;
    if (a) this.renderStatusLine(a);
    const hireCmd = `npm run hire -- ${it.id}`;
    box.replaceChildren(
      ...compact([
      h(
        'div',
        { className: 'insp-head' },
        h('div', {}, h('small', { className: 'type' }, `${TYPE_ICON[it.type]} ${it.type}`), h('h2', {}, displayName(it))),
        h('button', { className: 'x', onclick: () => this.api.selectItem('') }, '✕'),
      ),
      h(
        'div',
        { className: 'chips' },
        h('button', { className: 'chip', style: { '--c': d.color }, onclick: () => this.api.focusDept(d.id) }, `${d.emoji} ${d.name}`),
        h('span', { className: 'chip', style: { '--c': src.color } }, `📦 ${src.short}`),
        it.model ? h('span', { className: 'chip' }, `🧠 ${it.model}`) : null,
      ),
      h('p', { className: 'desc' }, it.description),
      statusLine,
      it.tools?.length ? h('div', { className: 'meta' }, h('small', {}, s.tools), h('div', { className: 'chips' }, ...it.tools.map((x) => h('span', { className: 'chip small' }, x)))) : null,
      it.tags?.length ? h('div', { className: 'meta' }, h('small', {}, s.tags), h('div', { className: 'chips' }, ...it.tags.map((x) => h('span', { className: 'chip small' }, `#${x}`)))) : null,
      h(
        'div',
        { className: 'actions' },
        h('button', { className: 'btn', onclick: () => (a ? this.api.focusActor(a) : this.api.selectItem(it.id, true)) }, `📍 ${s.focus}`),
        a && it.type === 'agent'
          ? h('button', { className: `btn${this.following ? ' on' : ''}`, onclick: () => { this.following = !this.following; this.api.setFollow(this.following); this.inspect(it, a); } }, `🎥 ${s.follow}`)
          : null,
        it.type === 'agent' ? h('button', { className: 'btn primary', onclick: () => this.pinAgent(it) }, `⚡ ${s.giveTask}`) : null,
        h('button', { className: 'btn', onclick: () => this.fullText(it) }, `📄 ${s.fullText}`),
        h('a', { className: 'btn', href: it.url, target: '_blank', rel: 'noopener noreferrer' }, `🔗 ${s.openSource}`),
        h('button', { className: `btn${this.hiredIds.has(it.id) ? ' on' : ''}`, onclick: () => this.hire(it) }, this.hiredIds.has(it.id) ? `✅ ${s.hired}` : `🧑‍💼 ${s.hire}`),
      ),
      h('div', { className: 'cli' }, h('small', {}, s.hireCli), h('code', {}, hireCmd)),
      ...groups
        .filter(([, list]) => list.length)
        .map(([label, list]) =>
          h(
            'div',
            { className: 'links' },
            h('small', {}, `${label} (${list.length})`),
            h(
              'div',
              { className: 'chips' },
              ...list.slice(0, 40).map((l) => {
                const o = this.data.byId.get(l.id)!;
                const od = this.data.dept.get(o.dept)!;
                return h('button', { className: `chip link${l.extracted ? '' : ' inferred'}`, style: { '--c': od.color }, title: `${l.rel} · ${l.extracted ? 'EXTRACTED' : 'INFERRED'}`, onclick: () => this.api.selectItem(o.id, true) }, `${TYPE_ICON[o.type]} ${o.name}`);
              }),
            ),
          ),
        ),
      ]),
    );
    this.renderDirectory();
  }

  private renderStatusLine(a: Actor) {
    const s = t();
    const el = this.el.statusLine;
    if (!el?.isConnected) return;
    el.className = `status ${a.live ? 'live' : a.activity}`;
    el.replaceChildren(
      `${s.status}: `,
      h('b', {}, a.live ? `LIVE · ${a.liveTask || ''}` : a.activity === 'idle' ? s.idle : `${s.working} (${a.activity})`),
      a.bubble ? h('span', {}, ` — ${a.bubble}`) : '',
    );
  }

  /** Cheap periodic refresh: only the live status line of the inspected agent. */
  refreshInspector() {
    const a = this.selectedActor || (this.selected && this.cast.byItem.get(this.selected.id));
    if (a) this.renderStatusLine(a);
  }

  private async hire(it: Item) {
    const s = t();
    if (this.conn.status !== 'live') {
      await navigator.clipboard?.writeText(`npm run hire -- ${it.id}`).catch(() => undefined);
      this.toast(`${s.hireCli} npm run hire -- ${it.id}  (📋)`, 6000);
      return;
    }
    try {
      const res = await this.conn.hire([it.id], 'project');
      this.hiredIds.add(it.id);
      this.toast(`✅ ${res.installed.length} → ${res.target}`, 5000);
      this.director.log({ kind: 'system', icon: '🧑‍💼', text: `${it.name} → ${res.target}`, itemId: it.id });
      this.inspect(it, this.selectedActor);
    } catch (err) {
      this.toast(`⚠️ ${(err as Error).message}`, 6000);
    }
  }

  private async fullText(it: Item) {
    const s = t();
    const body = h('div', { className: 'md' }, '…');
    this.openModal(h('div', { className: 'modal-card' }, h('div', { className: 'insp-head' }, h('h2', {}, displayName(it)), h('button', { className: 'x', onclick: () => this.closeModal() }, '✕')), body));
    const raw = it.url.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/');
    for (const url of [`library/${it.lib}`, raw]) {
      try {
        const res = await fetch(url);
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || ct.includes('text/html')) continue;
        body.innerHTML = renderMarkdown(await res.text());
        return;
      } catch {
        /* try next */
      }
    }
    body.replaceChildren(h('p', {}, `${s.error}. `, h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer' }, `🔗 ${s.openSource}`)));
  }

  // ------------------------------------------------------------- tasks ----
  private pinAgent(it: Item) {
    this.pinnedAgent = it;
    this.renderRoutes();
    (this.el.taskInput as HTMLInputElement).focus();
  }

  private currentRoutes() {
    const text = (this.el.taskInput as HTMLInputElement)?.value || '';
    return this.router.route(text, 3);
  }

  private chosen: string | null = null;

  renderRoutes() {
    const s = t();
    const routes = this.currentRoutes();
    const kids: Node[] = [h('small', {}, s.routeTo)];
    if (this.pinnedAgent) {
      kids.push(h('span', { className: 'chip route active' }, `📌 ${this.pinnedAgent.name}`, h('button', { className: 'x small', onclick: () => { this.pinnedAgent = null; this.renderRoutes(); } }, '✕')));
    } else if (routes.length) {
      if (!this.chosen || !routes.some((r) => r.item.id === this.chosen)) this.chosen = routes[0].item.id;
      for (const r of routes) {
        const d = this.data.dept.get(r.item.dept)!;
        kids.push(h('button', { className: `chip route${this.chosen === r.item.id ? ' active' : ''}`, style: { '--c': d.color }, onclick: () => { this.chosen = r.item.id; this.renderRoutes(); } }, `${d.emoji} ${r.item.name}`));
      }
    } else {
      kids.push(h('span', { className: 'muted' }, s.auto));
    }
    this.el.routes.replaceChildren(...kids);
  }

  private send() {
    const input = this.el.taskInput as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    const agentId = this.pinnedAgent?.id || this.chosen || this.currentRoutes()[0]?.item.id || 'agent:claude-office:office-manager';
    input.value = '';
    this.pinnedAgent = null;
    this.chosen = null;
    this.renderRoutes();
    this.tasks.dispatch(text, agentId);
    this.feedTab('tasks');
    const a = this.cast.byItem.get(agentId);
    if (a) this.api.focusActor(a);
  }

  private feedTab(which: 'feed' | 'tasks') {
    this.el.feedList.hidden = which !== 'feed';
    this.el.tasksList.hidden = which !== 'tasks';
    this.el.feedTab.classList.toggle('active', which === 'feed');
    this.el.tasksTab.classList.toggle('active', which === 'tasks');
  }

  renderTasks() {
    const s = t();
    const list = this.tasks.tasks;
    this.el.tasksTab.textContent = `📨 ${s.tasks}${list.length ? ` (${list.length})` : ''}`;
    if (!list.length) {
      this.el.tasksList.replaceChildren(h('div', { className: 'empty' }, s.taskPlaceholder));
      return;
    }
    this.el.tasksList.replaceChildren(
      ...list.map((task) => {
        const out = h('div', { className: 'md task-out' });
        if (task.output) out.innerHTML = renderMarkdown(task.output);
        const statusText = { queued: s.queued, running: s.running, done: s.done, error: s.error }[task.status];
        return h(
          'details',
          { className: `task ${task.status}`, open: task === list[0] },
          h('summary', {}, h('span', { className: 'pill' }, statusText), h('b', {}, task.agentName), h('span', {}, ` — ${task.prompt}`), task.mode === 'simulated' ? h('em', {}, ` (${s.simulated})`) : null),
          task.log.length ? h('div', { className: 'task-log' }, ...task.log.slice(-6).map((l) => h('div', {}, l))) : null,
          out,
          task.cost ? h('small', { className: 'muted' }, `$${task.cost.toFixed(4)}`) : null,
        );
      }),
    );
  }

  // -------------------------------------------------------------- feed ----
  private feedTimer = 0;
  private renderFeedSoon() {
    if (this.feedTimer) return;
    this.feedTimer = window.setTimeout(() => {
      this.feedTimer = 0;
      this.renderFeed();
    }, 400);
  }

  renderFeed() {
    const s = t();
    const items = this.feed.filter((e) => !this.liveOnly || e.kind !== 'ambient').slice(0, 60);
    if (!items.length) {
      this.el.feedList.replaceChildren(h('div', { className: 'empty' }, s.emptyFeed));
      return;
    }
    this.el.feedList.replaceChildren(
      ...items.map((e) =>
        h(
          'button',
          {
            className: `feed-row ${e.kind}`,
            onclick: () => {
              if (e.itemId && !e.actor) this.api.selectItem(e.itemId, true);
              else if (e.actor) e.actor.item ? this.api.selectItem(e.actor.item.id, true) : (this.api.selectActor(e.actor), this.api.focusActor(e.actor));
            },
          },
          h('span', { className: 'fi' }, e.icon),
          h('span', { className: 'ft' }, e.text),
          h('time', {}, new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
        ),
      ),
    );
  }

  // ------------------------------------------------------------- graph ----
  setGraphMode(on: boolean) {
    const s = t();
    document.body.classList.toggle('graph-mode', on);
    this.renderTopButtons();
    const p = this.el.graphPanel;
    p.hidden = !on;
    if (!on) return;
    const types = ['agent', 'skill', 'command', 'guide', 'dept', 'source'];
    p.replaceChildren(
      h('h3', {}, `🕸️ ${s.graph}`),
      h('p', { className: 'muted' }, `${this.data.graph.nodes.length} nodes · ${this.data.graph.edges.length} edges · Graphify`),
      h(
        'div',
        { className: 'chips' },
        ...types.map((ty) =>
          h(
            'button',
            {
              className: `chip${this.graph.hiddenTypes.has(ty) ? '' : ' active'}`,
              onclick: () => {
                if (this.graph.hiddenTypes.has(ty)) this.graph.hiddenTypes.delete(ty);
                else this.graph.hiddenTypes.add(ty);
                this.graph.refresh(this.graphSearch);
                this.setGraphMode(true);
              },
            },
            `${TYPE_ICON[ty]} ${ty}`,
          ),
        ),
        h(
          'button',
          { className: `chip${this.graph.showInferred ? ' active' : ''}`, onclick: () => { this.graph.showInferred = !this.graph.showInferred; this.graph.refresh(this.graphSearch); this.setGraphMode(true); } },
          `〰️ ${s.inferred}`,
        ),
        h('button', { className: 'chip', onclick: () => { this.api.selectItem(''); this.graph.overview(); } }, `🎯 ${s.zoomOut}`),
      ),
      h('h4', {}, s.godNodes),
      h(
        'ol',
        { className: 'god' },
        ...this.graph.godNodes().map((n) => h('li', {}, h('button', { className: 'linkish', onclick: () => this.api.selectItem(n.id, true) }, `${TYPE_ICON[n.t]} ${n.n}`), h('small', {}, ` ${n.deg}`))),
      ),
      h('h4', {}, s.legend),
      h('div', { className: 'legend' }, ...this.data.registry.departments.map((d) => h('span', { style: { '--c': d.color } }, `${d.emoji} ${d.name}`))),
    );
  }

  // ------------------------------------------------------------ modals ----
  private openModal(content: HTMLElement) {
    this.el.modal.replaceChildren(content);
    this.el.modal.hidden = false;
  }
  closeModal() {
    this.el.modal.hidden = true;
  }

  private help() {
    const s = t();
    const src = this.data.registry.sources;
    this.openModal(
      h(
        'div',
        { className: 'modal-card' },
        h('div', { className: 'insp-head' }, h('h2', {}, `❓ ${s.help}`), h('button', { className: 'x', onclick: () => this.closeModal() }, '✕')),
        h('p', {}, s.helpText),
        h(
          'ul',
          {},
          h('li', {}, '🟢 = ', s.working, ' · 🔵 = 📘 skill · 🟡 = 💬 · 🟣 = 🕸️ · 🔴 = LIVE'),
          h('li', {}, 'npm run dev → http://localhost:3333 (', s.live, ')'),
          h('li', {}, 'npm run hooks:install → Claude Code hooks'),
          h('li', {}, 'npm run hire -- <id> → .claude/agents | skills | commands'),
        ),
        h('h4', {}, s.sources),
        h('ul', {}, ...src.map((x) => h('li', {}, h('a', { href: `https://github.com/${x.repo}`, target: '_blank', rel: 'noopener noreferrer' }, x.repo), ` — ${x.role} (${x.license})`))),
      ),
    );
  }

  toast(text: string, ms = 3000) {
    const el = this.el.toast;
    el.textContent = text;
    el.hidden = false;
    clearTimeout((el as HTMLElement & { _t?: number })._t);
    (el as HTMLElement & { _t?: number })._t = window.setTimeout(() => (el.hidden = true), ms);
  }
}
