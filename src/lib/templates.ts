/** v2.1 — note templates ("Insert template" in the note ⋯ menu). Additive. */

export interface NoteTemplate {
  id: string;
  label: string;
  hint: string;
  md: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "daily",
    label: "Daily journal",
    hint: "Gratitude, wins, focus",
    md: `# Daily Journal — ${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

## 🎯 Top 3 priorities
- [ ] 
- [ ] 
- [ ] 

## ✅ Done today
- 

## 💡 Notes & ideas
- 

## 🌱 Grateful for
- 
`,
  },
  {
    id: "meeting",
    label: "Meeting notes",
    hint: "Agenda → decisions → actions",
    md: `# Meeting — ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}

**Attendees:** 
**Agenda:** 

## Discussion
- 

## Decisions
- 

## Action items
- [ ] @owner — task — due 
`,
  },
  {
    id: "bug",
    label: "Bug report",
    hint: "Repro, expected, actual",
    md: `# Bug: <short title>

**Severity:** low / medium / high · **Area:** 

## Steps to reproduce
1. 
2. 

**Expected:** 
**Actual:** 

\`\`\`bash
# error output / logs
\`\`\`

**Environment:** browser / OS / version
`,
  },
  {
    id: "review",
    label: "Code review",
    hint: "Checklist + findings",
    md: `# Code review — <PR / file>

## Checklist
- [ ] Correctness
- [ ] Edge cases & error handling
- [ ] Tests cover the change
- [ ] Readability & naming
- [ ] Security (input validation, secrets)
- [ ] Performance

## Findings

| # | Severity | File : line | Note |
|---|----------|-------------|------|
| 1 | minor |  |  |

## Verdict
approve / request changes
`,
  },
  {
    id: "readme",
    label: "Project README",
    hint: "Overview, quickstart, API",
    md: `# Project name

One-line description.

## Features
- 

## Quickstart
\`\`\`bash
git clone <url>
cd project
npm install && npm run dev
\`\`\`

## Configuration
| Variable | Default | Purpose |
|----------|---------|---------|
|  |  |  |

## License
`,
  },
];
