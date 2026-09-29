// Everything drawn in HTML over the 3D canvas: top bar, directory (with the
// task teams), inspector (with the 3D portrait), chat / runs / activity
// panel, the command bar and the graph-view controls.
import type { Item, ItemType, OfficeData } from '../data';
import { displayName } from '../data';
import { currentLang, t, toggleLang } from '../i18n';
import type { Connection, Status } from '../live/connection';
import type { Actor, Cast } from '../sim/actors';
import type { Director, FeedEntry } from '../sim/director';
import type { CrewKind, CrewRun, Crews, Pending, Question } from '../ai/crews';
import type { Engine } from '../ai/engine';
import { compact, h } from './dom';
import type { GraphView } from './graphView';
import { renderMarkdown } from './markdown';
import { Portrait } from './portrait';
import { ROLE_TITLE } from '../world/human';
import type { BossAI } from '../sim/boss';
import { XP_PER_LEVEL, type Academy } from '../sim/academy';
import { BUILDINGS, buildingOf } from '../world/layout';

export interface HudApi {
  selectItem(id: string, fly?: boolean): void;
  selectActor(a: Actor | null): void;
  focusDept(id: string): void;
  focusBuilding(id: string): void;
  focusActor(a: Actor): void;
  toggleXray(): boolean;
  isXray(): boolean;
  toggleGraph(): void;
  isGraph(): boolean;
  toggleNight(): boolean;
  isNight(): boolean;
  overview(): void;
  setFollow(on: boolean): void;
  openRun(run: CrewRun): void;
  highlight(ids: string[], color: string): void;
  engine(): Engine | null;
  boss(): BossAI;
  academy(): Academy;
  setBossControl(on: boolean): void;
  /** send the Boss to check an agent (real = AI exam) */
  inspect(agentId: string, real: boolean): void;
}

type Tab = ItemType | 'dept' | 'source' | 'team' | 'academy';
type Panel = 'chat' | 'runs' | 'feed';

const TYPE_ICON: Record<string, string> = { agent: '🧑‍💻', skill: '📘', command: '⌨️', guide: '📜', dept: '🏢', source: '📦' };
const KIND_ICON: Record<CrewKind, string> = { chat: '💬', website: '🌐', project: '🏗️', content: '✍️', task: '⚡' };
const T = (uz: string, en: string) => (currentLang() === 'uz' ? uz : en);

export class Hud {
  private root = document.getElementById('hud')!;
  private tab: Tab = 'team';
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
  private panel: Panel = 'chat';
  private mode: CrewKind | 'auto' = 'auto';
  private attachments: File[] = [];
  private el: Record<string, HTMLElement> = {};
  private portrait = new Portrait(250);
  private unseenChat = 0;

