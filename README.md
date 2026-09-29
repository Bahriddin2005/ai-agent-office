# 🏢 AI Agent Office

**Claude Code agentlari, skillari va buyruqlari yashaydigan va ishlaydigan 3D ofis.**
Oltita ochiq manbali repozitoriydagi hamma narsa bitta joyga jamlangan, Graphify uslubidagi bilim grafiga bog‘langan va Three.js'da jonli ofis sifatida ko‘rsatiladi.

> 🇬🇧 English version: [below](#-english).

![AI Agent Office — kunduzgi ko‘rinish](docs/images/office-day.jpg)

| | |
|---|---|
| **205** agent | har biri o‘z bo‘limida, o‘z stolida o‘tiradi |
| **883** skill | bo‘lim javonlaridagi kitoblar (1 skill = 1 kitob) |
| **253** buyruq (slash command) | javonlardagi papkalar |
| **25** qo‘llanma | Claude Code best-practice va har bir manbaning README'si |
| **14** bo‘lim | Rahbariyatdan Claude akademiyasigacha |
| **5 087** bog‘lanish | agent → skill, agent → agent, buyruq → agent … (EXTRACTED / INFERRED) |

## Nima qila oladi

- **3D ofis.** Har bir agent o‘z bo‘limida stolda o‘tiradi. Agentlar javondan kerakli skill kitobini olib o‘qiydi, stolida ishlaydi, grafda bog‘langan hamkasblari bilan maslahatlashadi, qahva ichgani boradi va markazdagi **Graphify Core**'ga savol beradi.
- **Jonli rejim.** Claude Code hooklari ulanganda ofis haqiqiy ishingizni ko‘rsatadi: siz yozgan so‘rov Boss ustida chiqadi, Claude (qabulxonada) asboblarni ishlatadi, Claude subagent chaqirsa — shu nomdagi agent stolida qizil belgi bilan ishlay boshlaydi, skill ishlatilsa — javondagi kitobi yonadi. Ofisda stoli yo‘q subagentlar (masalan `Explore`, `Plan`) mehmon sifatida kirib keladi.
- **Vazifa berish.** Pastdagi maydonga vazifa yozing (o‘zbekcha ham tushunadi). Ofis uni eng mos agentga yo‘naltiradi, agent o‘z ta’rifi (system prompt) bilan `claude -p` orqali ishlaydi va natija “Vazifalar” panelida chiqadi.
- **Ishga olish.** Istalgan agent, skill yoki buyruqni bir tugma bilan `.claude/` papkangizga o‘rnating (agent o‘zi e’lon qilgan skillari bilan birga).
- **Bilim grafi.** 1386 tugun va 5087 bog‘lanishdan iborat Graphify uslubidagi graf: bo‘limlar bo‘yicha jamoalar, “eng bog‘langan tugunlar”, qidiruv, EXTRACTED/INFERRED filtrlari.
- **Bitta joy.** `library/` papkasida barcha agentlar, skillar, buyruqlar va qo‘llanmalar asl holida, litsenziyalari bilan; `library/CATALOG.md` va `library/departments/*.md` — to‘liq katalog.
- Kun/tun rejimi, o‘zbek/ingliz interfeysi, telefonda ham ishlaydi.

| Tungi ofis va Graphify Core | Bilim grafi |
|---|---|
| ![Tun](docs/images/office-night.jpg) | ![Graf](docs/images/knowledge-graph.jpg) |
| **Vazifa berish: “login sahifasini xavfsizlik uchun tekshir” → security-reviewer** | **Agent inspektori** |
| ![Vazifa](docs/images/give-task.jpg) | ![Inspektor](docs/images/inspector.jpg) |

## Tez boshlash

Node.js **20.11+** kerak.

```bash
git clone https://github.com/bahriddin2005/ai-agent-office.git
cd ai-agent-office
npm install
npm run dev          # http://localhost:3333 — ofis + server (jonli rejim)
```

Yoki bitta port bilan: `npm start` → **http://localhost:3334** (build qiladi va server UI'ni ham beradi).

Server ishlamasa ham ofis simulyatsiya rejimida ishlaydi. **GitHub Pages:** repozitoriyda *Settings → Pages → Source: GitHub Actions* ni yoqing — `main` ga har push'da ofis avtomatik joylanadi (`.github/workflows/pages.yml`).

### Jonli rejim — Claude Code'ni ofisga ulash

```bash
npm run hooks:install                      # ~/.claude/settings.json ga (barcha loyihalar)
npm run hooks:install -- --project ../app  # faqat bitta loyihaga
npm run hooks:install -- --remove          # olib tashlash
```

Keyin ofisni ishga tushiring (`npm run dev`) va Claude Code'dan odatdagidek foydalaning. Yuqori o‘ng burchakda **● JONLI** belgisi yonadi.

### Agentga vazifa berish

Ofis pastidagi maydonga vazifani yozing → “Kimga” qatorida taklif qilingan agentni tanlang → **Yuborish**. Yoki inspektorda **⚡ Vazifa berish** tugmasini bosing.

- Server kompyuteringizdagi `claude` CLI'ni agentning o‘z ta’rifi bilan ishga tushiradi (`claude -p … --append-system-prompt <agent>`), natija ofisga oqib keladi.
- Standart holatda agentlar **faqat o‘qiydi** (`Read, Grep, Glob, WebSearch, WebFetch`). Fayllarni o‘zgartirishga ruxsat berish uchun `office.config.json` da `"allowWrite": true` qiling.
- `claude` CLI topilmasa, vazifa simulyatsiya qilinadi va bu aniq belgilanadi.

### Agentlarni “ishga olish”

```bash
npm run hire -- agent:ecc:code-reviewer                 # id bo‘yicha
npm run hire -- cs-backend-engineer vue-patterns        # nom bo‘yicha
npm run hire -- --dept security --type agent            # butun bo‘lim
npm run hire -- --source hermes --type skill --list     # faqat ko‘rish
npm run hire -- agent:ecc:planner --scope user          # ~/.claude ga
npm run hire -- agent:ecc:planner --project ../myapp    # boshqa loyihaga
```

Agent o‘zi e’lon qilgan skillari bilan birga o‘rnatiladi. `.sources/` mavjud bo‘lsa (`npm run sync`), skillar skript va reference fayllari bilan to‘liq nusxalanadi.

### Kutubxonani yangilash

```bash
npm run sync            # 6 ta repozitoriyni .sources/ ga klonlaydi yoki yangilaydi
npm run build:library   # library/, public/data/registry.json va graph.json ni qayta quradi
```

To‘liq Graphify grafini ham qurish mumkin: `uv tool install graphifyy && graphify install`, keyin Claude Code'da `/graphify library/`.

## Bo‘limlar

| Bo‘lim / Department | Agentlar | Skillar | Buyruqlar |
|---|---|---|---|
| 👔 **Executive Suite** — Rahbariyat | 21 | 62 | 2 |
| 🛠️ **Engineering Core** — Muhandislik markazi | 34 | 142 | 41 |
| 🧩 **Languages & Build** — Dasturlash tillari | 25 | 52 | 16 |
| 🎨 **Frontend & Design** — Frontend va dizayn | 7 | 65 | 18 |
| ☁️ **DevOps & Cloud** — DevOps va bulut | 7 | 37 | 1 |
| 🛡️ **Security & Compliance** — Xavfsizlik va muvofiqlik | 11 | 58 | 8 |
| 🧠 **AI & ML Lab** — Sunʼiy intellekt laboratoriyasi | 11 | 87 | 5 |
| 🔬 **Data & Research** — Maʼlumot va tadqiqot | 16 | 67 | 22 |
| 🗺️ **Product & Projects** — Mahsulot va loyihalar | 9 | 38 | 25 |
| 📣 **Marketing & Growth** — Marketing va o‘sish | 15 | 65 | 13 |
| 💼 **Sales, Finance & Ops** — Savdo, moliya va operatsiyalar | 5 | 56 | 18 |
| 🎬 **Creative Studio** — Ijodiy studiya | 3 | 43 | 0 |
| ⚡ **Productivity Hub** — Samaradorlik markazi | 12 | 66 | 21 |
| 🎓 **Claude Academy** — Claude akademiyasi | 29 | 45 | 63 |

Markaziy atriumda: **Claude** (bosh agent, qabulxonada), **office-manager** (Claude-Office'dan), **Siz (Boss)**, **graphify-librarian** va Graphify Core gologrammasi; mehmon agentlar uchun stollar.

## Manbalar

| Manba / Source | Litsenziya | Agentlar | Skillar | Buyruqlar | Qo‘llanmalar | Ofisdagi roli |
|---|---|---|---|---|---|---|
| [Claude Code Best Practice](https://github.com/shanraisshan/claude-code-best-practice) | MIT | 20 | 6 | 14 | 20 | Claude akademiyasi: best-practice, workflow, namuna agentlar |
| [Claude Skills](https://github.com/alirezarezvani/claude-skills) | MIT | 109 | 373 | 142 | 1 | Eng katta skill va persona kutubxonasi: muhandislik, mahsulot, marketing, C-level, compliance, moliya |
| [Claude Office](https://github.com/W17ant/Claude-Office) | MIT | 1 | 0 | 0 | 1 | Asl g‘oya: Claude Code hook → server → jonli ofis; office-manager persona |
| [Graphify](https://github.com/Graphify-Labs/graphify) | Apache-2.0 | 1 | 1 | 0 | 1 | Hamma narsani bitta bilim grafiga jamlash; graphify-librarian |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | MIT | 1 | 211 | 0 | 1 | O‘z-o‘zini yaxshilaydigan agent va katta skill katalogi |
| [ECC](https://github.com/affaan-m/ECC) | MIT | 73 | 292 | 97 | 1 | Til bo‘yicha reviewerlar, build resolverlar, buyruqlar va yuzlab skillar |

Har bir fayl o‘z muallifi va litsenziyasini saqlaydi — qarang: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) va `library/LICENSES/`.

## Qanday ishlaydi

```
Claude Code ──hook (office-hook.mjs)──▶ server :3334 ──WebSocket──▶ 3D ofis (Three.js)
                                           │  ▲
                            claude -p ◀────┘  └── vazifa / ishga olish (UI)
                                           │
                     library/ + registry.json + graph.json  ◀── build-library.mjs ◀── .sources/ (6 repo)
```

| Papka | Mazmuni |
|---|---|
| `src/world/` | Sahna: reja (`layout.ts`), mebel va javonlar (`office.ts`), instanced odamlar (`people.ts`), effektlar, yorliqlar |
| `src/sim/` | Agentlar holat mashinasi (`actors.ts`) va rejissyor: avto-hayot + jonli hodisalar (`director.ts`) |
| `src/ui/` | Panellar (`hud.ts`), bilim grafi (`graphView.ts`), markdown |
| `src/router.ts` | Vazifani eng mos agentga yo‘naltirish (TF‑IDF, o‘zbekcha sinonimlar bilan) |
| `server/` | Express + WebSocket: hooklar, vazifalar (`dispatch.mjs`), ishga olish |
| `scripts/` | `sync-sources`, `build-library` (katalog + graf + 3D joylashuv), `hire`, `install-hooks` |
| `hooks/office-hook.mjs` | Claude Code hook → ofis serveri |
| `library/` | Hamma agent, skill, buyruq va qo‘llanmalar bitta joyda |

### URL parametrlari

`?night` — tungi rejim · `?speed=3` — simulyatsiyani tezlashtirish · `?nobloom` — kuchsiz kompyuterlar uchun · `?offline` — serverga ulanmaslik.

## Xavfsizlik

- Server faqat `127.0.0.1` da tinglaydi; `Host` va `Origin` sarlavhalari tekshiriladi (DNS rebinding va boshqa saytlardan so‘rovlar bloklanadi).
- Hooklar va UI `~/.ai-agent-office/token` (0600) dagi token bilan autentifikatsiya qilinadi.
- Vazifa bajaruvchi agentlar standart holatda faqat o‘qiy oladi.

---

## 🇬🇧 English

**A 3D office where Claude Code agents, skills and commands live and work.** Everything from six open-source repos — [claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice), [claude-skills](https://github.com/alirezarezvani/claude-skills), [Claude-Office](https://github.com/W17ant/Claude-Office), [graphify](https://github.com/Graphify-Labs/graphify), [hermes-agent](https://github.com/NousResearch/hermes-agent) and [ECC](https://github.com/affaan-m/ECC) — is gathered into `library/`, linked into a Graphify-style knowledge graph and rendered as a living Three.js office.

- **205 agents** sit at desks in **14 departments**; **883 skills** and **253 commands** are books on each department's shelves.
- **Ambient life:** agents fetch skill books, work, consult colleagues they are linked to in the graph, grab coffee and query the central **Graphify Core**.
- **Live mode:** `npm run hooks:install` wires Claude Code hooks to the office. Your prompts, Claude's tool calls, subagents (matched to their desks, or arriving as visitors) and skills (glowing books) show up in real time.
- **Give tasks:** type a task (English or Uzbek); the router picks the best agent and the server runs it through `claude -p` with that agent's definition as the system prompt. Read-only tools by default; set `"allowWrite": true` in `office.config.json` to allow edits.
- **Hire:** install any agent/skill/command into `.claude/` from the inspector or with `npm run hire -- <id>`.
- **Knowledge graph:** 1,386 nodes / 5,087 edges with EXTRACTED vs INFERRED edges, communities by department and "god nodes".

```bash
npm install
npm run dev              # http://localhost:3333
npm start                # build + serve on http://localhost:3334
npm run hooks:install    # connect Claude Code (live mode)
npm run hire -- --list --type agent
npm run sync && npm run build:library   # refresh from upstream
```

Office code is MIT. Library files keep their original licenses (MIT, and Apache-2.0 for Graphify) — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
