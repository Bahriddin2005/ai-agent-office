// Office departments and the rules that decide which department an agent,
// skill or command works in. Used by build-library.mjs; the resulting `dept`
// field is baked into public/data/registry.json so the 3D office never has to
// classify anything at runtime.

export const DEPARTMENTS = [
  { id: 'executive', name: 'Executive Suite', uz: 'Rahbariyat', emoji: '👔', color: '#c9a227' },
  { id: 'engineering', name: 'Engineering Core', uz: 'Muhandislik markazi', emoji: '🛠️', color: '#4f86f7' },
  { id: 'languages', name: 'Languages & Build', uz: 'Dasturlash tillari', emoji: '🧩', color: '#3fb5a3' },
  { id: 'frontend', name: 'Frontend & Design', uz: 'Frontend va dizayn', emoji: '🎨', color: '#ef6f9a' },
  { id: 'devops', name: 'DevOps & Cloud', uz: 'DevOps va bulut', emoji: '☁️', color: '#5aa9e6' },
  { id: 'security', name: 'Security & Compliance', uz: 'Xavfsizlik va muvofiqlik', emoji: '🛡️', color: '#e5484d' },
  { id: 'ai', name: 'AI & ML Lab', uz: 'Sunʼiy intellekt laboratoriyasi', emoji: '🧠', color: '#9b6dff' },
  { id: 'data', name: 'Data & Research', uz: 'Maʼlumot va tadqiqot', emoji: '🔬', color: '#26b5ce' },
  { id: 'product', name: 'Product & Projects', uz: 'Mahsulot va loyihalar', emoji: '🗺️', color: '#f5a524' },
  { id: 'marketing', name: 'Marketing & Growth', uz: 'Marketing va o‘sish', emoji: '📣', color: '#ff7a45' },
  { id: 'business', name: 'Sales, Finance & Ops', uz: 'Savdo, moliya va operatsiyalar', emoji: '💼', color: '#46a758' },
  { id: 'creative', name: 'Creative Studio', uz: 'Ijodiy studiya', emoji: '🎬', color: '#d864d8' },
  { id: 'productivity', name: 'Productivity Hub', uz: 'Samaradorlik markazi', emoji: '⚡', color: '#8d9eff' },
  { id: 'academy', name: 'Claude Academy', uz: 'Claude akademiyasi', emoji: '🎓', color: '#d97757' },
];

// Strong hints from where a file lives in its repo (first match wins).
const PATH_HINTS = [
  [/(^|\/)(c-level-advisor|c-level-agents|agents\/c-level|executive)(\/|$)/, 'executive'],
  [/(^|\/)(ra-qm-team|compliance-os)(\/|$)/, 'security'],
  [/(^|\/)(marketing-skill|marketing|agents\/marketing|social-media)(\/|$)/, 'marketing'],
  [/(^|\/)(product-team|agents\/product|project-management)(\/|$)/, 'product'],
  [/(^|\/)(finance|business-operations|business-growth|commercial|blockchain|payments)(\/|$)/, 'business'],
  [/(^|\/)(research|research-ops|data-science)(\/|$)/, 'data'],
  [/(^|\/)(productivity|note-taking|apple|email|smart-home|health|communication|yuanbao)(\/|$)/, 'productivity'],
  [/(^|\/)(creative|media|gaming)(\/|$)/, 'creative'],
  [/(^|\/)(mlops|autonomous-ai-agents|mcp)(\/|$)/, 'ai'],
  [/(^|\/)(devops)(\/|$)/, 'devops'],
  [/(^|\/)(security)(\/|$)/, 'security'],
  [/(^|\/)(web-development|markdown-html)(\/|$)/, 'frontend'],
  [/(^|\/)(orchestration|agent-launcher|loop-library|development-workflows|agent-teams|orchestration-workflow)(\/|$)/, 'academy'],
];

