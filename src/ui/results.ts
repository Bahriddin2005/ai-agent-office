// Full-screen result viewer for a crew run. While the crew works it shows the
// live progress; a site opens as soon as its first version exists. For sites:
// live preview (desktop/phone, full screen, new tab), marking up the preview
// (pick elements or draw areas, add notes, catch JavaScript errors) and asking
// the team to fix it, version history, plan, code of every file, QA and the
// report. Content and task runs have their own tabs.
import type { OfficeData } from '../data';
import { currentLang } from '../i18n';
import type { ContentResult, CrewRun, Crews, Mark, TaskResult, WebsiteResult } from '../ai/crews';
import { compact, copyText, h, type Kid } from './dom';
import { renderMarkdown } from './markdown';
import { zip } from './zip';

type Save = (filename: string, data: Blob | string) => Promise<boolean>;
const uz = () => currentLang() === 'uz';
const T = (a: string, b: string) => (uz() ? a : b);
const arr = <T = Record<string, unknown>>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const str = (x: unknown): string => (x === undefined || x === null ? '' : typeof x === 'string' ? x : Array.isArray(x) ? x.map(str).join(', ') : typeof x === 'object' ? Object.values(x as Record<string, unknown>).filter((v) => typeof v === 'string' || typeof v === 'number').join(' — ') : String(x));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9ʻʼ‘’'-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';

/**
 * Injected into the preview: lets the user pick elements or draw areas (drawn
 * inside the page so they scroll with it) and reports JavaScript errors.
 */
