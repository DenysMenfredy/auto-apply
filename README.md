# AutoApply CLI

Discovers Software Engineering and AI Engineering jobs from public job boards, builds a
normalized candidate profile from your resume and LinkedIn export, scores each opportunity
against your profile, and exports ranked results.

**Version 0.1 — discovery only.** No applications are submitted.

## Requirements

- Node.js 22+
- pnpm

## Setup

```bash
pnpm install
```

## Usage

```bash
# Check your environment
pnpm dev doctor

# Build and inspect your candidate profile (writes outputs/candidate.json)
pnpm dev profile --resume ./resume.pdf --linkedin ./linkedin-export.json

# Discover, rank and export opportunities
pnpm dev search --resume ./resume.pdf --linkedin ./linkedin-export.json --formats json,csv,markdown
```

Or build a standalone binary entrypoint:

```bash
pnpm build
node dist/autoapply.js search --resume ./resume.pdf
```

### `autoapply search` options

| Flag | Description |
| --- | --- |
| `--resume <path>` | Resume PDF used as a profile source |
| `--linkedin <path\|url>` | LinkedIn JSON export file **or** public profile URL |
| `--formats <list>` | Export formats: `json`, `csv`, `markdown` (comma-separated) |
| `--limit <n>` | Keep at most N results |
| `--min-score <n>` | Drop results scoring below N (0–100) |
| `--max-queries <n>` | Cap the number of search queries |
| `-v, --verbose` | Debug logging |

Results are written to `outputs/` (`results.json`, `results.csv`, `results.md`).

### LinkedIn sources

`--linkedin` accepts two kinds of value:

- **JSON export file** (most reliable): a JSON document with `firstName`/`lastName` (or
  `name`), `headline`, `summary`, `skills`, `positions`/`experience`, `certifications`,
  `languages`. Extra fields are ignored.
- **Public profile URL** (`https://www.linkedin.com/in/<handle>`): best-effort — the CLI
  fetches the logged-out page and parses LinkedIn's JSON-LD Person data plus the guest
  page HTML. LinkedIn frequently serves an authwall to anonymous clients; when that
  happens the command fails with instructions rather than producing an empty profile.
  Skills are usually not visible on guest pages, so expect shallower data than the export.

## Configuration

Defaults live in `configs/default.json` (roles, locations, boards, output formats, cache TTL).
Environment variables (see `.env.example`):

- `AUTOAPPLY_RESUME` / `AUTOAPPLY_LINKEDIN` — default profile source paths
- `AUTOAPPLY_LOG_LEVEL` — pino log level
- `GOOGLE_SEARCH_BASE_URL` — override the search endpoint (see limitation below)
- `AUTOAPPLY_USER_AGENT` — override the HTTP user agent

Precedence: defaults < `configs/default.json` < environment < CLI flags.

## Search providers

Select with `--provider <name>`, `search.provider` in `configs/default.json`, or
`AUTOAPPLY_SEARCH_PROVIDER`:

| Provider | Needs | Notes |
| --- | --- | --- |
| `google` (default) | nothing | Scrapes Google's HTML. **Google blocks most anonymous clients** (rate-limit / JavaScript wall), so expect errors. |
| `google-cse` | API key + engine id | Official Google Custom Search JSON API. Reliable. Free tier: 100 queries/day. **Recommended.** |
| `duckduckgo` | nothing | Keyless HTML endpoint; supports `site:` operators. DuckDuckGo bot-challenges some clients — works from some networks, not others. |

### Setting up `google-cse` (once, ~5 minutes)

1. Create a Programmable Search Engine at <https://programmablesearchengine.google.com>
   and enable **"Search the entire web"**. Copy its **Search engine ID** → `GOOGLE_CSE_ID`.
2. In [Google Cloud Console](https://console.cloud.google.com/apis/library/customsearch.googleapis.com),
   enable the **Custom Search API** and create an **API key** → `GOOGLE_CSE_API_KEY`.
3. Run:

```bash
GOOGLE_CSE_API_KEY=... GOOGLE_CSE_ID=... autoapply search --provider google-cse --resume ./resume.pdf
```

Tip: the free tier is 100 queries/day and results are cached for 24h, so
`--max-queries 25` (the default) leaves room for several runs per day.

## Scoring

Each job gets a 0–100 compatibility score (RF-009): technology overlap (45), backend /
AI / cloud experience (10 each — only charged when the job asks for that category),
seniority alignment (10), years of experience (10), preferred location (5).

Bands (RF-010): Excellent 90–100 · Very Good 80–89 · Good 70–79 · Discard < 70.

## Architecture

Hexagonal + Clean Architecture; dependencies point Infrastructure → Application → Domain.

```
cmd/            CLI (Commander) + composition root — no business logic
src/
  domain/       candidate, job, search, matching — pure business rules
  application/  use cases: BuildCandidateProfile, SearchJobs, ExportResults
  infrastructure/
    sources/    ResumePdfSource, LinkedInSource
    providers/  GoogleSearchProvider
    parser/     ashby, greenhouse, lever, workable, bamboohr
    exporters/  JSON, CSV, Markdown
    cache/      FilesystemCache (24h TTL)
    logging/    pino
  shared/       interfaces (ports), types, utils
```

Every integration sits behind an interface (`ProfileSource`, `SearchProvider`, `JobParser`,
`MatchEngine`, `Exporter`, `CacheProvider`, `HttpClient`), so providers are replaceable
without touching the pipeline. See `ARCHITECTURE.md` and `REQUIREMENTS.md` for the full
specifications.

## Development

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # biome check
pnpm test           # vitest (unit + integration + CLI smoke)
pnpm test:coverage  # enforces 80% minimum
pnpm build          # tsup → dist/autoapply.js
```

## Security notes

- Job page HTML is parsed statically with cheerio; no page JavaScript is ever executed.
- No secrets in the repo; configuration comes from environment variables.
- Candidate data is only written to the configured `outputs/` directory.