// Keyword -> [dept, weight]. Matched against name tokens (x3), tags/domain
// (x2), path tokens (x1.5) and description words (x1, capped).
const KEYWORDS = {
  executive: 'ceo cto cfo cmo coo cpo ciso cro chro vpe c-level chief executive board founder founders strategy strategic advisor investor fundraising okr leadership boardroom exec',
  engineering: 'code review reviewer refactor refactoring tdd test testing tests e2e planner plan architect architecture debug debugger bug bugs git pr commit simplify simplifier spec specs quality lint linter build-fix senior engineer engineering backend fullstack api codebase monorepo migration dependency dependencies verification harness-free silent-failure',
  languages: 'python go golang rust java kotlin swift cpp c++ csharp c# dotnet fsharp php ruby rails dart flutter django fastapi typescript javascript node nodejs bun deno laravel spring springboot elixir scala haskell zig lua perl r-lang jvm gradle maven cargo pytorch-build build-resolver resolver harmonyos',
  frontend: 'frontend react vue nuxt next nextjs svelte angular ui ux css tailwind html design designer figma a11y accessibility wcag component components web website landing responsive animation motion svg presentation slides markdown typography visual storybook',
  devops: 'devops docker kubernetes k8s helm ci cd ci/cd deploy deployment deployments aws gcp azure cloud terraform ansible infra infrastructure network networking homelab observability monitoring sre slo slos linux server servers nginx serverless vercel cloudflare incident on-call uptime logging prometheus grafana container containers',
  security: 'security secure pentest penetration vuln vulnerability vulnerabilities threat exploit auth oauth jwt secrets compliance gdpr iso hipaa soc2 soc regulatory regulation quality qms capa fda mdr ivdr risk audit auditor privacy sanitizer sast owasp ciso governance legal-risk',
  ai: 'ai ml llm llms mlops rag model models pytorch tensorflow agentic prompt prompts mle prompting embedding embeddings fine-tune finetune fine-tuning training inference eval evals evaluation gpt openai anthropic huggingface transformers diffusion gan neural mcp langchain autonomous vllm gguf',
  data: 'data analytics analysis analyst sql database databases postgres mysql sqlite mongodb dataset datasets science scientist research researcher paper papers arxiv notebook jupyter pandas graph graphs knowledge wiki etl warehouse bigquery statistics dossier survey scrape scraping crawler search',
  product: 'product pm roadmap jira scrum agile project projects sprint requirement requirements prd story stories backlog confluence atlassian stakeholder discovery ux-research user-research launch milestone delivery program portfolio',
  marketing: 'marketing seo aeo content social brand branding campaign campaigns copy copywriting ads advertising growth twitter x linkedin youtube tiktok instagram newsletter email-sequence cro conversion funnel webinar pr influencer demand-gen audience',
  business: 'finance financial sales revenue pricing accounting invoice invoices procurement vendor vendors bizops operations ops hr hiring recruiting legal contract contracts commercial customer success crm payments payment stripe crypto blockchain trading tax budget forecast saas-metrics unit-economics shopify ecommerce',
  creative: 'creative image images video videos audio music art artist 3d blender animation game games gaming media photo photos gif voice tts speech podcast story writing writer novel comic drawing illustration canvas ascii meme',
  productivity: 'productivity email inbox calendar notes note obsidian notion apple todo todos task tasks meeting meetings reflect capture weekly daily journal habit focus deep-work smart-home home-assistant health fitness memory reminder reminders messaging telegram slack whatsapp personal assistant handoff',
  academy: 'claude-code claude.md best-practice best-practices workflow workflows harness hook hooks settings orchestration orchestrator loop skill-creator subagent subagents commands onboarding tutorial tips guide learning continuous-learning token cost context compaction memory-bank rules',
};

const KW = {};
for (const [dept, words] of Object.entries(KEYWORDS)) {
  for (const w of words.split(/\s+/)) (KW[w] ||= []).push(dept);
}