const HELPER = `<script data-office-helper>(()=>{const P=parent;let mode='off',n=0,drag=null,hover=null;
const css=document.createElement('style');css.textContent='.__om{position:absolute;border:3px solid #ff3b5c;border-radius:6px;pointer-events:none;z-index:2147483646;box-shadow:0 0 0 2px #fff;background:rgba(255,59,92,.08)}.__om b{position:absolute;top:-13px;left:-13px;background:#ff3b5c;color:#fff;font:700 12px/22px system-ui,sans-serif;min-width:22px;height:22px;border-radius:11px;text-align:center;box-shadow:0 0 0 2px #fff}.__oh{outline:2px dashed #ff3b5c!important;outline-offset:2px!important;cursor:crosshair!important}';
(document.head||document.documentElement).appendChild(css);
const sel=e=>{const p=[];for(let x=e;x&&x.nodeType===1&&p.length<4&&x!==document.body;x=x.parentElement){let s=x.tagName.toLowerCase();if(x.id){p.unshift(s+'#'+x.id);break}const c=[...x.classList].filter(c=>!c.startsWith('__o')).slice(0,2);if(c.length)s+='.'+c.join('.');const sib=x.parentElement?[...x.parentElement.children].filter(y=>y.tagName===x.tagName):[];if(sib.length>1)s+=':nth-of-type('+(sib.indexOf(x)+1)+')';p.unshift(s)}return p.join(' > ')};
const info=e=>({selector:sel(e),tag:e.tagName.toLowerCase(),text:(e.innerText||e.value||e.alt||e.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,200),html:e.outerHTML.replace(/\\s+/g,' ').slice(0,500)});
const box=(r,num)=>{const d=document.createElement('div');d.className='__om';Object.assign(d.style,{left:r.left+scrollX-4+'px',top:r.top+scrollY-4+'px',width:r.width+8+'px',height:r.height+8+'px'});d.innerHTML='<b>'+num+'</b>';document.body.appendChild(d);return d};
addEventListener('message',ev=>{const d=ev.data||{};if(d.__office==='clear'){document.querySelectorAll('.__om').forEach(x=>x.remove());n=0;return}if(d.__office!=='mode')return;mode=d.mode;document.documentElement.style.cursor=mode==='off'?'':'crosshair';if(hover){hover.classList.remove('__oh');hover=null}});
document.addEventListener('mouseover',e=>{if(mode!=='pick')return;if(hover)hover.classList.remove('__oh');hover=e.target;hover.classList.add('__oh')},true);
const stop=e=>{if(mode==='off')return false;e.preventDefault();e.stopPropagation();return true};
document.addEventListener('click',e=>{if(!stop(e)||mode!=='pick')return;const t=e.target;t.classList.remove('__oh');n++;box(t.getBoundingClientRect(),n);P.postMessage({__office:'mark',kind:'element',n,...info(t)},'*')},true);
const down=(x,y)=>{drag={x,y,el:box({left:x,top:y,width:0,height:0},n+1)}};
const move=(x2,y2)=>{if(!drag)return;const x=Math.min(drag.x,x2),y=Math.min(drag.y,y2);Object.assign(drag.el.style,{left:x+scrollX-4+'px',top:y+scrollY-4+'px',width:Math.abs(x2-drag.x)+8+'px',height:Math.abs(y2-drag.y)+8+'px'})};
const up=(x2,y2)=>{if(!drag)return;const r={x:Math.min(drag.x,x2),y:Math.min(drag.y,y2),w:Math.abs(x2-drag.x),h:Math.abs(y2-drag.y)};if(r.w<8||r.h<8){drag.el.remove();drag=null;return}n++;const inside=[...document.body.querySelectorAll('*')].filter(x=>{if(x.classList.contains('__om')||x.parentElement&&x.parentElement.classList.contains('__om'))return false;const b=x.getBoundingClientRect();return b.width>0&&b.left>=r.x-2&&b.top>=r.y-2&&b.right<=r.x+r.w+2&&b.bottom<=r.y+r.h+2});const top=inside.filter(x=>!inside.some(y=>y!==x&&y.contains(x))).slice(0,6);const main=top.length===1?top[0]:document.elementFromPoint(r.x+r.w/2,r.y+r.h/2);drag=null;const i=main?info(main):{};P.postMessage({__office:'mark',kind:'area',n,...i,text:top.map(x=>(x.innerText||'').trim().replace(/\\s+/g,' ')).filter(Boolean).join(' | ').slice(0,300)||i.text||''},'*')};
document.addEventListener('mousedown',e=>{if(mode!=='area')return;stop(e);down(e.clientX,e.clientY)},true);
document.addEventListener('mousemove',e=>move(e.clientX,e.clientY),true);
document.addEventListener('mouseup',e=>{if(drag){stop(e);up(e.clientX,e.clientY)}},true);
document.addEventListener('touchstart',e=>{if(mode!=='area')return;e.preventDefault();const t=e.touches[0];down(t.clientX,t.clientY)},{capture:true,passive:false});
document.addEventListener('touchmove',e=>{if(!drag)return;e.preventDefault();const t=e.touches[0];move(t.clientX,t.clientY)},{capture:true,passive:false});
document.addEventListener('touchend',e=>{if(!drag)return;const t=e.changedTouches[0];up(t.clientX,t.clientY)},true);
addEventListener('error',e=>P.postMessage({__office:'error',message:String(e.message||'error')+(e.lineno?' (line '+e.lineno+')':'')},'*'));
addEventListener('unhandledrejection',e=>P.postMessage({__office:'error',message:'Promise: '+String(e.reason&&e.reason.message||e.reason)},'*'));
const ce=console.error;console.error=(...a)=>{P.postMessage({__office:'error',message:a.map(x=>x&&x.message||String(x)).join(' ').slice(0,300)},'*');ce.apply(console,a)};
})();<\/script>`;

