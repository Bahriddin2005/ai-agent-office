// Real checks with the connected AI: the Boss's exam for one agent
// (the Boss asks, the agent answers in character, a neutral examiner scores) and
// Claude's lesson notes for an academy class.
import type { Item } from '../data';
import { currentLang } from '../i18n';
import { languageRule, type Crews } from './crews';
import { parseJson, type Engine } from './engine';
import type { Exam } from '../sim/boss';

const lang = () => (currentLang() === 'uz' ? 'Uzbek (Latin script)' : 'English');

export function makeExam(crews: Crews, engine: () => Promise<Engine>) {
  // The examiner and the grader are neutral: their own agent personas carry
  // workflows of their own that leak into the judgement.
  const examiner = (task: string) =>
    [
      'You are the office director (the Boss) of the AI Agent Office, checking how well one of your AI agents does its job.',
      task,
      languageRule(),
    ].join('\n');
  return async (agentId: string): Promise<Exam | null> => {
    const e = await engine();
    if (e.kind === 'none') return null;
    const it = crews.item(agentId);
    const q = await e.ask(
      `Agent under review: "${it.name}" — ${it.description}\nWrite ONE practical exam question (1-2 sentences): a small, realistic task from this agent's own field that shows whether it can really do its core job well. It must be answerable in a short text, without tools, files or other agents. Reply with only the question, in ${lang()}.`,
      { system: examiner('You write fair, concrete exam questions in clean, natural language.'), tier: 'default' },
    );
    const question = q.text.trim().replace(/^["“]|["”]$/g, '');
    const a = await e.ask(
      `The office director gives you a short exam: "${question}"\nAnswer it yourself now, concretely and practically, in at most 170 words, in ${lang()}. Do not ask questions back and do not describe a process for later — give your actual answer.`,
      { system: crews.persona(agentId), tier: 'default' },
    );
    const answer = a.text.trim();
    const g = await e.ask(
      [
        `Agent: ${it.name} — ${it.description}`,
        `Exam question: ${question}`,
        `Agent's answer:\n${answer}`,
        '',
        'Grade ONLY this answer to this question: is it correct, concrete, practical and complete for someone in this role? 9-10 only for excellent answers; asking questions back instead of answering scores low.',
        `Reply with ONLY a JSON object in ${lang()}: {"score": 1-10, "strengths": ["short point"], "gaps": ["what is missing or wrong, short"], "verdict": "one sentence"}`,
      ].join('\n'),
      { system: examiner('You are a strict, fair examiner. You judge the answer against the question, not against any workflow of your own.'), tier: 'default' },
    );
    const r = parseJson<{ score?: number; strengths?: string[]; gaps?: string[]; verdict?: string }>(g.text);
    return {
      question,
      answer,
      score: Math.max(1, Math.min(10, Number(r.score) || 5)),
      strengths: Array.isArray(r.strengths) ? r.strengths.map(String).slice(0, 4) : [],
      gaps: Array.isArray(r.gaps) ? r.gaps.map(String).slice(0, 4) : [],
      verdict: String(r.verdict || ''),
    };
  };
}

export function makeTeacher(engine: () => Promise<Engine>, deptName: (id: string) => string) {
  return async (dept: string, topics: Item[]): Promise<string> => {
    const e = await engine();
    if (e.kind === 'none') return '';
    const r = await e.ask(
      [
        `Today you teach a class of AI agents from the "${deptName(dept)}" department.`,
        `Today's skills:\n${topics.map((t) => `- ${t.name}: ${t.description}`).join('\n')}`,
        '',
        `Write the lesson notes the agents will keep and apply in every future task: exactly 3 rules for each skill, in the order the skills are listed (${topics.length * 3} lines in total, one rule per line, starting with "- "). Each rule is at most 30 words: what to do in real work with the skill, then a short reason after "—". Generalise from the skill to the department's everyday work; no trivia about one example. In ${lang()}. No introduction, no headings.`,
      ].join('\n'),
      {
        system: ['You are Claude, the teacher at Claude Academy, where the AI agents of an office learn skills for their field. You teach clearly, practically and precisely.', languageRule()].join('\n'),
        tier: 'default',
      },
    );
    return r.text.trim();
  };
}