const tokens = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[`*_()[\]{}"',.:;!?]/g, ' ')
    .split(/[\s/\\|]+|(?<=[a-z0-9])-(?=[a-z])/)
    .filter(Boolean);

// Hand-placed agents whose descriptions mislead the keyword scorer.
const OVERRIDES = {
  'ecc/agent-evaluator': 'ai',
  'ecc/comment-analyzer': 'engineering',
  'ecc/performance-optimizer': 'engineering',
  'ecc/opensource-forker': 'devops',
  'ecc/opensource-packager': 'devops',
  'ecc/network-config-reviewer': 'devops',
  'ecc/outreach-drafter': 'marketing',
  'ecc/enrichment-agent': 'business',
  'ecc/docs-lookup': 'data',
  'claude-skills/skill-extractor': 'academy',
  'claude-skills/memory-analyst': 'ai',
  'claude-skills/experiment-runner': 'ai',
  'claude-skills/cs-spinning-up-deep-rl': 'ai',
  'claude-skills/cs-deep-learning-tutor': 'ai',
  'claude-skills/cs-claude-coach': 'academy',
  'claude-skills/cs-skill-doctor': 'academy',
  'claude-skills/cs-skill-author': 'academy',
  'claude-skills/cs-book-to-skill': 'academy',
  'claude-skills/cs-scraping-architect': 'data',
  'best-practice/presentation-claude-code': 'creative',
  'best-practice/presentation-claude-gemini': 'creative',
  'best-practice/presentation-vibe-coding': 'creative',
  'best-practice/claude-cli-startup-flags': 'academy',
  'best-practice/claude-power-ups': 'academy',
  'agent-skills/interview-me': 'product',
  'agent-skills/idea-refine': 'product',
  'agent-skills/planning-and-task-breakdown': 'product',
  'agent-skills/incremental-implementation': 'engineering',
  'agent-skills/ship': 'devops',
  'agent-skills/constraints': 'engineering',
  'agents-500/news-summarizer-agent': 'data',
  'agents-500/recipe-agent': 'productivity',
  'agents-500/travel-planner-agent': 'productivity',
  'agents-500/documentation-writer': 'engineering',
  'agents-500/job-application-agent': 'business',
  'agents-500/stock-research-agent': 'business',
  'pi/scout': 'engineering',
  'pi/worker': 'engineering',
  'pi/cl': 'devops',
  'pi/deslop': 'engineering',
  'pi/is': 'engineering',
  'pi/sa': 'security',
  'pi/wr': 'engineering',
};

export function classify({ name, path, description, tags = [], domain, source }) {
  const override = OVERRIDES[`${source}/${name}`];
  if (override) return override;
  const score = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, 0]));
  const lowerPath = path.toLowerCase();
  for (const [re, dept] of PATH_HINTS) {
    if (re.test(lowerPath)) { score[dept] += 6; break; }
  }
  const add = (list, weight, cap = Infinity) => {
    const got = {};
    for (const t of list) {
      for (const cand of [t, t.replace(/s$/, '')]) {
        for (const dept of KW[cand] || []) {
          got[dept] = Math.min(cap, (got[dept] || 0) + weight);
        }
      }
    }
    for (const [d, v] of Object.entries(got)) score[d] += v;
  };
  const nameTokens = [...tokens(name), ...String(name || '').toLowerCase().split('-')];
  add(new Set(nameTokens), 3);
  add(new Set([...tags.flatMap(tokens), ...tokens(domain)]), 2);
  add(new Set(tokens(lowerPath.split('/').slice(0, -1).join(' '))), 1.5);
  add(tokens(description).slice(0, 80), 1, 4);
  // Language-specific reviewers/resolvers belong with their language.
  if (/-(reviewer|build-resolver|build|review|patterns|testing)$/.test(name || '')) {
    if (score.frontend >= 3 && /react|vue|angular|svelte|next|nuxt|a11y|ui/.test(name)) score.frontend += 5;
    else if (score.languages >= 3) score.languages += 4;
  }
  if (source === 'best-practice') score.academy += 3;
  score.engineering -= 0.5; // generalist fallback loses ties to specialist departments

  let best = 'engineering';
  let bestScore = 0;
  for (const d of DEPARTMENTS) {
    if (score[d.id] > bestScore) { best = d.id; bestScore = score[d.id]; }
  }
  return best;
}