function withHelper(html: string) {
  const m = /<head[^>]*>/i.exec(html);
  if (m) return html.slice(0, m.index + m[0].length) + HELPER + html.slice(m.index + m[0].length);
  return HELPER + html;
}

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
  return h('ul', {}, ...xs.map((x) => h('li', {}, str(x))));
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
  private file = '';
  /** preview state (kept across re-renders of the same run) */
  private marks: Mark[] = [];
  private errors: string[] = [];
  private note = '';
  private mode: 'off' | 'pick' | 'area' = 'off';
  private viewVersion = 0;
  private device: 'desktop' | 'phone' = 'desktop';
  private full = false;
  private frame: HTMLIFrameElement | null = null;
  private shownHtml = '';
  private bodyKey = '';
  private card: HTMLElement | null = null;

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
      if (e.key === 'Escape' && !this.el.hidden) {
        if (this.mode !== 'off') this.setMode('off');
        else if (this.full) this.setFull(false);
        else this.close();
      }
    });
    window.addEventListener('message', (e) => {
      if (!this.frame || e.source !== this.frame.contentWindow) return;
      const d = e.data as { __office?: string; kind?: 'element' | 'area'; n?: number; message?: string; selector?: string; tag?: string; text?: string; html?: string };
      if (d?.__office === 'mark') {
        this.marks.push({ n: d.n || this.marks.length + 1, kind: d.kind || 'element', selector: d.selector, tag: d.tag, text: d.text, html: d.html });
        this.renderFeedback();
      } else if (d?.__office === 'error' && d.message && !this.errors.includes(d.message) && this.errors.length < 20) {
        this.errors.push(d.message);
        this.renderFeedback();
      }
    });
  }

  get openRun() {
    return this.el.hidden ? null : this.run;
  }

  close() {
    this.el.hidden = true;
    this.el.replaceChildren();
    this.frame = null;
    this.card = null;
    this.bodyKey = '';
  }

  open(run: CrewRun, tab?: string) {
    const same = this.run === run && !this.el.hidden;
    if (!same) {
      this.marks = [];
      this.errors = [];
      this.note = '';
      this.mode = 'off';
      this.viewVersion = 0;
      this.file = '';
    }
    this.run = run;
    const r = run.result;
    this.tab = tab || (same ? this.tab : '') || (r?.kind === 'website' ? 'preview' : r?.kind === 'content' ? 'analysis' : r ? 'answer' : 'steps');
    this.bodyKey = '';
    this.render();
    this.el.hidden = false;
  }

  /** The run changed (progress, new version): update what is visible without reloading the preview. */
  refresh(run: CrewRun) {
    if (this.el.hidden || this.run !== run) return;
    if (!this.tabs().some(([k]) => k === this.tab)) this.tab = this.tabs()[0][0];
    this.render();
  }

  private tabs(): [string, string][] {
    const r = this.run?.result;
    if (!r) return [['steps', T('⏳ Jarayon', '⏳ Progress')]];
    if (r.kind === 'website')
      return [
        ['preview', r.project ? T('🌐 Ilova', '🌐 App') : T('🌐 Sayt', '🌐 Site')],
        ['plan', T('🧭 Reja', '🧭 Plan')],
        ['code', T('💻 Kod', '💻 Code')],
        ['qa', '✅ QA'],
        ['summary', T('📝 Hisobot', '📝 Report')],
        ['steps', T('⏳ Jarayon', '⏳ Progress')],
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
    const secs = Math.round(((run.finishedAt || Date.now()) - run.startedAt) / 1000);
    const team = this.crews.team(run.teamId);
    const engine = run.engine === 'server' ? 'Claude Code CLI' : run.engine === 'claude' ? 'Claude (claude.ai)' : T('simulyatsiya', 'simulation');
    const status =
      run.status === 'running' ? T('⏳ ishlamoqda', '⏳ working') : run.status === 'waiting' ? T('❓ javobingiz kutilmoqda (chatda)', '❓ waiting for your answer (in chat)') : run.status === 'error' ? T('⚠️ xato', '⚠️ error') : T('✅ tayyor', '✅ done');
    if (!this.card || !this.card.isConnected) {
      this.card = h('div', { className: 'res-card' }, h('div', { className: 'res-head' }), h('div', { className: 'res-steps' }), h('div', { className: 'res-tabs', role: 'tablist' }), h('div', { className: 'res-body' }));
      this.el.replaceChildren(this.card);
      this.bodyKey = '';
    }
    const [headEl, stepsEl, tabsEl, bodyEl] = [...this.card.children] as HTMLElement[];
    this.card.classList.toggle('full', this.full);
    stepsEl.replaceChildren(
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
    headEl.replaceChildren(
      h(
        'div',
        { className: 'res-title' },
        h('small', {}, `${team?.emoji || ''} ${team ? team.name[currentLang()] : ''} · ${engine} · ${secs}s · ${status}`),
        h('h2', {}, run.title),
      ),
      h('div', { className: 'res-actions' }, ...this.actions(run)),
      h('button', { className: 'x', onclick: () => this.close(), 'aria-label': T('Yopish', 'Close') }, '✕'),
    );
    tabsEl.replaceChildren(
      ...this.tabs().map(([k, label]) => h('button', { className: `tab${this.tab === k ? ' active' : ''}`, role: 'tab', onclick: () => { this.tab = k; this.bodyKey = ''; this.render(); } }, label)),
    );
    // Rebuild the body only when what it shows changed, so the preview is not reloaded on every progress tick.
    const key = `${this.tab}|${r?.kind || ''}|${r?.kind === 'website' ? `${r.versions.length}|${r.html.length}|${r.partial ? 1 : 0}|${this.viewVersion}|${this.file}|${this.device}|${this.tab === 'steps' || this.tab === 'qa' || this.tab === 'summary' ? run.steps.map((s) => s.status + (s.live || '')).join() : ''}` : r ? 'x' : run.steps.map((s) => s.status + (s.live || '')).join()}`;
    if (key !== this.bodyKey) {
      this.bodyKey = key;
      let content: Kid = null;
      if (this.tab === 'steps') content = this.progress(run);
      else if (!r) content = h('p', { className: 'muted' }, run.error || T('Natija yo‘q', 'No result'));
      else if (r.kind === 'website') content = this.website(r, run);
      else if (r.kind === 'content') content = this.content(r, run);
      else content = this.task(r);
      bodyEl.replaceChildren(...compact([content]));
    } else if (r?.kind === 'website' && this.tab === 'preview') {
      this.renderFeedback();
    }
  }

  private actions(run: CrewRun): Node[] {
    const r = run.result;
    const btn = (label: string, fn: () => void, cls = 'btn') => h('button', { className: cls, onclick: fn }, label);
    const out: Node[] = [];
    if (run.status === 'error') out.push(btn(T('🔁 Qayta urinish', '🔁 Retry'), () => this.crews.retry(run.id), 'btn primary'));
    if (!r) return out;
    if (r.kind === 'website') {
      const name = slug(String(r.plan.title || run.title));
      return [
        ...out,
        ...(compact([
          r.previewUrl ? h('a', { className: 'btn', href: r.previewUrl, target: '_blank', rel: 'noopener' }, T('↗ Brauzerda ochish', '↗ Open in browser')) : null,
          btn('⬇️ index.html', () => this.save(`${name}.html`, r.html)),
          btn(T('⬇️ Loyiha (.zip)', '⬇️ Project (.zip)'), () => this.save(`${name}.zip`, zip(r.files, name))),
        ]) as Node[]),
      ];
    }
    if (r.kind === 'content') {
      const rows = arr(r.strategy.plan);
      const csv = ['day,pillar,format,topic,hook,cta', ...rows.map((p) => ['day', 'pillar', 'format', 'topic', 'hook', 'cta'].map((k) => `"${str(p[k]).replace(/"/g, '""')}"`).join(','))].join('\n');
      return [...out, btn(T('⬇️ Kontent reja (.csv)', '⬇️ Content plan (.csv)'), () => this.save('content-plan.csv', '﻿' + csv)), btn(T('⬇️ Hisobot (.md)', '⬇️ Report (.md)'), () => this.save('content-report.md', this.contentMarkdown(r)))];
    }
    return [...out, btn('⬇️ .md', () => this.save('result.md', (r as TaskResult).answer)), btn(T('📋 Nusxa', '📋 Copy'), () => copyText((r as TaskResult).answer))];
  }

  /** Live view of who is doing what. */
  private progress(run: CrewRun) {
    return h(
      'div',
      { className: 'progress' },
      run.status === 'waiting' ? h('p', { className: 'note' }, T('❓ Agentlar sizga savol berdi yoki rejani tasdiqlashingizni kutmoqda — o‘ng tomondagi chatda javob bering.', '❓ The agents asked you something or wait for your approval — answer in the chat.')) : null,
      run.error ? h('p', { className: 'note' }, `⚠️ ${run.error}`) : null,
      h(
        'ol',
        { className: 'progress-list' },
        ...run.steps.map((s) => {
          const it = this.data.byId.get(s.agentId);
          const icon = { wait: '○', run: '⏳', done: '✅', error: '⚠️', skip: '–' }[s.status];
          return h(
            'li',
            { className: s.status },
            h('div', {}, h('b', {}, `${icon} ${s.label[currentLang()]}`), h('small', {}, ` — ${it?.name || s.agentId}${s.seconds ? ` · ${s.seconds}s` : ''}`)),
            s.status === 'run' && s.live ? h('div', { className: 'live-text' }, s.live) : null,
            s.status === 'done' && s.output ? h('details', {}, h('summary', {}, T('Agent javobi', 'Agent output')), h('pre', { className: 'out' }, s.output.slice(0, 6000))) : null,
            s.status === 'error' && s.output ? h('div', { className: 'note' }, s.output) : null,
          );
        }),
      ),
    );
  }

  // -------------------------------------------------------------- website --
  private setMode(mode: 'off' | 'pick' | 'area') {
    this.mode = mode;
    this.frame?.contentWindow?.postMessage({ __office: 'mode', mode }, '*');
    this.el.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    this.el.querySelector('.site-wrap')?.classList.toggle('marking', mode !== 'off');
  }

  private setFull(on: boolean) {
    this.full = on;
    this.card?.classList.toggle('full', on);
  }

  private feedbackEl: HTMLElement | null = null;

  private renderFeedback() {
    const box = this.feedbackEl;
    const run = this.run;
    const r = run?.result;
    if (!box || !run || !r || r.kind !== 'website') return;
    const busy = run.status === 'running' || run.status === 'waiting';
    const next = (r.versions.length || 1) + 1;
    const ta = h('textarea', {
      className: 'fb-text', rows: 3, value: this.note,
      placeholder: T('Nimani o‘zgartiraylik? Masalan: “1-tugmani yashil qil, 2-bo‘limga narxlar jadvalini qo‘sh, menyuni tepaga mahkamla”', 'What should change? E.g. “make button 1 green, add a price table to area 2, pin the menu to the top”'),
      oninput: (e: Event) => { this.note = (e.target as HTMLTextAreaElement).value; },
    }) as HTMLTextAreaElement;
    ta.value = this.note;
    box.replaceChildren(
      ...(compact([
      h('div', { className: 'fb-head' }, h('b', {}, T('✏️ Izoh va tuzatish', '✏️ Feedback & fixes')), h('small', { className: 'muted' }, T('Saytda element tanlang yoki hududni chizing, keyin nima qilish kerakligini yozing.', 'Pick elements or draw areas on the site, then say what to change.'))),
      this.marks.length
        ? h(
            'ol',
            { className: 'fb-marks' },
            ...this.marks.map((m, i) =>
              h(
                'li',
                {},
                h('span', { className: 'mark-n' }, String(m.n)),
                h('div', { className: 'mark-main' }, h('small', {}, `${m.kind === 'area' ? T('hudud', 'area') : `<${m.tag}>`} ${m.text ? `“${m.text.slice(0, 60)}”` : ''}`), h('input', { className: 'mark-note', placeholder: T('bu yerda nima qilish kerak?', 'what to do here?'), value: m.note || '', oninput: (e: Event) => { m.note = (e.target as HTMLInputElement).value; } })),
                h('button', { className: 'x small', 'aria-label': 'remove', onclick: () => { this.marks.splice(i, 1); this.renderFeedback(); } }, '✕'),
              ),
            ),
          )
        : null,
      this.errors.length
        ? h('div', { className: 'fb-errors' }, h('b', {}, `🐞 ${T('Saytda JavaScript xatolari', 'JavaScript errors in the site')} (${this.errors.length})`), h('ul', {}, ...this.errors.slice(0, 5).map((e) => h('li', {}, e))))
        : null,
      ta,
      h(
        'div',
        { className: 'fb-actions' },
        h(
          'button',
          {
            className: 'btn primary', disabled: busy,
            onclick: () => {
              const text = (this.note || '').trim();
              if (!text && !this.marks.length && !this.errors.length) {
                ta.focus();
                return;
              }
              void this.crews.revise(run.id, { text, marks: this.marks.slice(), errors: this.errors.slice() });
              this.marks = [];
              this.errors = [];
              this.note = '';
              this.setMode('off');
              this.frame?.contentWindow?.postMessage({ __office: 'clear' }, '*');
              this.tab = 'steps';
              this.bodyKey = '';
              this.render();
            },
          },
          busy ? T('⏳ Jamoa ishlamoqda…', '⏳ The team is working…') : T(`🛠️ Tuzatib ber → v${next}`, `🛠️ Fix it → v${next}`),
        ),
        this.marks.length ? h('button', { className: 'btn', onclick: () => { this.marks = []; this.frame?.contentWindow?.postMessage({ __office: 'clear' }, '*'); this.renderFeedback(); } }, T('🧽 Belgilarni tozalash', '🧽 Clear marks')) : null,
      ),
      ]) as Node[]),
    );
  }

  private website(r: WebsiteResult, run: CrewRun): Node {
    const f = r.files;
    switch (this.tab) {
      case 'preview': {
        const versions = r.versions.length ? r.versions : [{ n: 1, html: r.html, note: '', at: 0 }];
        const current = versions[versions.length - 1];
        const shown = this.viewVersion ? versions.find((v) => v.n === this.viewVersion) || current : current;
        const frame = h('iframe', { className: 'site-frame', title: 'preview', sandbox: 'allow-scripts allow-forms allow-modals allow-popups' }) as HTMLIFrameElement;
        this.errors = shown.html === this.shownHtml ? this.errors : [];
        this.shownHtml = shown.html;
        frame.srcdoc = withHelper(shown.html);
        frame.addEventListener('load', () => this.mode !== 'off' && frame.contentWindow?.postMessage({ __office: 'mode', mode: this.mode }, '*'));
        this.frame = frame;
        const wrap = h('div', { className: `site-wrap ${this.device}${this.mode !== 'off' ? ' marking' : ''}` }, frame);
        const tool = (mode: 'pick' | 'area', label: string, title: string) =>
          h('button', { className: `chip${this.mode === mode ? ' active' : ''}`, 'data-mode': mode, title, onclick: () => this.setMode(this.mode === mode ? 'off' : mode) }, label);
        this.feedbackEl = h('aside', { className: 'feedback' });
        this.renderFeedback();
        const old = shown !== current;
        return h(
          'div',
          { className: 'preview-layout' },
          h(
            'div',
            { className: 'preview-main' },
            h(
              'div',
              { className: 'device-bar' },
              h('button', { className: `chip${this.device === 'desktop' ? ' active' : ''}`, onclick: () => { this.device = 'desktop'; this.bodyKey = ''; this.render(); } }, '🖥️'),
              h('button', { className: `chip${this.device === 'phone' ? ' active' : ''}`, onclick: () => { this.device = 'phone'; this.bodyKey = ''; this.render(); } }, '📱'),
              h('button', { className: 'chip', title: T('Qayta yuklash', 'Reload'), onclick: () => { this.errors = []; frame.srcdoc = withHelper(shown.html); this.renderFeedback(); } }, '↻'),
              h('button', { className: 'chip', title: T('To‘liq ekran', 'Full screen'), onclick: () => this.setFull(!this.full) }, '⛶'),
              h('span', { className: 'sep' }),
              tool('pick', T('🎯 Element tanlash', '🎯 Pick element'), T('Saytdagi tugma, matn yoki rasmni bosib belgilang', 'Click a button, text or image on the site to mark it')),
              tool('area', T('▭ Hudud chizish', '▭ Draw area'), T('Sichqoncha bilan to‘rtburchak chizib hududni belgilang', 'Drag to mark an area')),
              versions.length > 1 ? h('span', { className: 'sep' }) : null,
              ...(versions.length > 1
                ? versions.map((v) => h('button', { className: `chip ver${v === shown ? ' active' : ''}`, title: v.note, onclick: () => { this.viewVersion = v === current ? 0 : v.n; this.bodyKey = ''; this.render(); } }, `v${v.n}`))
                : []),
              r.partial ? h('small', { className: 'muted' }, T('⏳ test qilinmoqda — birinchi versiya', '⏳ testing — first version')) : null,
            ),
            old ? h('p', { className: 'note' }, T(`Siz v${shown.n} ni ko‘ryapsiz (hozirgisi v${current.n}). `, `You are viewing v${shown.n} (current is v${current.n}). `), h('button', { className: 'btn small', onclick: () => { this.crews.restore(run.id, shown.n); this.viewVersion = 0; this.bodyKey = ''; this.render(); } }, T('↩️ Shu versiyani tiklash', '↩️ Restore this version'))) : null,
            current.check?.summary && !old ? h('p', { className: 'note ok' }, `✅ v${current.n}: ${current.check.summary}`) : null,
            ...r.notes.map((n) => h('p', { className: 'note' }, `⚠️ ${n}`)),
            wrap,
            h('small', { className: 'muted' }, r.workspaceDir ? `📁 ${r.workspaceDir}` : T('Maʼlumotlar brauzerda saqlanadi (demo rejim). To‘liq backend bilan ishlatish uchun loyihani .zip qilib yuklab oling.', 'Data is kept in the browser (demo mode). Download the .zip to run it with the real backend.')),
          ),
          this.feedbackEl,
        );
      }
      case 'plan':
        return this.planView(r.plan);
      case 'code': {
        const names = Object.keys(f).sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : a.localeCompare(b)));
        const cur = names.includes(this.file) ? this.file : names.includes('public/index.html') ? 'public/index.html' : names[0];
        return h(
          'div',
          { className: 'code-layout' },
          h(
            'nav',
            { className: 'file-list' },
            ...names.map((n) => h('button', { className: `file${n === cur ? ' active' : ''}`, onclick: () => { this.file = n; this.bodyKey = ''; this.render(); } }, `${/\.(html?)$/.test(n) ? '🌐' : /\.sql$/.test(n) ? '🗄️' : /\.md$/.test(n) ? '📝' : /\.json$/.test(n) ? '📦' : '⚙️'} ${n}`, h('small', {}, ` ${Math.round((f[n]?.length || 0) / 100) / 10} KB`))),
          ),
          h('div', { className: 'file-view' }, cur ? code(cur, f[cur]) : null),
        );
      }
      case 'qa': {
        const qa = r.qa;
        if (!qa) return h('p', { className: 'muted' }, r.partial ? T('⏳ Test hali davom etmoqda…', '⏳ Testing is still running…') : T('QA natijasi yo‘q', 'No QA result'));
        return h(
          'div',
          {},
          h('div', { className: 'score' }, h('b', {}, String(qa.score ?? '—')), h('span', {}, '/100')),
          qa.summary ? h('p', {}, qa.summary) : null,
          h('h3', {}, T('Tekshiruvlar', 'Checks')),
          h('ul', { className: 'checks' }, ...arr<{ name: string; ok: boolean; note?: string }>(qa.checks).map((c) => h('li', { className: c.ok ? 'ok' : 'bad' }, `${c.ok ? '✅' : '❌'} ${c.name}${c.note ? ' — ' + c.note : ''}`))),
          h('h3', {}, T('Muammolar', 'Issues')),
          h('ul', {}, ...arr<{ severity: string; note: string }>(qa.issues).map((i) => h('li', {}, h('span', { className: `sev ${i.severity}` }, i.severity), ' ', i.note))),
          r.versions.length > 1 ? h('h3', {}, T('Versiyalar', 'Versions')) : null,
          r.versions.length > 1 ? h('ul', {}, ...r.versions.map((v) => h('li', {}, `v${v.n} — ${v.note}${v.check?.done ? ` (${v.check.done.filter((d) => d.ok).length}/${v.check.done.length} ✅)` : ''}`))) : null,
        );
      }
      case 'steps':
        return this.progress(run);
      default:
        return h('div', {}, h('div', { className: 'md', html: renderMarkdown(r.summary || (r.partial ? T('⏳ Hisobot jamoa ishni tugatganda chiqadi.', '⏳ The report appears when the team finishes.') : '')) }), h('div', { className: 'md', html: renderMarkdown(r.files['README.md'] || '') }));
    }
  }

  private planView(p: Record<string, unknown>) {
    const entities = arr(p.entities);
    const sec = (title: string, x: unknown) => (arr(x).length ? [h('h3', {}, title), list(x)] : []);
    return h(
      'div',
      { className: 'grid2' },
      h(
        'section',
        {},
        h('h3', {}, T('Maqsad', 'Goal')),
        h('p', {}, str(p.summary)),
        p.problem ? h('p', {}, h('b', {}, T('Muammo: ', 'Problem: ')), str(p.problem)) : null,
        ...sec(T('Foydalanuvchilar', 'Users'), p.users || p.audience),
        ...sec('MVP', p.mvp),
        ...sec(T('Funksiyalar', 'Features'), p.features),
      ),
      h(
        'section',
        {},
        arr(p.deliverables).length ? h('div', { className: 'chips' }, ...arr<string>(p.deliverables).map((d) => h('span', { className: 'chip' }, { web: '🌐 Web', api: '⚙️ API', mcp: '🔌 MCP', bot: '🤖 Bot' }[String(d)] || String(d)))) : null,
        ...sec(T('Modullar', 'Modules'), p.modules),
        ...sec(T('Sahifalar', 'Pages'), p.pages),
        h('h3', {}, T('Texnologiyalar', 'Stack')),
        h('p', {}, Object.entries((p.stack as Record<string, string>) || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')),
        ...sec(T('Keyingi bosqichlar', 'Later'), p.later),
        ...sec(T('Xavflar', 'Risks'), p.risks),
        ...sec(T('Muvaffaqiyat mezonlari', 'Success metrics'), p.metrics),
        ...sec(T('Bosqichlar', 'Milestones'), p.milestones),
      ),
      arr(p.mcpTools).length ? h('section', { className: 'span2' }, h('h3', {}, T('MCP asboblari (AI uchun)', 'MCP tools (for AI)')), table(arr(p.mcpTools), [['name', T('Nomi', 'Name')], ['purpose', T('Vazifasi', 'Purpose')]])) : null,
      p.bot && typeof p.bot === 'object' ? h('section', { className: 'span2' }, h('h3', {}, T('Bot buyruqlari', 'Bot commands')), table(arr((p.bot as Record<string, unknown>).commands), [['command', T('Buyruq', 'Command')], ['purpose', T('Vazifasi', 'Purpose')]])) : null,
      h('section', { className: 'span2' }, h('h3', {}, 'API'), table(arr(p.api), [['method', 'Method'], ['path', 'Path'], ['purpose', T('Vazifasi', 'Purpose')]])),
      h('section', { className: 'span2' }, h('h3', {}, T('Maʼlumotlar modeli', 'Data model')), ...entities.map((e) => h('div', {}, h('h4', {}, str(e.name)), table(arr(e.fields), [['name', T('Maydon', 'Field')], ['type', T('Turi', 'Type')], ['note', T('Izoh', 'Note')]])))),
    );
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
