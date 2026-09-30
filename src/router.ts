// Picks the best agents for a free-text task (English or Uzbek) with a small
// TF-IDF over each agent's name, description, tags and linked skills.
import type { Item, OfficeData } from './data';

const STOP = new Set(
  'a an the and or of to for in on at by with from into is are be this that it as i me my we our you your please can could would should will just about some any all do does make need want help using use via how what which who when where why bu va uchun bilan ham menga mening menda qil qilib ber kerak bor yoq edi emas ni ga da dan ning lar bir shu bu yerda'.split(' '),
);

// Uzbek -> English hints so Uzbek prompts route well.
const UZ: Record<string, string[]> = {
  xato: ['bug', 'error', 'debug'], xatolik: ['bug', 'error', 'debug'], xatolar: ['bug', 'error'], tuzat: ['fix', 'debug'],
  xavfsizlik: ['security'], xavfsiz: ['security'], parol: ['auth', 'security'], dizayn: ['design', 'ui'], sayt: ['website', 'frontend'],
  sahifa: ['page', 'frontend', 'ui'], interfeys: ['ui', 'frontend'], moliya: ['finance'], moliyaviy: ['finance'], pul: ['finance', 'pricing'],
  narx: ['pricing'], reklama: ['ads', 'marketing'], marketing: ['marketing'], sotuv: ['sales'], tadqiqot: ['research'], izlanish: ['research'],
  maʼlumot: ['data'], malumot: ['data'], baza: ['database', 'sql'], bazasi: ['database', 'sql'], tarjima: ['translate'], hujjat: ['docs', 'documentation'],
  hujjatlar: ['docs'], kod: ['code'], kodni: ['code'], sharh: ['review'], tekshir: ['review', 'audit'], tekshiruv: ['review', 'audit'], tekshirish: ['review'],
  loyiha: ['project'], mahsulot: ['product'], reja: ['plan', 'roadmap'], rejalashtir: ['plan'], arxitektura: ['architecture'], test: ['test'], testlar: ['test'],
  sinov: ['test'], server: ['server', 'backend'], bulut: ['cloud'], joylashtir: ['deploy'], video: ['video'], rasm: ['image'], musiqa: ['music'],
  xat: ['email'], pochta: ['email'], uchrashuv: ['meeting'], yozish: ['write', 'content'], maqola: ['article', 'content'], ijtimoiy: ['social'],
  tarmoq: ['network'], strategiya: ['strategy'], rahbar: ['ceo', 'leadership'], huquq: ['legal', 'compliance'], tahlil: ['analysis', 'analytics'],
  grafik: ['graph', 'chart'], bilim: ['knowledge'], ogʻir: ['performance'], tezlik: ['performance'], sekin: ['performance'], mobil: ['mobile', 'flutter', 'swift', 'kotlin'],
  oʻyin: ['game'], oyin: ['game'], taqdimot: ['presentation', 'slides'], slayd: ['slides'], refaktor: ['refactor'], optimallashtir: ['optimize', 'performance'],
  maktab: ['school', 'education'], oʻquvchi: ['student', 'education'], oquvchi: ['student', 'education'], oʻqituvchi: ['teacher', 'education'], oqituvchi: ['teacher', 'education'],
  davomat: ['attendance'], baho: ['grade'], ota: ['parent'], ona: ['parent'], dars: ['lesson', 'education'], kurs: ['course', 'education'], taʼlim: ['education'], talim: ['education'],
  doʻkon: ['shop', 'ecommerce'], dokon: ['shop', 'ecommerce'], bozor: ['market', 'ecommerce'], xarid: ['shopping', 'ecommerce'], toʻlov: ['payment'], tolov: ['payment'],
  internet: ['web', 'search'], qidir: ['search', 'research'], qidiruv: ['search'], izla: ['search', 'research'], yangilik: ['news'], manba: ['source', 'research'],
  xabar: ['message', 'notification'], xabarnoma: ['notification'], avtomatlashtir: ['automation', 'workflow'], avtomatlashtirish: ['automation', 'workflow'], mijoz: ['customer', 'support'],
  sayohat: ['travel', 'trip'], kasalxona: ['hospital', 'healthcare', 'medical'], shifoxona: ['hospital', 'healthcare', 'medical'], bemor: ['patient', 'healthcare'],
  shifokor: ['doctor', 'healthcare'], yordam: ['support', 'help'], restoran: ['restaurant', 'food'], ovqat: ['food', 'recipe'], ish: ['job', 'career'], rezyume: ['resume', 'career'],
  tizim: ['system', 'platform'], platforma: ['platform'], animatsiya: ['animation', 'motion'], animatsion: ['animation', 'motion'], ilova: ['app', 'application'],
  sheʼr: ['poem', 'writing'], hikoya: ['story', 'writing'], tarjimon: ['translate'], hisobchi: ['accounting', 'finance'], buxgalter: ['accounting', 'finance'],
};

