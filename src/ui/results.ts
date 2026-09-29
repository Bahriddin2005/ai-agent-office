// Full-screen result viewer for a finished crew run: the built website
// (live preview + plan, database, backend, frontend, QA), the content
// analysis (analysis, plan, posts) or a task report.
import type { OfficeData } from '../data';
import { currentLang } from '../i18n';
import type { ContentResult, CrewRun, Crews, TaskResult, WebsiteResult } from '../ai/crews';
import { compact, copyText, h, type Kid } from './dom';
import { renderMarkdown } from './markdown';
import { zip } from './zip';

type Save = (filename: string, data: Blob | string) => Promise<boolean>;
const uz = () => currentLang() === 'uz';
const T = (a: string, b: string) => (uz() ? a : b);
const arr = <T = Record<string, unknown>>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const str = (x: unknown) => (x === undefined || x === null ? '' : typeof x === 'string' ? x : Array.isArray(x) ? x.join(', ') : typeof x === 'object' ? JSON.stringify(x) : String(x));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9ʻʼ‘’'-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';

function code(name: string, text: string) {
  return h(
    'div',
    { className: 'code-file' },
    h('div', { className: 'code-head' }, h('b', {}, name), h('button', { className: 'chip', onclick: async (e: Event) => { const ok = await copyText(text); (e.target as HTMLElement).textContent = ok ? '✓' : '⚠'; } }, T('Nusxa', 'Copy'))),
    h('pre', {}, h('code', {}, text)),
  );
}

function list(items: unknown, empty = '—') {
  const xs = arr<unknown>(items);
  if (!xs.length) return h('p', { className: 'muted' }, empty);
  return h('ul', {}, ...xs.map((x) => h('li', {}, str(typeof x === 'object' && x && 'name' in (x as object) ? `${(x as { name: string }).name}${(x as { detail?: string; note?: string; purpose?: string }).detail || (x as { purpose?: string }).purpose ? ' — ' + ((x as { detail?: string }).detail || (x as { purpose?: string }).purpose) : ''}` : x))));
}