  constructor(
    readonly data: OfficeData,
    readonly cast: Cast,
    readonly director: Director,
    readonly crews: Crews,
    readonly conn: Connection,
    readonly graph: GraphView,
    readonly api: HudApi,
  ) {
    director.onFeed((e) => {
      this.feed.unshift(e);
      if (this.feed.length > 150) this.feed.length = 150;
      this.renderFeedSoon();
    });
    conn.onStatus((s) => this.renderStatus(s));
    this.build();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
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
    this.el.status = h('button', { className: 'mode-badge' });
    this.el.engine = h('button', { className: 'engine-badge' });
    this.el.nightBtn = h('button', { className: 'tb-btn', onclick: () => { this.api.toggleNight(); this.renderTopButtons(); } });
    this.el.graphBtn = h('button', { className: 'tb-btn', onclick: () => this.api.toggleGraph() });
    this.el.ambientBtn = h('button', { className: 'tb-btn', onclick: () => { this.director.ambient = !this.director.ambient; this.renderTopButtons(); } });
    this.el.xrayBtn = h('button', { className: 'tb-btn', onclick: () => { this.api.toggleXray(); this.renderTopButtons(); } });
    this.el.bossBtn = h('button', { className: 'tb-btn', onclick: () => { const on = !this.api.boss().control; this.api.setBossControl(on); if (on) this.api.selectActor(this.cast.boss); } });
    const top = h(
      'header',
      { className: 'topbar' },
      h('div', { className: 'brand' }, h('span', { className: 'brand-logo' }, '🏢'), h('div', {}, h('b', {}, s.title), h('small', {}, s.subtitle))),
      h(
        'div',
        { className: 'stats' },
        h('button', { className: 'stat', onclick: () => this.openTab('team') }, h('b', {}, String(this.crews.teams.length)), ' ', T('jamoa', 'teams')),
        ...(['agent', 'skill', 'command'] as ItemType[]).map((k) =>
          h('button', { className: 'stat', onclick: () => this.openTab(k) }, h('b', {}, String(c[k] || 0)), ' ', { agent: s.agents, skill: s.skills, command: s.commands, guide: s.guides }[k]),
        ),
      ),
      h(
        'div',
        { className: 'tb-actions' },
        this.el.engine,
        this.el.status,
        this.el.graphBtn,
        this.el.nightBtn,
        this.el.xrayBtn,
        this.el.bossBtn,
        this.el.ambientBtn,
        h('button', { className: 'tb-btn', title: s.zoomOut, onclick: () => this.api.overview() }, '🎯'),
        h('button', { className: 'tb-btn', onclick: () => { toggleLang(); this.build(); } }, s.lang),
        h('button', { className: 'tb-btn', title: s.help, onclick: () => this.help() }, '❓'),
        h('button', { className: 'tb-btn mobile-only', onclick: () => this.togglePanel('dir') }, '📚'),
        h('button', { className: 'tb-btn mobile-only', onclick: () => this.togglePanel('feed') }, '💬'),
      ),
    );

    // Directory
    this.el.search = h('input', {
      className: 'search', type: 'search', id: 'office-search', placeholder: s.search, value: this.query, 'aria-label': s.search,
      oninput: (e: Event) => {
        this.query = (e.target as HTMLInputElement).value;
        this.renderDirectory();
        if (this.api.isGraph()) {
          this.graphSearch = this.query;
          this.graph.refresh(this.query);
        }
      },
    });
    this.el.tabs = h('div', { className: 'tabs' });
    this.el.filters = h('div', { className: 'filters' });
    this.el.list = h('div', { className: 'list' });
    const dir = h('aside', { className: 'panel dir', id: 'panel-dir' }, this.el.search, this.el.tabs, this.el.filters, this.el.list);

    this.el.inspector = h('aside', { className: 'panel inspector', id: 'panel-inspector', hidden: true });

    // Chat / runs / activity panel
    this.el.chatList = h('div', { className: 'chat-list', 'aria-live': 'polite' });
    this.el.runsList = h('div', { className: 'runs-list' });
    this.el.feedList = h('div', { className: 'feed-list' });
    this.el.tabChat = h('button', { className: 'ft-tab', onclick: () => this.showPanelTab('chat') });
    this.el.tabRuns = h('button', { className: 'ft-tab', onclick: () => this.showPanelTab('runs') });
    this.el.tabFeed = h('button', { className: 'ft-tab', onclick: () => this.showPanelTab('feed') }, `📰 ${s.feed}`);
    this.el.liveToggle = h('label', { className: 'live-only' }, h('input', { type: 'checkbox', checked: this.liveOnly, onchange: (e: Event) => { this.liveOnly = (e.target as HTMLInputElement).checked; this.renderFeed(); } }), ' LIVE');
    const feed = h('section', { className: 'panel feed', id: 'panel-feed' }, h('div', { className: 'ft-head' }, this.el.tabChat, this.el.tabRuns, this.el.tabFeed, this.el.liveToggle), this.el.chatList, this.el.runsList, this.el.feedList);

    // Command bar
    this.el.fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, hidden: true, id: 'office-attach', onchange: (e: Event) => this.addFiles((e.target as HTMLInputElement).files) });
    this.el.taskInput = h('textarea', {
      className: 'task-input', id: 'office-command', rows: 1, 'aria-label': T('Buyruq', 'Command'),
      placeholder: T('Ofisga yozing: “salom hammaga”, “test oladigan sayt qilib ber” yoki skrinshot yuboring…', 'Write to the office: “hi all”, “build a quiz website” or send a screenshot…'),
      oninput: () => { this.autosize(); this.renderRoutes(); },
      onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } },
      onpaste: (e: ClipboardEvent) => { const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); this.addFiles(files); } },
    });
    this.el.thumbs = h('div', { className: 'thumbs' });
    this.el.modes = h('div', { className: 'modes' });
    this.el.routes = h('div', { className: 'routes' });
    const taskbar = h(
      'section',
      { className: 'taskbar', id: 'taskbar', ondragover: (e: DragEvent) => e.preventDefault(), ondrop: (e: DragEvent) => { e.preventDefault(); this.addFiles(e.dataTransfer?.files || null); } },
      this.el.thumbs,
      h(
        'div',
        { className: 'task-row' },
        h('label', { className: 'attach', for: 'office-attach', title: T('Skrinshot biriktirish', 'Attach a screenshot') }, '📎'),
        this.el.fileInput,
        this.el.taskInput,
        h('button', { className: 'send', onclick: () => this.send() }, s.send),
      ),
      h('div', { className: 'task-meta' }, this.el.modes, this.el.routes),
    );

    this.el.graphPanel = h('aside', { className: 'panel graph-panel', hidden: true });
    this.el.modal = h('div', { className: 'modal', hidden: true, onclick: (e: Event) => { if (e.target === this.el.modal) this.closeModal(); } });
    this.el.toast = h('div', { className: 'toast', hidden: true, role: 'status' });

    this.root.append(top, dir, this.el.inspector, feed, taskbar, this.el.graphPanel, this.el.modal, this.el.toast);
    this.renderStatus(this.conn.status);
    this.renderEngine();
    this.renderTopButtons();
    this.renderDirectory();
    this.renderChat();
    this.renderRuns();
    this.renderFeed();
    this.renderModes();
    this.renderRoutes();
    this.renderThumbs();
    this.showPanelTab(this.panel);
    if (this.selected || this.selectedActor) this.inspect(this.selected, this.selectedActor);
    if (this.api.isGraph()) this.setGraphMode(true);
  }

  private openTab(tab: Tab) {
    this.tab = tab;
    this.showPanel('dir');
    this.renderDirectory();
  }
  private showPanel(which: 'dir' | 'feed') {
    document.getElementById(`panel-${which}`)?.classList.add('open');
  }
  private togglePanel(which: 'dir' | 'feed') {
    document.getElementById(`panel-${which}`)?.classList.toggle('open');
  }

  private renderStatus(st: Status) {
    const s = t();
    const b = this.el.status;
    if (!b) return;
    b.className = `mode-badge ${st}`;
    // Static builds never have Claude Code hooks; the badge would only suggest the agents are fake.
    b.hidden = !!import.meta.env.VITE_OFFLINE;
    b.textContent = st === 'live' ? `● ${s.live}` : st === 'connecting' ? '…' : `◌ ${T('HOOK YO‘Q', 'NO HOOKS')}`;
    b.title = st === 'live' ? s.liveHint : T('Claude Code hooklari ulanmagan (jonli rejim uchun: npm run dev + npm run hooks:install).', 'Claude Code hooks are not connected (live mode: npm run dev + npm run hooks:install).');
    b.onclick = () => this.toast(b.title, 6000);
  }

  renderEngine() {
    const e = this.api.engine();
    const b = this.el.engine;
    if (!b) return;
    const label = !e ? '…' : e.kind === 'server' ? '🧠 Claude CLI' : e.kind === 'claude' ? '🧠 Claude' : T('◌ AI yo‘q', '◌ No AI');
    b.textContent = label;
    b.className = `engine-badge ${e?.kind || 'wait'}`;
    b.title = !e
      ? T('AI ulanmoqda…', 'Connecting AI…')
      : e.kind === 'server'
        ? T('Agentlar kompyuteringizdagi Claude Code CLI orqali haqiqiy ishlaydi.', 'Agents run for real through the Claude Code CLI on your computer.')
        : e.kind === 'claude'
          ? T('Agentlar claude.ai hisobingizdagi Claude orqali haqiqiy ishlaydi (birinchi so‘rovda ruxsat so‘raladi).', 'Agents run for real on your claude.ai account (first request asks for permission).')
          : T('AI ulanmagan: ofisni claude.ai ichida oching yoki npm run dev bilan ishga tushiring.', 'No AI: open the office in claude.ai or run npm run dev.');
    b.onclick = () => this.toast(b.title, 7000);
  }

  renderTopButtons() {
    const s = t();
    this.el.nightBtn.textContent = this.api.isNight() ? '☀️' : '🌙';
    this.el.nightBtn.title = this.api.isNight() ? s.day : s.night;
    this.el.graphBtn.replaceChildren(this.api.isGraph() ? '🏢' : '🕸️', h('span', { className: 'lbl' }, ` ${this.api.isGraph() ? s.office : s.graph}`));
    this.el.graphBtn.title = this.api.isGraph() ? s.office : s.graph;
    this.el.xrayBtn.textContent = this.api.isXray() ? '🏢' : '🏗️';
    this.el.xrayBtn.title = this.api.isXray() ? T('Binolarni to‘liq ko‘rsatish', 'Show whole buildings') : T('Binolar ichini ko‘rish (tomlarsiz)', 'Look inside the buildings (no roofs)');
    this.el.xrayBtn.classList.toggle('on', this.api.isXray());
    this.el.bossBtn.textContent = '🎮';
    this.el.bossBtn.title = this.api.boss().control ? T('Boss boshqaruvini o‘chirish', 'Stop controlling the Boss') : T('Bossni boshqarish (WASD / strelkalar, yerga bosing — o‘sha joyga boradi)', 'Control the Boss (WASD / arrows, click the ground to walk there)');
    this.el.bossBtn.classList.toggle('on', this.api.boss().control);
    this.el.ambientBtn.textContent = this.director.ambient ? '🤖' : '⏸️';
    this.el.ambientBtn.title = s.ambient;
    this.el.ambientBtn.classList.toggle('off', !this.director.ambient);
  }

  // ---------------------------------------------------------- directory ---
  private filtered(): Item[] {
    const terms = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.data.registry.items.filter((i) => {
      if (!['agent', 'skill', 'command', 'guide'].includes(this.tab) || i.type !== this.tab) return false;
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
      ['team', `👥 ${T('Jamoalar', 'Teams')}`],
      ['academy', `🎓 ${T('Akademiya', 'Academy')}`],
      ['agent', `🧑‍💻 ${s.agents}`],
      ['skill', `📘 ${s.skills}`],
      ['command', `⌨️ ${s.commands}`],
      ['guide', `📜 ${s.guides}`],
      ['dept', `🏢 ${s.departments}`],
      ['source', `📦 ${s.sources}`],
    ];
    this.el.tabs.replaceChildren(...tabs.map(([k, label]) => h('button', { className: `tab${this.tab === k ? ' active' : ''}`, onclick: () => { this.tab = k; this.renderDirectory(); } }, label)));
    const deptSel = h(
      'select',
      { 'aria-label': s.dept, onchange: (e: Event) => { this.deptFilter = (e.target as HTMLSelectElement).value; this.renderDirectory(); } },
      h('option', { value: '' }, `${s.dept}: ${s.all}`),
      ...this.data.registry.departments.map((d) => h('option', { value: d.id, selected: d.id === this.deptFilter }, `${d.emoji} ${d.name}`)),
    );
    const srcSel = h(
      'select',
      { 'aria-label': s.source, onchange: (e: Event) => { this.sourceFilter = (e.target as HTMLSelectElement).value; this.renderDirectory(); } },
      h('option', { value: '' }, `${s.source}: ${s.all}`),
      ...this.data.registry.sources.map((x) => h('option', { value: x.id, selected: x.id === this.sourceFilter }, x.short)),
    );
    this.el.filters.replaceChildren(deptSel, srcSel);
    this.el.filters.hidden = !['agent', 'skill', 'command', 'guide'].includes(this.tab);

    if (this.tab === 'team') return this.renderTeams();
    if (this.tab === 'academy') return this.renderAcademy();
    if (this.tab === 'dept') {
      const perBuilding = new Map<string, { agent: number; skill: number }>();
      for (const it of this.data.registry.items) {
        const b = buildingOf(it);
        const c = perBuilding.get(b) || { agent: 0, skill: 0 };
        if (it.type === 'agent') c.agent++;
        else if (it.type === 'skill') c.skill++;
        perBuilding.set(b, c);
      }
      this.el.list.replaceChildren(
        h('small', { className: 'list-head' }, T('🏙️ Kampus binolari', '🏙️ Campus buildings')),
        ...BUILDINGS.map((b) =>
          h(
            'button',
            { className: 'row', style: { '--dot': b.color }, onclick: () => this.api.focusBuilding(b.id) },
            h('span', { className: 'dot' }),
            h('div', { className: 'row-main' }, h('b', {}, `${b.emoji} ${b.name[currentLang()]}`), h('small', {}, `${perBuilding.get(b.id)?.agent || 0} ${s.agents.toLowerCase()} · ${perBuilding.get(b.id)?.skill || 0} ${s.skills.toLowerCase()}`)),
          ),
        ),
        h('small', { className: 'list-head' }, T('🗂️ Bo‘limlar', '🗂️ Departments')),
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

  /** Task teams with their members ranked by the real benchmark. */
  private renderTeams() {
    const lang = currentLang();
    const q = this.query.toLowerCase();
    const cards = this.crews.teams
      .filter((tm) => !q || `${tm.name.uz} ${tm.name.en} ${tm.keywords} ${tm.best[lang]}`.toLowerCase().includes(q))
      .map((tm) => {
        const ranked = this.crews.ranked(tm.id);
        const results = ranked.map((m) => this.crews.benchFor(tm.id, m.id)).filter((b) => b?.ok);
        const bestScore = Math.max(0, ...results.map((b) => b!.score ?? 0));
        const fastest = Math.min(...results.map((b) => b!.seconds));
        return h(
          'div',
          { className: 'team-card', style: { '--c': tm.color } },
          h('div', { className: 'team-head' }, h('b', {}, `${tm.emoji} ${tm.name[lang]}`), h('button', { className: 'chip', title: T('Ofisda ko‘rsatish', 'Show in the office'), onclick: () => this.api.highlight(tm.members.map((m) => m.id), tm.color) }, '📍')),
          h('p', { className: 'team-best' }, tm.best[lang]),
          h(
            'ol',
            { className: 'team-members' },
            ...ranked.map((m) => {
              const it = this.data.byId.get(m.id)!;
              const b = this.crews.benchFor(tm.id, m.id);
              const badges = compact([
                b?.ok && b.score === bestScore && bestScore > 0 ? h('span', { className: 'badge gold', title: T('Eng yuqori baho', 'Top score') }, '🏆') : null,
                b?.ok && b.seconds === fastest ? h('span', { className: 'badge', title: T('Eng tez', 'Fastest') }, '⚡') : null,
              ]);
              return h(
                'li',
                {},
                h(
                  'button',
                  { className: 'member', onclick: () => this.api.selectItem(m.id, true) },
                  h('span', { className: 'm-name' }, it.name, ...badges),
                  h('small', {}, m.role[lang]),
                  b ? h('span', { className: 'm-bench', title: b.verdict }, b.ok ? `⭐ ${b.score ?? '—'}/10 · ⏱ ${b.seconds}s` : '⚠️') : h('span', { className: 'm-bench muted' }, '—'),
                ),
              );
            }),
          ),
          h(
            'div',
            { className: 'chips team-skills' },
            ...tm.skills.slice(0, 8).map((id) => {
              const sk = this.data.byId.get(id);
              return sk ? h('button', { className: 'chip small', onclick: () => this.api.selectItem(id, true) }, `📘 ${sk.name}`) : null;
            }),
          ),
          h(
            'button',
            {
              className: 'btn small team-go',
              onclick: () => {
                this.mode = tm.id === 'coder' ? 'website' : tm.id === 'content' ? 'content' : tm.id === 'office' ? 'chat' : 'task';
                this.pinnedAgent = tm.id === 'coder' || tm.id === 'content' || tm.id === 'office' ? null : this.data.byId.get(ranked[0].id) || null;
                this.renderModes();
                this.renderRoutes();
                (this.el.taskInput as HTMLTextAreaElement).focus();
              },
            },
            `⚡ ${T('Shu jamoaga vazifa', 'Give this team a task')}`,
          ),
        );
      });
    const note = h(
      'p',
      { className: 'bench-note' },
      T(
        `Baholar haqiqiy sinovdan: har bir agentga o‘z jamoasining vazifasi berildi, vaqti o‘lchandi va alohida “hakam” javobni 1–10 ball bilan baholadi (${this.crews.bench.length} ta sinov).`,
        `Scores come from a real test: each agent got its team’s task, was timed, and a separate judge scored the answer 1–10 (${this.crews.bench.length} runs).`,
      ),
    );
    this.el.list.replaceChildren(note, ...cards);
  }

  private itemRow(i: Item) {
    const d = this.data.dept.get(i.dept)!;
    const src = this.data.source.get(i.source)!;
    const actor = this.cast.byItem.get(i.id);
    return h(
      'button',
      { className: `row${this.selected?.id === i.id ? ' active' : ''}`, style: { '--dot': d.color }, onclick: () => this.api.selectItem(i.id) },
      h('span', { className: 'dot' }),
      h('div', { className: 'row-main' }, h('b', {}, displayName(i), actor?.live ? h('span', { className: 'live-dot', title: 'live' }) : null), h('small', {}, i.description)),
      h('span', { className: 'src', style: { '--src': src.color } }, src.short),
    );
  }

  // ---------------------------------------------------------- inspector ---
  inspect(item: Item | null, actor: Actor | null = null) {
    const changed = item?.id !== this.selected?.id || actor !== this.selectedActor;
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
    const a = actor || (item ? this.cast.byItem.get(item.id) || null : null);
    const portraitBlock = a ? this.portraitBlock(a) : null;

    if (!item && actor && actor.kind === 'boss') {
      box.replaceChildren(
        h('div', { className: 'insp-head' }, h('h2', {}, s.you), h('button', { className: 'x', onclick: () => this.api.selectActor(null), 'aria-label': s.close }, '✕')),
        portraitBlock!,
        (this.el.bossPanel = h('div', { className: 'boss-panel' })),
      );
      this.refreshBoss();
      return;
    }
    if (!item && actor) {
      const role = ROLE_TITLE[actor.look.role];
      const title = actor.kind === 'lead' ? s.lead : actor.kind === 'boss' ? s.you : actor.kind === 'teacher' ? `🎓 ${actor.name}` : actor.kind === 'staff' ? `${role.emoji} ${role[currentLang()]}` : `${s.visitor}: ${actor.name}`;
      const desc =
        actor.kind === 'lead'
          ? T('Claude — qabulxonadagi bosh agent. Claude Code’dagi haqiqiy ishlar (asboblar, skillar, subagentlar) shu yerda ko‘rinadi.', 'Claude Code — the lead agent at reception. Live hook events (tools, skills, subagents) show up here.')
          : actor.kind === 'boss'
            ? T('Siz — ofis direktori. Claude Code’ga yozgan so‘rovlaringiz shu odamning ustida chiqadi.', 'You — the office director. Prompts you type into Claude Code appear here.')
            : actor.kind === 'teacher'
              ? T('Claude — Claude Akademiyasi o‘qituvchisi. Har bir bo‘limga o‘z sohasi bo‘yicha dars beradi; o‘rganilgan skillar agentlarning ishiga qo‘shiladi. “🎓 Akademiya” bo‘limida dars jadvali va konspektlar bor.', 'Claude — the Claude Academy teacher. Teaches every department its own field; what agents learn is added to their work. See the “🎓 Academy” tab for classes and notes.')
            : actor.kind === 'staff'
              ? actor.look.role === 'guard'
                ? T('Kampus qo‘riqchisi: darvoza oldida turadi va vaqti-vaqti bilan hududni aylanib chiqadi.', 'Campus security: stands at the gate and patrols the grounds now and then.')
                : T('Ofis xizmatlari xodimi: binolar va maydonni toza saqlaydi.', 'Office services: keeps the buildings and the plaza clean.')
              : T('Ofisda stoli yo‘q subagent (masalan general-purpose, Explore, Plan). Ishlayotganda mehmon stolida o‘tiradi.', 'A subagent type with no desk in the office (e.g. general-purpose, Explore, Plan). It works at a visitor desk.');
      box.replaceChildren(
        ...compact([
          h('div', { className: 'insp-head' }, h('h2', {}, title), h('button', { className: 'x', onclick: () => this.api.selectActor(null), 'aria-label': s.close }, '✕')),
          portraitBlock,
          h('p', { className: 'desc' }, desc),
          actor.liveTask ? h('p', { className: 'current' }, `⚡ ${actor.liveTask}`) : null,
        ]),
      );
      return;
    }
    const it = item!;
    const d = this.data.dept.get(it.dept)!;
    const src = this.data.source.get(it.source)!;
    const links = this.data.neighbors.get(it.id) || [];
    const groups: [string, typeof links][] = [
      [s.usesSkills, links.filter((l) => l.out && l.rel === 'uses_skill')],
      [s.delegates, links.filter((l) => l.out && (l.rel === 'delegates_to' || l.rel === 'invokes'))],
      [s.relatedTo, links.filter((l) => l.rel === 'related_to')],
      [s.usedBy, links.filter((l) => !l.out && l.rel !== 'related_to')],
    ];
    const statusLine = a ? h('p', { className: 'status' }) : null;
    this.el.statusLine = statusLine as HTMLElement;
    const teamRoles = this.crews.teams.filter((tm) => tm.members.some((m) => m.id === it.id));
    const benches = this.crews.bench.filter((b) => b.agentId === it.id);
    box.replaceChildren(
      ...compact([
        h(
          'div',
          { className: 'insp-head' },
          h('div', {}, h('small', { className: 'type' }, `${TYPE_ICON[it.type]} ${it.type}`), h('h2', {}, displayName(it))),
          h('button', { className: 'x', onclick: () => this.api.selectItem(''), 'aria-label': s.close }, '✕'),
        ),
        portraitBlock,
        h(
          'div',
          { className: 'chips' },
          a ? h('span', { className: 'chip', title: T('Lavozim', 'Role') }, `${ROLE_TITLE[a.look.role].emoji} ${ROLE_TITLE[a.look.role][currentLang()]}`) : null,
          h('button', { className: 'chip', style: { '--c': BUILDINGS.find((b) => b.id === buildingOf(it))!.color }, onclick: () => this.api.focusBuilding(buildingOf(it)) }, `${BUILDINGS.find((b) => b.id === buildingOf(it))!.emoji} ${BUILDINGS.find((b) => b.id === buildingOf(it))!.name[currentLang()]}`),
          h('button', { className: 'chip', style: { '--c': d.color }, onclick: () => this.api.focusDept(d.id) }, `${d.emoji} ${d.name}`),
          h('span', { className: 'chip', style: { '--c': src.color } }, `📦 ${src.short}`),
          it.model ? h('span', { className: 'chip' }, `🧠 ${it.model}`) : null,
          ...teamRoles.map((tm) => h('button', { className: 'chip', style: { '--c': tm.color }, onclick: () => this.openTab('team') }, `${tm.emoji} ${tm.members.find((m) => m.id === it.id)!.role[currentLang()]}`)),
        ),
        h('p', { className: 'desc' }, it.description),
        statusLine,
        it.type === 'agent' && a ? this.academyBlock(it.id) : null,
        ...benches.map((b) =>
          h(
            'details',
            { className: 'bench' },
            h('summary', {}, `🧪 ${T('Sinov', 'Test')}: ⭐ ${b.score ?? '—'}/10 · ⏱ ${b.seconds}s · ${b.model}`),
            h('p', { className: 'muted' }, b.verdict),
            h('div', { className: 'md', html: renderMarkdown(b.answer) }),
          ),
        ),
        it.tools?.length ? h('div', { className: 'meta' }, h('small', {}, s.tools), h('div', { className: 'chips' }, ...it.tools.map((x) => h('span', { className: 'chip small' }, x)))) : null,
        h(
          'div',
          { className: 'actions' },
          h('button', { className: 'btn', onclick: () => (a ? this.api.focusActor(a) : this.api.selectItem(it.id, true)) }, `📍 ${s.focus}`),
          a && it.type === 'agent' ? h('button', { className: `btn${this.following ? ' on' : ''}`, onclick: () => { this.following = !this.following; this.api.setFollow(this.following); this.inspect(it, a); } }, `🎥 ${s.follow}`) : null,
          it.type === 'agent' ? h('button', { className: 'btn primary', onclick: () => this.pinAgent(it) }, `⚡ ${s.giveTask}`) : null,
          h('button', { className: 'btn', onclick: () => this.fullText(it) }, `📄 ${s.fullText}`),
          h('a', { className: 'btn', href: it.url, target: '_blank', rel: 'noopener noreferrer' }, `🔗 ${s.openSource}`),
          h('button', { className: `btn${this.hiredIds.has(it.id) ? ' on' : ''}`, onclick: () => this.hire(it) }, this.hiredIds.has(it.id) ? `✅ ${s.hired}` : `🧑‍💼 ${s.hire}`),
        ),
        h('div', { className: 'cli' }, h('small', {}, s.hireCli), h('code', {}, `npm run hire -- ${it.id}`)),
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
    if (a) this.renderStatusLine(a);
    if (changed) this.renderDirectory();
  }

  private portraitBlock(a: Actor) {
    const d = a.item ? this.data.dept.get(a.item.dept) : undefined;
    const bg = d?.color || a.color;
    this.portrait.setLabels(T('Yuz', 'Face'), T('To‘liq bo‘y', 'Full body'));
    this.portrait.show(a.look, bg, a.activity === 'work' || a.activity === 'clean' ? 'work' : a.activity === 'talk' ? 'talk' : 'idle');
    queueMicrotask(() => this.portrait.resume());
    return this.portrait.el;
  }

  private renderStatusLine(a: Actor) {
    const s = t();
    const el = this.el.statusLine;
    if (!el?.isConnected) return;
    el.className = `status ${a.live ? 'live' : a.activity}`;
    el.replaceChildren(`${s.status}: `, h('b', {}, a.live ? `LIVE · ${a.liveTask || ''}` : a.activity === 'idle' ? s.idle : `${s.working} (${a.activity})`), a.bubble ? h('span', {}, ` — ${a.bubble}`) : '');
    this.portrait.setMood(a.activity === 'work' || a.activity === 'clean' ? 'work' : a.activity === 'talk' ? 'talk' : 'idle');
  }

  /** Cheap periodic refresh: the live status line of the inspected agent. */
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
    this.openModal(h('div', { className: 'modal-card' }, h('div', { className: 'insp-head' }, h('h2', {}, displayName(it)), h('button', { className: 'x', onclick: () => this.closeModal(), 'aria-label': s.close }, '✕')), body));
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
    const prompt = this.crews.prompts[it.id];
    if (prompt) {
      body.innerHTML = renderMarkdown(prompt);
      body.append(h('p', {}, h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer' }, `🔗 ${s.openSource}`)));
      return;
    }
    body.replaceChildren(h('p', {}, `${s.error}. `, h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer' }, `🔗 ${s.openSource}`)));
  }

  // ------------------------------------------------------- command bar ----
  private pinAgent(it: Item) {
    this.pinnedAgent = it;
    this.mode = 'task';
    this.renderModes();
    this.renderRoutes();
    (this.el.taskInput as HTMLTextAreaElement).focus();
  }

  private autosize() {
    const ta = this.el.taskInput as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(140, ta.scrollHeight)}px`;
  }

  private addFiles(list: FileList | File[] | null) {
    if (!list) return;
    for (const f of [...list]) if (f.type.startsWith('image/') && this.attachments.length < 6) this.attachments.push(f);
    (this.el.fileInput as HTMLInputElement).value = '';
    this.renderThumbs();
    this.renderRoutes();
  }

  private renderThumbs() {
    this.el.thumbs.replaceChildren(
      ...this.attachments.map((f, i) => {
        const url = URL.createObjectURL(f);
        return h('span', { className: 'thumb' }, h('img', { src: url, alt: f.name }), h('button', { className: 'x small', 'aria-label': 'remove', onclick: () => { this.attachments.splice(i, 1); this.renderThumbs(); this.renderRoutes(); } }, '✕'));
      }),
    );
    this.el.thumbs.hidden = !this.attachments.length;
  }

  private renderModes() {
    const modes: [CrewKind | 'auto', string][] = [
      ['auto', `🤖 ${T('Avto', 'Auto')}`],
      ['chat', `💬 ${T('Suhbat', 'Chat')}`],
      ['website', `🌐 ${T('Veb-sayt', 'Website')}`],
      ['project', `🏗️ ${T('Katta loyiha', 'Big project')}`],
      ['content', `✍️ ${T('Kontent', 'Content')}`],
      ['task', `⚡ ${T('Vazifa', 'Task')}`],
    ];
    this.el.modes.replaceChildren(...modes.map(([k, label]) => h('button', { className: `chip mode${this.mode === k ? ' active' : ''}`, onclick: () => { this.mode = k; if (k !== 'task') this.pinnedAgent = null; this.renderModes(); this.renderRoutes(); } }, label)));
  }

  renderRoutes() {
    const text = (this.el.taskInput as HTMLTextAreaElement)?.value || '';
    const kind = this.mode === 'auto' ? (text.trim() || this.attachments.length ? this.crews.classify(text, this.attachments) : null) : this.mode;
    const kids: Node[] = [];
    if (this.pinnedAgent) {
      kids.push(h('span', { className: 'chip route active' }, `📌 ${this.pinnedAgent.name}`, h('button', { className: 'x small', 'aria-label': 'unpin', onclick: () => { this.pinnedAgent = null; this.renderRoutes(); } }, '✕')));
    } else if (kind) {
      const team = kind === 'website' || kind === 'project' ? this.crews.team('coder') : kind === 'content' ? this.crews.team('content') : kind === 'chat' ? this.crews.team('office') : this.crews.teamFor(text);
      kids.push(h('span', { className: 'chip route active', style: { '--c': team.color } }, `${KIND_ICON[kind]} → ${team.emoji} ${team.name[currentLang()]}`));
    }
    this.el.routes.replaceChildren(...kids);
  }

  private send() {
    const input = this.el.taskInput as HTMLTextAreaElement;
    const text = input.value.trim();
    if (!text && !this.attachments.length) return;
    const files = this.attachments.slice();
    const forced = this.mode === 'auto' ? undefined : this.mode;
    const pinned = this.pinnedAgent?.id;
    input.value = '';
    this.autosize();
    this.attachments = [];
    this.pinnedAgent = null;
    this.renderThumbs();
    this.renderRoutes();
    this.showPanelTab('chat');
    void this.crews.send(text, files, forced, pinned);
  }

  // ----------------------------------------------------- chat / runs ----
  private showPanelTab(which: Panel) {
    this.panel = which;
    this.el.chatList.hidden = which !== 'chat';
    this.el.runsList.hidden = which !== 'runs';
    this.el.feedList.hidden = which !== 'feed';
    this.el.liveToggle.hidden = which !== 'feed';
    this.el.tabChat.classList.toggle('active', which === 'chat');
    this.el.tabRuns.classList.toggle('active', which === 'runs');
    this.el.tabFeed.classList.toggle('active', which === 'feed');
    if (which === 'chat') this.unseenChat = 0;
    this.renderTabLabels();
    if (which === 'chat') this.el.chatList.scrollTop = this.el.chatList.scrollHeight;
  }

  private renderTabLabels() {
    const running = this.crews.runs.filter((r) => r.status === 'running' || r.status === 'waiting').length;
    this.el.tabChat.textContent = `💬 Chat${this.unseenChat ? ` (${this.unseenChat})` : ''}`;
    this.el.tabRuns.textContent = `📨 ${T('Vazifalar', 'Tasks')}${this.crews.runs.length ? ` (${running ? `⏳${running}` : this.crews.runs.length})` : ''}`;
  }

  renderChat() {
    const msgs = this.crews.chat;
    if (!msgs.length) {
      this.el.chatList.replaceChildren(
        h(
          'div',
          { className: 'chat-empty' },
          h('b', {}, T('Ofis bilan gaplashing', 'Talk to the office')),
          h('p', {}, T('Masalan:', 'For example:')),
          ...[
            T('Salom hammaga, ahvollar qalay?', 'Hi everyone, how are you?'),
            T('Menga o‘quvchilardan test oladigan veb-sayt qilib ber', 'Build me a website that quizzes students'),
            T('Bu Instagram akkauntni tahlil qil va uslubini mening kontentimga qo‘lla (skrinshot biriktiring)', 'Analyse this Instagram account and apply its style to my content (attach screenshots)'),
          ].map((ex) => h('button', { className: 'chip example', onclick: () => { (this.el.taskInput as HTMLTextAreaElement).value = ex; this.renderRoutes(); (this.el.taskInput as HTMLTextAreaElement).focus(); } }, ex)),
        ),
      );
      return;
    }
    this.el.chatList.replaceChildren(...msgs.slice(-80).map((m) => this.chatRow(m)));
    this.el.chatList.scrollTop = this.el.chatList.scrollHeight;
  }

  private chatRow(m: Crews['chat'][number]) {
    if (m.from === 'user')
      return h('div', { className: 'msg me' }, h('div', { className: 'bubble' }, ...m.images?.map((u) => h('img', { src: u, alt: 'screenshot' })) || [], m.text && m.text !== '🖼️' ? h('p', {}, m.text) : null));
    const run = m.runId ? this.crews.runs.find((r) => r.id === m.runId) : undefined;
    const action = m.action && run
      ? h('button', { className: 'btn primary small', disabled: !!m.action.retry && (run.status === 'running' || run.status === 'waiting'), onclick: () => (m.action!.retry ? this.crews.retry(run.id) : this.api.openRun(run)) }, m.action.label)
      : null;
    if (m.from === 'system') return h('div', { className: 'msg system' }, h('span', {}, m.text), action);
    const it = this.data.byId.get(m.from);
    const d = it ? this.data.dept.get(it.dept) : undefined;
    return h(
      'div',
      { className: 'msg agent', style: { '--c': d?.color || '#d97757' } },
      h('button', { className: 'avatar', title: it?.name, onclick: () => it && this.api.selectItem(it.id, true) }, (it?.name || '?').replace(/^cs-/, '').slice(0, 1).toUpperCase()),
      h(
        'div',
        { className: 'bubble' },
        h('small', {}, it?.name || m.from, d ? ` · ${d.emoji}` : ''),
        h('div', { className: 'md', html: renderMarkdown(m.text) }),
        m.ask && run ? this.askCard(run) : null,
        action,
      ),
    );
  }

  // ------------------------------------------- questions & approval ----
  private askCards = new Map<string, { pending: Pending; el: HTMLElement }>();

  /** The card where you answer the crew's questions or approve its plan (kept alive across re-renders). */
  private askCard(run: CrewRun): HTMLElement {
    const p = run.pending;
    if (!p) {
      // Already answered: a short record of what was decided.
      const answered = run.answers && Object.keys(run.answers).length;
      return h('div', { className: 'ask-card done' }, run.approved ? `✅ ${T('Reja tasdiqlandi', 'Plan approved')}` : answered ? `✅ ${T('Javoblar yuborildi', 'Answers sent')}: ${Object.values(run.answers!).filter(Boolean).map((a) => `“${a.slice(0, 40)}”`).join(', ')}` : `✅ ${T('Qabul qilindi', 'Received')}`);
    }
    const cached = this.askCards.get(run.id);
    if (cached && cached.pending === p) return cached.el;
    const el = p.kind === 'questions' ? this.questionsCard(run, p) : this.approvalCard(run, p);
    this.askCards.set(run.id, { pending: p, el });
    return el;
  }

  private questionsCard(run: CrewRun, p: Extract<Pending, { kind: 'questions' }>) {
    const picked = new Map<string, Set<string>>();
    const other = new Map<string, string>();
    const q = (x: Question) => {
      const set = new Set<string>();
      picked.set(x.id, set);
      // Start from the agent's guess (for several-choice questions the guess may list a few options).
      for (const o of x.options) if (x.guess && (x.guess === o || (x.multi && x.guess.includes(o)))) set.add(o);
      const opts = x.options.map((o) => {
        const b = h('button', { className: `chip opt${set.has(o) ? ' on' : ''}`, onclick: () => {
          if (set.has(o)) set.delete(o);
          else {
            if (!x.multi) {
              set.clear();
              opts.forEach((ob) => ob.classList.remove('on'));
            }
            set.add(o);
          }
          b.classList.toggle('on', set.has(o));
        } }, o);
        return b;
      });
      return h(
        'div',
        { className: 'ask-q' },
        h('b', {}, x.question),
        x.multi ? h('small', { className: 'muted' }, T(' (bir nechtasini tanlash mumkin)', ' (pick several)')) : null,
        h('div', { className: 'ask-opts' }, ...opts),
        h('input', { className: 'ask-other', placeholder: x.guess && !x.options.includes(x.guess) ? `${T('Taxminim', 'My guess')}: ${x.guess}` : T('Yoki o‘zingiz yozing…', 'Or type your own…'), oninput: (e: Event) => other.set(x.id, (e.target as HTMLInputElement).value) }),
      );
    };
    const collect = (useGuess: boolean) => {
      const out: Record<string, string> = {};
      for (const x of p.questions) {
        const parts = [...(picked.get(x.id) || [])];
        const typed = (other.get(x.id) || '').trim();
        if (typed) parts.push(typed);
        out[x.id] = parts.join(', ') || (useGuess ? x.guess || T('siz hal qiling', 'you decide') : '');
      }
      return out;
    };
    return h(
      'div',
      { className: 'ask-card' },
      p.understanding ? h('p', { className: 'ask-understanding' }, `💡 ${p.understanding}${p.confidence !== undefined ? ` (${T('ishonch', 'confidence')} ${p.confidence}%)` : ''}`) : null,
      ...p.questions.map(q),
      h(
        'div',
        { className: 'ask-actions' },
        h('button', { className: 'btn primary small', onclick: () => this.crews.answer(run.id, collect(true)) }, T('✅ Javoblarni yuborish', '✅ Send answers')),
        h('button', { className: 'btn small', onclick: () => this.crews.answer(run.id, Object.fromEntries(p.questions.map((x) => [x.id, x.guess || T('siz hal qiling', 'you decide')]))) }, T('🤝 O‘zingiz hal qiling', '🤝 You decide')),
      ),
    );
  }

  private approvalCard(run: CrewRun, p: Extract<Pending, { kind: 'approval' }>) {
    const plan = p.plan;
    const arr = (x: unknown) => (Array.isArray(x) ? x : []);
    const txt = (x: unknown) => (typeof x === 'string' ? x : x && typeof x === 'object' ? Object.values(x as Record<string, unknown>).filter((v) => typeof v === 'string').join(' — ') : String(x ?? ''));
    const box = h('div', { className: 'ask-change', hidden: true });
    const ta = h('textarea', { rows: 3, placeholder: T('Nimani o‘zgartiraylik? Masalan: “ota-onalar uchun kabinet qo‘sh, to‘lovlarni keyinga qoldir”', 'What should change? E.g. “add a parents’ portal, move payments to later”') }) as HTMLTextAreaElement;
    box.append(ta, h('button', { className: 'btn primary small', onclick: () => { if (ta.value.trim()) this.crews.answer(run.id, { ok: false, note: ta.value.trim() }); } }, T('📨 O‘zgarishlarni yuborish', '📨 Send changes')));
    const deliv: Record<string, string> = { web: '🌐 Veb-ilova', api: '⚙️ API', mcp: '🔌 MCP server', bot: '🤖 Telegram bot' };
    return h(
      'div',
      { className: 'ask-card plan' },
      h('b', {}, String(plan.title || run.title)),
      h('p', {}, String(plan.summary || '')),
      arr(plan.deliverables).length ? h('div', { className: 'ask-opts' }, ...arr(plan.deliverables).map((d) => h('span', { className: 'chip on' }, deliv[String(d)] || String(d)))) : null,
      h('small', { className: 'muted' }, 'MVP:'),
      h('ul', {}, ...arr(plan.mvp || plan.features).slice(0, 10).map((m) => h('li', {}, txt(m)))),
      arr(plan.later).length ? h('small', { className: 'muted' }, `${T('Keyinroq', 'Later')}: ${arr(plan.later).slice(0, 5).map(txt).join('; ')}`) : null,
      h('small', { className: 'muted' }, `${arr(plan.pages).length} ${T('sahifa', 'pages')} · ${arr(plan.entities).length} ${T('jadval', 'tables')} · ${arr(plan.api).length} API`),
      h(
        'div',
        { className: 'ask-actions' },
        h('button', { className: 'btn primary small', onclick: () => this.crews.answer(run.id, { ok: true }) }, T('✅ Tasdiqlash — qurishni boshlang', '✅ Approve — start building')),
        h('button', { className: 'btn small', onclick: () => { box.hidden = !box.hidden; if (!box.hidden) ta.focus(); } }, T('✏️ O‘zgartirish', '✏️ Change')),
      ),
      box,
    );
  }

  // ------------------------------------------------------ boss & academy ----
  /** Boss panel in the inspector: control, patrol, what the Boss is doing, findings. */
  refreshBoss() {
    this.renderTopButtons();
    const el = this.el.bossPanel;
    if (!el?.isConnected) return;
    const boss = this.api.boss();
    const academy = this.api.academy();
    const findings = boss.findings.slice(0, 12);
    el.replaceChildren(
      ...compact([
      h('p', { className: 'desc' }, T('Siz — ofis direktori. Bossni o‘zingiz yurgizing yoki avto-tekshiruvga qo‘ying: u agentlar oldiga borib ishini tekshiradi, kamchiligi borlarni Claude Akademiyasiga yuboradi.', 'You are the office director. Walk the Boss yourself or put it on patrol: it visits agents, checks their work and sends those who need it to Claude Academy.')),
      h('p', { className: 'current' }, `📍 ${boss.status || '—'}`),
      h(
        'div',
        { className: 'actions' },
        h('button', { className: `btn${boss.control ? ' on' : ''}`, onclick: () => this.api.setBossControl(!boss.control) }, boss.control ? T('🎮 Boshqaruv yoqilgan', '🎮 Control on') : T('🎮 Bossni boshqarish', '🎮 Control the Boss')),
        h('button', { className: `btn${boss.patrol ? ' on' : ''}`, onclick: () => { if (boss.control) this.api.setBossControl(false); boss.setPatrol(!boss.patrol); } }, boss.patrol ? T('🕵️ Avto-tekshiruv yoqilgan', '🕵️ Patrol on') : T('🕵️ Avto-tekshiruv', '🕵️ Patrol')),
        h('button', { className: 'btn', onclick: () => { this.tab = 'academy'; this.showPanel('dir'); this.renderDirectory(); } }, `🎓 ${T('Akademiya', 'Academy')}`),
      ),
      boss.control ? h('p', { className: 'hint' }, T('⌨️ WASD yoki strelkalar — yurish, Shift — tez. Yerga bosing — o‘sha joyga boradi. Agentni bossangiz — oldiga borib tekshiradi.', '⌨️ WASD or arrows to walk, Shift to run. Click the ground to walk there. Click an agent to go and check their work.')) : null,
      h('div', { className: 'links' }, h('small', {}, `${T('Tekshiruvlar', 'Checks')} (${boss.findings.length}) · 🎓 ${T('navbatda', 'queued')}: ${academy.queue.length}`)),
      findings.length
        ? h(
            'div',
            { className: 'findings' },
            ...findings.map((f) => {
              const it = this.data.byId.get(f.agentId);
              return h(
                'button',
                { className: `finding ${f.decision}`, onclick: () => this.api.selectItem(f.agentId, true) },
                h('b', {}, `${f.decision === 'ok' ? '👍' : '🎓'} ${it?.name || f.agentId} · ${f.score}/100${f.exam ? ' · 🧪' : ''}`),
                f.issues.length ? h('small', {}, `− ${f.issues.slice(0, 2).join('; ')}`) : null,
                f.strengths.length ? h('small', { className: 'ok' }, `+ ${f.strengths.slice(0, 2).join('; ')}`) : null,
              );
            }),
          )
        : h('p', { className: 'muted' }, T('Hali tekshiruv yo‘q. “Avto-tekshiruv”ni yoqing yoki agentni tanlab “Boss tekshirsin” deng.', 'No checks yet. Turn on Patrol or pick an agent and press “Boss, check”.')),
      ]),
    );
  }

  refreshAcademy() {
    if (this.tab === 'academy' && this.el.list?.isConnected) this.renderAcademy();
    if (this.el.academyBlock?.isConnected && this.selected) this.el.academyBlock.replaceWith(this.academyBlock(this.selected.id));
    if (this.el.bossPanel?.isConnected) this.refreshBoss();
  }

  /** Academy level, learned skills and the Boss's buttons for one agent. */
  private academyBlock(id: string) {
    const ac = this.api.academy();
    const p = ac.of(id);
    const queued = ac.queue.some((q) => q.id === id);
    const inClass = ac.session?.students.some((a) => a.item?.id === id);
    const finding = this.api.boss().findings.find((f) => f.agentId === id);
    const el = h(
      'div',
      { className: 'academy-block' },
      h('small', {}, `🎓 ${T('Claude Akademiyasi', 'Claude Academy')}: ${T('daraja', 'level')} ${p.level} · ${p.xp % XP_PER_LEVEL}/${XP_PER_LEVEL} XP · ${p.lessons} ${T('dars', 'lessons')}${inClass ? ` · ${T('hozir darsda', 'in class now')}` : queued ? ` · ${T('navbatda', 'queued')}` : ''}`),
      p.learned.length
        ? h('div', { className: 'chips' }, ...p.learned.slice(-10).map((sid) => { const sk = this.data.byId.get(sid); return sk ? h('button', { className: 'chip small', onclick: () => this.api.selectItem(sid, true) }, `📘 ${sk.name}`) : null; }).filter(Boolean) as HTMLElement[])
        : null,
      finding
        ? h('p', { className: `finding-line ${finding.decision}` }, `${finding.decision === 'ok' ? '👍' : '🧐'} ${T('Boss bahosi', 'Boss score')}: ${finding.score}/100${finding.exam ? ` — 🧪 “${finding.exam.question.slice(0, 90)}” → ${finding.exam.score}/10` : ''}${finding.issues.length ? ` · ${finding.issues[0]}` : ''}`)
        : null,
      finding?.exam ? h('details', {}, h('summary', {}, T('Imtihon javobi', 'Exam answer')), h('p', {}, finding.exam.answer), finding.exam.verdict ? h('p', { className: 'muted' }, finding.exam.verdict) : null) : null,
      h(
        'div',
        { className: 'actions' },
        h('button', { className: 'btn small', disabled: queued || inClass, onclick: () => { ac.enroll(id, T('siz yubordingiz', 'sent by you'), 'user'); } }, `🎓 ${T('Akademiyaga yuborish', 'Send to academy')}`),
        h('button', { className: 'btn small', onclick: () => this.api.inspect(id, false) }, `🧐 ${T('Boss tekshirsin', 'Boss, check')}`),
        h('button', { className: 'btn small', title: T('Boss savol beradi, agent javob beradi, hakam baholaydi (AI orqali)', 'The Boss asks, the agent answers, a grader scores (uses the AI)'), onclick: () => this.api.inspect(id, true) }, `🧪 ${T('Haqiqiy imtihon', 'Real exam')}`),
      ),
    );
    this.el.academyBlock = el;
    return el;
  }

  /** The Academy tab: the class now, who is queued, lesson notes and the best students. */
  private renderAcademy() {
    const ac = this.api.academy();
    const total = this.cast.actors.filter((a) => a.kind === 'agent').length;
    const s = ac.session;
    const phase = s ? { gather: T('o‘quvchilar yig‘ilmoqda', 'students arriving'), lecture: T('dars ketmoqda', 'lecture'), exam: T('imtihon', 'exam'), graduate: T('tabriklash', 'graduation') }[s.phase] : '';
    const d = s ? this.data.dept.get(s.dept) : undefined;
    const top = Object.entries(ac.progress)
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 12);
    const notes = Object.entries(ac.notes).sort((a, b) => b[1].at - a[1].at);
    this.el.list.replaceChildren(
      h(
        'div',
        { className: 'academy-panel' },
        h('p', { className: 'desc' }, T('Claude har bir bo‘limga o‘z sohasi bo‘yicha dars beradi. Boss tanlagan agentlar birinchi keladi, keyin kam o‘qiganlar — shu tarzda barcha agentlar o‘qiydi. O‘rganilgan skillar va dars konspekti agentning har bir keyingi vazifasiga qo‘shiladi.', 'Claude teaches every department its own field. Agents the Boss picked come first, then those who studied least — so every agent studies. Learned skills and lesson notes are added to the agent’s instructions for every future task.')),
        h('div', { className: 'stat-row' }, h('b', {}, `${ac.trained}/${total}`), h('span', {}, T(' agent kamida bitta darsda qatnashgan', ' agents attended at least one class')), h('span', { className: 'muted' }, ` · ${ac.sessions} ${T('dars', 'classes')}`)),
        h('div', { className: 'progress-bar' }, h('span', { style: { '--w': `${Math.round((100 * ac.trained) / Math.max(1, total))}%` } })),
        h('h4', {}, T('📚 Hozirgi dars', '📚 Class now')),
        s
          ? h(
              'div',
              { className: 'class-now' },
              h('b', {}, `${d?.emoji || ''} ${d ? (currentLang() === 'uz' ? d.uz : d.name) : s.dept} — ${phase}`),
              h('small', {}, s.topics.map((t2) => t2.name).join(' · ')),
              h('div', { className: 'chips' }, ...s.students.map((a) => h('button', { className: 'chip small', onclick: () => a.item && this.api.selectItem(a.item.id, true) }, a.name))),
              h('button', { className: 'btn small', onclick: () => { const tch = this.cast.teacher; if (tch) { this.api.selectActor(tch); this.api.focusActor(tch); } } }, T('👀 Darsni ko‘rish', '👀 Watch the class')),
            )
          : h('p', { className: 'muted' }, T('Tanaffus — keyingi dars tez orada.', 'Break — next class soon.')),
        h('h4', {}, `⏳ ${T('Navbat', 'Queue')} (${ac.queue.length})`),
        ac.queue.length
          ? h('div', { className: 'chips' }, ...ac.queue.slice(0, 30).map((q) => h('button', { className: 'chip small', title: q.reason, onclick: () => this.api.selectItem(q.id, true) }, `${q.by === 'boss' ? '🧐' : '👤'} ${this.data.byId.get(q.id)?.name || q.id}`)))
          : h('p', { className: 'muted' }, T('Navbat bo‘sh. Boss tekshiruvidan keyin yoki agent sahifasidagi “🎓 Akademiyaga yuborish” tugmasi bilan qo‘shiladi.', 'Empty. Agents join after a Boss check or with “🎓 Send to academy” on their page.')),
        h('label', { className: 'toggle' }, h('input', { type: 'checkbox', checked: ac.realLessons, onchange: (e: Event) => { ac.realLessons = (e.target as HTMLInputElement).checked; } }), T(' Claude dars konspektini haqiqatan yozsin (AI ulangan bo‘lsa)', ' Claude writes real lesson notes (when an AI is connected)')),
        h('h4', {}, `🏆 ${T('Eng yaxshi o‘quvchilar', 'Top students')}`),
        top.length
          ? h('ol', { className: 'top-students' }, ...top.map(([id, p]) => h('li', {}, h('button', { className: 'linkish', onclick: () => this.api.selectItem(id, true) }, this.data.byId.get(id)?.name || id), h('small', {}, ` — ${T('daraja', 'level')} ${p.level} · ${p.learned.length} skill`))))
          : h('p', { className: 'muted' }, T('Hali hech kim dars tugatmagan.', 'Nobody has finished a class yet.')),
        h('h4', {}, `📝 ${T('Dars konspektlari', 'Lesson notes')} (${notes.length})`),
        ...notes.slice(0, 6).map(([dept, n]) => {
          const dd = this.data.dept.get(dept);
          return h('details', {}, h('summary', {}, `${dd?.emoji || ''} ${dd ? (currentLang() === 'uz' ? dd.uz : dd.name) : dept}`), h('div', { className: 'md', html: renderMarkdown(n.text) }));
        }),
        h('h4', {}, `📖 ${T('Kurslar va kitoblar (kutubxonada)', 'Courses and books (in the library)')}`),
        h('div', { className: 'chips' }, ...this.data.registry.items.filter((i) => i.type === 'guide' && (i.source === 'agents-beginners' || i.source === 'agent-book')).slice(0, 40).map((g) => h('button', { className: 'chip small', title: g.description, onclick: () => this.api.selectItem(g.id, true) }, `📜 ${g.title || g.name}`))),
      ),
    );
  }

  /** Bring the chat into view (e.g. when the agents ask a question). */
  focusChat() {
    this.showPanel('feed');
    this.showPanelTab('chat');
    this.renderChat();
  }

  onMessage() {
    if (this.panel !== 'chat') this.unseenChat++;
    this.renderChat();
    this.renderTabLabels();
  }

  private runsTimer = 0;
  renderRunsSoon() {
    if (this.runsTimer) return;
    this.runsTimer = window.setTimeout(() => {
      this.runsTimer = 0;
      this.renderRuns();
    }, 250);
  }

  renderRuns() {
    this.renderTabLabels();
    const runs = this.crews.runs;
    if (!runs.length) {
      this.el.runsList.replaceChildren(h('div', { className: 'empty' }, T('Hali vazifa yo‘q. Pastdagi maydonga yozing.', 'No tasks yet. Type below.')));
      return;
    }
    this.el.runsList.replaceChildren(
      ...runs.map((run) => {
        const team = this.crews.team(run.teamId);
        const secs = Math.round(((run.finishedAt || Date.now()) - run.startedAt) / 1000);
        return h(
          'div',
          { className: `run ${run.status}`, style: { '--c': team?.color || '#888' } },
          h('div', { className: 'run-head' }, h('b', {}, `${KIND_ICON[run.kind]} ${run.title}`), h('small', {}, `${team?.emoji || ''} ${secs}s`)),
          h(
            'ol',
            { className: 'run-steps' },
            ...run.steps
              .filter((s) => s.status !== 'skip')
              .map((s) => {
                const it = this.data.byId.get(s.agentId);
                const icon = { wait: '○', run: '⏳', done: '✅', error: '⚠️', skip: '–' }[s.status];
                return h('li', { className: s.status }, h('span', {}, `${icon} ${s.label[currentLang()]}`), h('small', {}, ` ${it?.name || ''}${s.seconds ? ` · ${s.seconds}s` : ''}`), s.status === 'run' && s.live ? h('div', { className: 'live-text' }, s.live) : null);
              }),
          ),
          run.status === 'waiting' ? h('button', { className: 'btn primary small', onclick: () => this.showPanelTab('chat') }, T('❓ Savolga javob bering', '❓ Answer the question')) : null,
          run.result || run.status === 'running' ? h('button', { className: `btn small${run.status === 'done' ? ' primary' : ''}`, onclick: () => this.api.openRun(run) }, run.status === 'done' ? T('Natijani ochish', 'Open result') : T('👀 Jarayonni ko‘rish', '👀 Watch progress')) : null,
          run.status === 'error' ? h('p', { className: 'note' }, `⚠️ ${run.error || ''}`) : null,
          run.status === 'error' ? h('button', { className: 'btn primary small', onclick: () => this.crews.retry(run.id) }, T('🔁 Qayta urinish', '🔁 Retry')) : null,
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
        h('button', { className: `chip${this.graph.showInferred ? ' active' : ''}`, onclick: () => { this.graph.showInferred = !this.graph.showInferred; this.graph.refresh(this.graphSearch); this.setGraphMode(true); } }, `〰️ ${s.inferred}`),
        h('button', { className: 'chip', onclick: () => { this.api.selectItem(''); this.graph.overview(); } }, `🎯 ${s.zoomOut}`),
      ),
      h('h4', {}, s.godNodes),
      h('ol', { className: 'god' }, ...this.graph.godNodes().map((n) => h('li', {}, h('button', { className: 'linkish', onclick: () => this.api.selectItem(n.id, true) }, `${TYPE_ICON[n.t]} ${n.n}`), h('small', {}, ` ${n.deg}`)))),
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
        h('div', { className: 'insp-head' }, h('h2', {}, `❓ ${s.help}`), h('button', { className: 'x', onclick: () => this.closeModal(), 'aria-label': s.close }, '✕')),
        h('p', {}, s.helpText),
        h(
          'ul',
          {},
          h('li', {}, T('💬 “Salom hammaga” — agentlar javob beradi.', '💬 “Hi everyone” — agents reply.')),
          h('li', {}, T('🌐 “… veb-sayt qilib ber” — Coder jamoasi reja, baza, backend, frontend va test qiladi, sayt darhol ochiladi.', '🌐 “build a … website” — the Coder team plans, builds the database, backend and frontend, tests it, and opens the site.')),
          h('li', {}, T('✍️ 📎 bilan skrinshot + “tahlil qil” — Kontent jamoasi tahlil, 14 kunlik reja va 5 ta post tayyorlaydi.', '✍️ 📎 screenshot + “analyse” — the Content team returns an analysis, a 14-day plan and 5 posts.')),
          h('li', {}, T('👥 Jamoalar bo‘limida qaysi agent qaysi ishda eng zo‘r va tez ekanini ko‘rasiz.', '👥 The Teams tab shows which agent is best and fastest at each kind of job.')),
          h('li', {}, '🟢 = ', s.working, ' · 🔵 = 📘 skill · 🟡 = 💬 · 🟣 = 🕸️ · 🔴 = LIVE'),
        ),
        h('h4', {}, s.sources),
        h('ul', {}, ...src.map((x) => h('li', {}, h('a', { href: `https://github.com/${x.repo}`, target: '_blank', rel: 'noopener noreferrer' }, x.repo), ` — ${x.role} (${x.license})`))),
      ),
    );
  }

  toast(text: string, ms = 3000, action?: { label: string; fn: () => void }) {
    const el = this.el.toast;
    el.replaceChildren(h('span', {}, text), action ? h('button', { className: 'btn primary small', onclick: () => { el.hidden = true; action.fn(); } }, action.label) : '');
    el.hidden = false;
    clearTimeout((el as HTMLElement & { _t?: number })._t);
    (el as HTMLElement & { _t?: number })._t = window.setTimeout(() => (el.hidden = true), ms);
  }
}