/** An Uzbek word and its stems without case / plural / possessive endings (maktabimizni -> maktab). */
const UZ_ENDINGS = ['dagi', 'ning', 'dan', 'imiz', 'ingiz', 'lar', 'ni', 'ga', 'da', 'gi', 'si', 'i'];
function uzStems(w: string): string[] {
  // Only used to look words up in UZ, so a wrong cut costs nothing.
  const seen = new Set([w, w.replace(/ʼ/g, 'ʻ')]);
  let layer = [...seen];
  for (let i = 0; i < 3 && layer.length; i++) {
    const next: string[] = [];
    for (const x of layer)
      for (const e of UZ_ENDINGS)
        if (x.endsWith(e) && x.length - e.length >= 3 && !seen.has(x.slice(0, -e.length))) {
          seen.add(x.slice(0, -e.length));
          next.push(x.slice(0, -e.length));
        }
    layer = next;
  }
  return [...seen].flatMap((s) => [s, s.replace(/ʻ/g, '')]);
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (let w of text.toLowerCase().replace(/['‘’`ʻʼ]/g, 'ʼ').split(/[^\p{L}\p{N}ʼ+#]+/u)) {
    if (!w || STOP.has(w)) continue;
    const uz = uzStems(w).map((x) => UZ[x]).find(Boolean);
    if (uz) {
      out.push(...uz);
      continue;
    }
    w = w.replace(/ʼ/g, '');
    if (w.length > 4) w = w.replace(/(ing|ers|er|ed|es|s)$/, '');
    if (w.length > 1) out.push(w);
  }
  return out;
}

export interface Route {
  item: Item;
  score: number;
}

export class Router {
  private docs: { item: Item; tf: Map<string, number> }[] = [];
  private idf = new Map<string, number>();

  constructor(data: OfficeData) {
    const df = new Map<string, number>();
    for (const item of data.registry.items) {
      if (item.type !== 'agent') continue;
      const tf = new Map<string, number>();
      const add = (text: string | undefined, w: number) => {
        for (const tok of tokenize(text || '')) tf.set(tok, (tf.get(tok) || 0) + w);
      };
      add(item.name.replace(/^cs-/, '').replace(/[-_]/g, ' '), 3);
      add(item.description, 1);
      add((item.tags || []).join(' '), 2);
      add(data.dept.get(item.dept)?.name, 1.5);
      for (const n of data.neighbors.get(item.id) || []) {
        const other = data.byId.get(n.id);
        if (other && other.type !== 'agent') add(other.name.replace(/[-_]/g, ' '), 0.6);
      }
      for (const k of tf.keys()) df.set(k, (df.get(k) || 0) + 1);
      this.docs.push({ item, tf });
    }
    const N = this.docs.length;
    for (const [k, v] of df) this.idf.set(k, Math.log(1 + N / v));
  }

  route(text: string, limit = 3): Route[] {
    const q = [...new Set(tokenize(text))];
    if (!q.length) return [];
    const scored = this.docs.map(({ item, tf }) => {
      let s = 0;
      for (const tok of q) {
        const f = tf.get(tok);
        if (f) s += Math.log(1 + f) * (this.idf.get(tok) || 0);
      }
      // Office residents are generalists; keep them as a tie-breaker only.
      if (item.id.startsWith('agent:claude-office:')) s *= 0.5;
      return { item, score: s };
    });
    return scored.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