function swatches(colors: unknown) {
  const xs = arr<string>(colors).filter((c) => /^#[0-9a-f]{3,8}$/i.test(String(c).trim()));
  if (!xs.length) return null;
  return h('div', { className: 'swatches' }, ...xs.map((c) => h('span', { style: { '--c': c }, title: c }, c)));
}

function table(rows: Record<string, unknown>[], cols: [string, string][]) {
  if (!rows.length) return h('p', { className: 'muted' }, '—');
  return h(
    'div',
    { className: 'table-wrap' },
    h('table', {}, h('thead', {}, h('tr', {}, ...cols.map(([, label]) => h('th', {}, label)))), h('tbody', {}, ...rows.map((r) => h('tr', {}, ...cols.map(([k]) => h('td', {}, str(r[k]))))))),
  );
}

export class ResultsView {
  readonly el: HTMLDivElement;
  private run: CrewRun | null = null;
  private tab = '';

  constructor(
    readonly data: OfficeData,
    readonly crews: Crews,
    readonly save: Save,
    readonly focusAgent: (id: string) => void,
  ) {
    this.el = h('div', { className: 'results', hidden: true });
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden) this.close();
    });
  }

  close() {
    this.el.hidden = true;
    this.el.replaceChildren();
  }

  open(run: CrewRun, tab?: string) {
    this.run = run;
    const r = run.result;
    this.tab = tab || (r?.kind === 'website' ? 'preview' : r?.kind === 'content' ? 'analysis' : 'answer');
    this.render();
    this.el.hidden = false;
  }

  private tabs(): [string, string][] {
    const r = this.run?.result;
    if (!r) return [['steps', T('Jarayon', 'Steps')]];
    if (r.kind === 'website')
      return [
        ['preview', T('🌐 Sayt', '🌐 Site')],
        ['plan', T('🧭 Reja', '🧭 Plan')],
        ['db', T('🗄️ Baza', '🗄️ Database')],
        ['backend', '⚙️ Backend'],
        ['frontend', '🎨 Frontend'],
        ['qa', '✅ QA'],
        ['summary', T('📝 Hisobot', '📝 Report')],
      ];
    if (r.kind === 'content')
      return [
        ['analysis', T('📊 Tahlil', '📊 Analysis')],
        ['strategy', T('🧭 Strategiya', '🧭 Strategy')],
        ['plan', T('🗓️ Kontent reja', '🗓️ Content plan')],
        ['posts', T('✍️ Postlar', '✍️ Posts')],
        ['summary', T('📝 Hisobot', '📝 Report')],
      ];
    return [
      ['answer', T('📄 Natija', '📄 Result')],
      ['plan', T('🧭 Reja', '🧭 Plan')],
      ['review', T('✅ Tekshiruv', '✅ Review')],
    ];
  }

  private render() {
    const run = this.run!;
    const r = run.result;
    const secs = run.finishedAt ? Math.round((run.finishedAt - run.startedAt) / 1000) : 0;
    const team = this.crews.team(run.teamId);
    const engine = run.engine === 'server' ? 'Claude Code CLI' : run.engine === 'claude' ? 'Claude (claude.ai)' : T('simulyatsiya', 'simulation');
    const steps = h(
      'div',
      { className: 'res-steps' },
      ...run.steps.filter((s) => s.status !== 'skip').map((s) => {
        const it = this.data.byId.get(s.agentId);
        const d = it ? this.data.dept.get(it.dept) : undefined;
        return h(
          'button',
          { className: `res-step ${s.status}`, style: { '--c': d?.color || '#888' }, onclick: () => this.focusAgent(s.agentId), title: it?.description || '' },
          h('span', { className: 'dot' }),
          h('span', {}, h('b', {}, s.label[currentLang()]), h('small', {}, `${it?.name || s.agentId}${s.seconds ? ` · ${s.seconds}s` : ''}`)),
        );
      }),
    );
    const head = h(
      'div',
      { className: 'res-head' },
      h(
        'div',
        { className: 'res-title' },
        h('small', {}, `${team?.emoji || ''} ${team ? team.name[currentLang()] : ''} · ${engine} · ${secs}s`),
        h('h2', {}, run.title),
      ),
      h('div', { className: 'res-actions' }, ...this.actions(run)),
      h('button', { className: 'x', onclick: () => this.close(), 'aria-label': T('Yopish', 'Close') }, '✕'),
    );
    const tabs = h(
      'div',
      { className: 'res-tabs', role: 'tablist' },
      ...this.tabs().map(([k, label]) => h('button', { className: `tab${this.tab === k ? ' active' : ''}`, role: 'tab', onclick: () => { this.tab = k; this.render(); } }, label)),
    );
    let body: Kid = null;
    if (!r) body = h('p', { className: 'muted' }, run.error || T('Natija yo‘q', 'No result'));
    else if (r.kind === 'website') body = this.website(r);
    else if (r.kind === 'content') body = this.content(r, run);
    else body = this.task(r);
    this.el.replaceChildren(h('div', { className: 'res-card' }, head, steps, tabs, h('div', { className: 'res-body' }, body)));
  }

  private actions(run: CrewRun): Node[] {
    const r = run.result;
    const btn = (label: string, fn: () => void) => h('button', { className: 'btn', onclick: fn }, label);
    if (!r) return [];
    if (r.kind === 'website') {
      const name = slug(String(r.plan.title || run.title));
      return compact([
        r.previewUrl ? h('a', { className: 'btn', href: r.previewUrl, target: '_blank', rel: 'noopener' }, T('↗ Yangi oynada', '↗ New tab')) : null,
        btn('⬇️ index.html', () => this.save(`${name}.html`, r.html)),
        btn(T('⬇️ Loyiha (.zip)', '⬇️ Project (.zip)'), () => this.save(`${name}.zip`, zip(r.files, name))),
      ]) as Node[];
    }
    if (r.kind === 'content') {
      const rows = arr(r.strategy.plan);
      const csv = ['day,pillar,format,topic,hook,cta', ...rows.map((p) => ['day', 'pillar', 'format', 'topic', 'hook', 'cta'].map((k) => `"${str(p[k]).replace(/"/g, '""')}"`).join(','))].join('\n');
      return [btn(T('⬇️ Kontent reja (.csv)', '⬇️ Content plan (.csv)'), () => this.save('content-plan.csv', '﻿' + csv)), btn(T('⬇️ Hisobot (.md)', '⬇️ Report (.md)'), () => this.save('content-report.md', this.contentMarkdown(r)))];
    }
    return [btn('⬇️ .md', () => this.save('result.md', (r as TaskResult).answer)), btn(T('📋 Nusxa', '📋 Copy'), () => copyText((r as TaskResult).answer))];
  }

  // -------------------------------------------------------------- website --
  private website(r: WebsiteResult): Node {
    const f = r.files;
    switch (this.tab) {
      case 'preview': {
        const frame = h('iframe', { className: 'site-frame', title: 'preview', sandbox: 'allow-scripts allow-forms allow-modals allow-popups' }) as HTMLIFrameElement;
        if (r.previewUrl) frame.src = r.previewUrl;
        else frame.srcdoc = r.html;
        const wrap = h('div', { className: 'site-wrap desktop' }, frame);
        return h(
          'div',
          {},
          h(
            'div',
            { className: 'device-bar' },
            h('button', { className: 'chip active', onclick: (e: Event) => { wrap.className = 'site-wrap desktop'; this.toggle(e); } }, '🖥️'),
            h('button', { className: 'chip', onclick: (e: Event) => { wrap.className = 'site-wrap phone'; this.toggle(e); } }, '📱'),
            h('button', { className: 'chip', onclick: () => { if (r.previewUrl) frame.src = r.previewUrl; else frame.srcdoc = r.html; } }, T('↻ Qayta yuklash', '↻ Reload')),
            r.workspaceDir ? h('small', { className: 'muted' }, `📁 ${r.workspaceDir}`) : h('small', { className: 'muted' }, T('Maʼlumotlar brauzerda saqlanadi (demo).', 'Data is kept in the browser (demo).')),
          ),
          ...r.notes.map((n) => h('p', { className: 'note' }, `⚠️ ${n}`)),
          wrap,
        );
      }
      case 'plan': {
        const p = r.plan;
        const entities = arr(p.entities);
        return h(
          'div',
          { className: 'grid2' },
          h('section', {}, h('h3', {}, T('Maqsad', 'Goal')), h('p', {}, str(p.summary)), h('h3', {}, T('Foydalanuvchilar', 'Users')), list(p.audience), h('h3', {}, T('Funksiyalar', 'Features')), list(p.features)),
          h(
            'section',
            {},
            h('h3', {}, T('Sahifalar', 'Pages')),
            list(p.pages),
            h('h3', {}, T('Texnologiyalar', 'Stack')),
            h('p', {}, Object.entries((p.stack as Record<string, string>) || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')),
            h('h3', {}, T('Bosqichlar', 'Milestones')),
            list(p.milestones),
          ),
          h('section', { className: 'span2' }, h('h3', {}, 'API'), table(arr(p.api), [['method', 'Method'], ['path', 'Path'], ['purpose', T('Vazifasi', 'Purpose')]])),
          h('section', { className: 'span2' }, h('h3', {}, T('Maʼlumotlar modeli', 'Data model')), ...entities.map((e) => h('div', {}, h('h4', {}, str(e.name)), table(arr(e.fields), [['name', T('Maydon', 'Field')], ['type', T('Turi', 'Type')], ['note', T('Izoh', 'Note')]])))),
        );
      }
      case 'db':
        return h('div', {}, ...Object.entries(f).filter(([k]) => /\.sql$/.test(k)).map(([k, v]) => code(k, v)));
      case 'backend':
        return h('div', {}, ...Object.entries(f).filter(([k]) => /(server\.js|package\.json)$/.test(k)).map(([k, v]) => code(k, v)));
      case 'frontend':
        return code('public/index.html', r.html);
      case 'qa': {
        const qa = r.qa;
        if (!qa) return h('p', { className: 'muted' }, T('QA natijasi yo‘q', 'No QA result'));
        return h(
          'div',
          {},
          h('div', { className: 'score' }, h('b', {}, String(qa.score ?? '—')), h('span', {}, '/100')),
          qa.summary ? h('p', {}, qa.summary) : null,
          h('h3', {}, T('Tekshiruvlar', 'Checks')),
          h('ul', { className: 'checks' }, ...arr<{ name: string; ok: boolean; note?: string }>(qa.checks).map((c) => h('li', { className: c.ok ? 'ok' : 'bad' }, `${c.ok ? '✅' : '❌'} ${c.name}${c.note ? ' — ' + c.note : ''}`))),
          h('h3', {}, T('Muammolar', 'Issues')),
          h('ul', {}, ...arr<{ severity: string; note: string }>(qa.issues).map((i) => h('li', {}, h('span', { className: `sev ${i.severity}` }, i.severity), ' ', i.note))),
        );
      }
      default:
        return h('div', {}, h('div', { className: 'md', html: renderMarkdown(r.summary || '') }), h('div', { className: 'md', html: renderMarkdown(r.files['README.md'] || '') }));
    }
  }

  private toggle(e: Event) {
    const b = e.currentTarget as HTMLElement;
    b.parentElement?.querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
  }

  // -------------------------------------------------------------- content --
  private content(r: ContentResult, run: CrewRun): Node {
    const a = r.analysis;
    const s = r.strategy;
    const vs = (a.visualStyle as Record<string, unknown>) || {};
    switch (this.tab) {
      case 'analysis':
        return h(
          'div',
          { className: 'grid2' },
          run.imageUrls.length ? h('section', { className: 'span2 shots' }, ...run.imageUrls.map((u) => h('img', { src: u, alt: 'screenshot' }))) : null,
          h(
            'section',
            {},
            h('h3', {}, T('Akkaunt', 'Account')),
            h('dl', {}, ...(['platform', 'account', 'niche', 'audience', 'positioning', 'tone', 'cadence'] as const).flatMap((k) => (a[k] ? [h('dt', {}, k), h('dd', {}, str(a[k]))] : []))),
            arr(a.metrics).length ? h('div', { className: 'chips' }, ...arr(a.metrics).map((m) => h('span', { className: 'chip' }, `${str(m.name)}: ${str(m.value)}`))) : null,
          ),
          h(
            'section',
            {},
            h('h3', {}, T('Vizual uslub', 'Visual style')),
            swatches(vs.palette),
            h('p', {}, str(vs.typography)),
            h('p', {}, str(vs.layout)),
            h('p', {}, str(vs.imagery)),
          ),
          h('section', {}, h('h3', {}, T('Kontent ustunlari', 'Content pillars')), ...arr(a.contentPillars).map((p) => h('div', { className: 'bar' }, h('span', { style: { '--w': str(p.share).replace(/[^0-9.]/g, '') + '%' } }), h('b', {}, str(p.name)), h('small', {}, ` ${str(p.share)} — ${str(p.examples)}`)))),
          h('section', {}, h('h3', {}, T('Formatlar', 'Formats')), table(arr(a.formats), [['type', T('Turi', 'Type')], ['share', '%'], ['note', T('Izoh', 'Note')]])),
          h('section', {}, h('h3', {}, T('Kuchli tomonlar', 'Strengths')), list(a.strengths), h('h3', {}, T('Zaif tomonlar', 'Weaknesses')), list(a.weaknesses)),
          h('section', {}, h('h3', {}, T('Imkoniyatlar', 'Opportunities')), list(a.opportunities), h('h3', {}, 'Hooks'), list(a.hooks)),
        );
      case 'strategy': {
        const tone = (s.tone as Record<string, unknown>) || {};
        const visual = (s.visual as Record<string, unknown>) || {};
        const sched = (s.schedule as Record<string, unknown>) || {};
        return h(
          'div',
          { className: 'grid2' },
          h('section', {}, h('h3', {}, T('Pozitsiya', 'Positioning')), h('p', {}, str(s.positioning)), h('h3', {}, T('Auditoriya', 'Audience')), h('p', {}, str(s.audience))),
          h('section', {}, h('h3', {}, T('Ustunlar', 'Pillars')), list(arr(s.pillars).map((p) => ({ name: `${str(p.name)} (${str(p.share)})`, detail: str(p.why) })))),
          h('section', {}, h('h3', {}, T('Ohang: qiling', 'Tone: do')), list(tone.do), h('h3', {}, T('Ohang: qilmang', 'Tone: don’t')), list(tone.dont)),
          h('section', {}, h('h3', {}, T('Vizual', 'Visual')), swatches(visual.palette), h('p', {}, str(visual.fonts)), list(visual.templates), h('h3', {}, T('Jadval', 'Schedule')), h('p', {}, `${str(sched.postsPerWeek)} / ${T('hafta', 'week')} · ${str(sched.bestTimes)}`)),
          h('section', { className: 'span2' }, h('h3', {}, 'KPI'), list(s.kpis)),
        );
      }
      case 'plan':
        return table(arr(s.plan), [['day', T('Kun', 'Day')], ['pillar', T('Ustun', 'Pillar')], ['format', T('Format', 'Format')], ['topic', T('Mavzu', 'Topic')], ['hook', 'Hook'], ['cta', 'CTA']]);
      case 'posts':
        return h(
          'div',
          { className: 'posts' },
          ...r.posts.map((p) => {
            const caption = `${str(p.hook)}\n\n${str(p.caption)}\n\n${arr<string>(p.hashtags).map((x) => (String(x).startsWith('#') ? x : `#${x}`)).join(' ')}`;
            return h(
              'article',
              { className: 'post' },
              h('div', { className: 'post-head' }, h('b', {}, str(p.title)), h('span', { className: 'chip small' }, str(p.format))),
              h('p', { className: 'hook' }, str(p.hook)),
              h('p', { className: 'caption' }, str(p.caption)),
              h('p', { className: 'tags' }, arr<string>(p.hashtags).map((x) => (String(x).startsWith('#') ? x : `#${x}`)).join(' ')),
              p.visual ? h('p', { className: 'muted' }, `🎨 ${str(p.visual)}`) : null,
              h('button', { className: 'chip', onclick: async (e: Event) => { const ok = await copyText(caption); (e.target as HTMLElement).textContent = ok ? '✓' : '⚠'; } }, T('📋 Matnni nusxalash', '📋 Copy text')),
            );
          }),
        );
      default:
        return h('div', { className: 'md', html: renderMarkdown(r.summary || '') });
    }
  }

  private contentMarkdown(r: ContentResult) {
    const a = r.analysis;
    const s = r.strategy;
    return [
      `# ${T('Kontent tahlili va reja', 'Content analysis and plan')}`,
      '',
      r.summary,
      '',
      `## ${T('Tahlil', 'Analysis')}`,
      ...['platform', 'account', 'niche', 'audience', 'positioning', 'tone'].map((k) => `- **${k}**: ${str(a[k])}`),
      '',
      `## ${T('Kontent reja', 'Content plan')}`,
      '| Kun | Ustun | Format | Mavzu | Hook |',
      '|---|---|---|---|---|',
      ...arr(s.plan).map((p) => `| ${str(p.day)} | ${str(p.pillar)} | ${str(p.format)} | ${str(p.topic)} | ${str(p.hook)} |`),
      '',
      `## ${T('Postlar', 'Posts')}`,
      ...r.posts.flatMap((p) => [`### ${str(p.title)}`, str(p.hook), '', str(p.caption), '', arr<string>(p.hashtags).join(' '), '']),
    ].join('\n');
  }

  // ----------------------------------------------------------------- task --
  private task(r: TaskResult): Node {
    if (this.tab === 'plan') {
      const p = r.plan || {};
      return h('div', {}, h('h3', {}, str(p.goal)), list(p.steps), h('h3', {}, T('Natija', 'Deliverable')), h('p', {}, str(p.deliverable)));
    }
    if (this.tab === 'review') {
      const v = r.review || {};
      return h('div', {}, h('div', { className: 'score' }, h('b', {}, String(v.score ?? '—')), h('span', {}, '/100')), h('h3', {}, T('Kuchli tomonlar', 'Strengths')), list(v.strengths), h('h3', {}, T('Yaxshilash mumkin', 'Could improve')), list(v.improvements));
    }
    return h('div', { className: 'md', html: renderMarkdown(r.answer) });
  }
}
