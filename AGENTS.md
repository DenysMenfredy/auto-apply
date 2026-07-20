# AGENTS.md

# AutoApply CLI

Repository guidance for AI coding agents.

This document is the source of truth for repository conventions and development workflow.

---

## Project Overview

AutoApply CLI discovers Software Engineering and AI Engineering jobs from public job boards, builds a normalized candidate profile from a Resume and LinkedIn profile, ranks job compatibility, and exports the results.

Version: v0.1

Current scope is **discovery only**.

The system **must not** submit job applications.

Future versions will introduce ATS automation.

---

## Product Goals

The primary objective is to build a production-quality platform capable of becoming a fully automated job application system.

Current milestone:

- Parse Resume PDF
- Parse LinkedIn profile
- Discover jobs
- Parse job descriptions
- Calculate compatibility score
- Export ranked opportunities

---

## Source of Truth

When making implementation decisions, follow these documents in order:

1. @REQUIREMENTS.md
2. @ARCHITECTURE.md
3. @TASKS.md

If implementation conflicts with any specification, update the implementation—not the specification.

---

# Engineering Principles

Always prioritize:

- Modularity
- Readability
- Testability
- Maintainability
- Low coupling
- High cohesion

Never optimize prematurely.

Always prefer correctness over cleverness.

---

# Architecture Rules

Use Clean Architecture with Hexagonal principles.

Dependency direction must always be:

Infrastructure
→ Application
→ Domain

Domain must never import Infrastructure.

Business rules belong only inside the Domain layer.

CLI is only an interface.

Business logic must never live inside CLI commands.

---

# Project Structure

```
cmd/
application/
domain/
infrastructure/
shared/
configs/
tests/
outputs/
```

Create new modules only when they have a clear responsibility.

Avoid "utils" dumping grounds.

---

# Dependency Injection

Depend on interfaces.

Never instantiate Infrastructure dependencies inside Domain or Application.

Construct dependencies at the application entrypoint.

---

# Domain Model

Main entities:

- CandidateProfile
- Job
- Match
- SearchQuery
- SearchResult

These models represent the business language.

Do not pollute them with framework-specific concerns.

---

# Job Boards

Supported providers:

- Ashby
- Greenhouse
- Lever
- Workable
- BambooHR

Every board parser must implement the same interface.

Never duplicate parsing logic across providers.

---

# Search

Google Search is currently the only search provider.

Google Search must be abstracted behind:

SearchProvider

Future providers:

- Bing
- DuckDuckGo
- SerpAPI

The rest of the system must never know which provider is being used.

---

# Candidate Profile

Candidate data originates from:

- Resume PDF
- LinkedIn

The merge process must generate a single normalized CandidateProfile.

Future profile sources:

- GitHub
- Portfolio
- Kaggle
- Google Scholar

Do not hardcode assumptions that prevent additional profile sources.

---

# Matching

The matching engine is independent.

The current implementation uses keyword scoring.

Future implementations may include:

- Embeddings
- Semantic Search
- LLM evaluation

Never couple parsers to matching logic.

---

# Export

Supported exporters:

- JSON
- CSV
- Markdown

Future exporters:

- Notion
- Google Sheets
- Airtable

Always program against the Exporter interface.

---

# Error Handling

Never silently ignore errors.

Recover whenever possible.

Provide actionable error messages.

Unexpected situations should fail fast.

---

# Logging

Use structured logging.

Avoid console.log.

Log meaningful milestones only.

Example:

Searching jobs...

Parsing resume...

Building candidate profile...

Ranking jobs...

Export completed.

---

# Testing

Every new feature requires tests.

Minimum expectations:

- Unit tests for business logic
- Integration tests for providers
- CLI smoke tests

Do not merge code with failing tests.

---

# Code Style

Language:

TypeScript

Runtime:

Node.js

Package Manager:

pnpm

Formatting:

Biome

Testing:

Vitest

Logging:

Pino

Validation:

Zod

HTTP:

Undici

HTML Parsing:

Cheerio

CLI:

Commander

Build:

tsup

---

# Performance

Prefer streaming over loading large datasets into memory.

Avoid unnecessary network requests.

Use caching where applicable.

Target:

100 jobs processed in under 60 seconds.

---

# Security

Never execute arbitrary HTML.

Never evaluate JavaScript from job pages.

Never store sensitive candidate information outside configured outputs.

Never commit secrets.

Use environment variables.

---

# Future Compatibility

Current implementation is CLI-only.

Design every module so it can later be reused by:

- REST API
- Background Workers
- Scheduler
- Web Dashboard
- Desktop Application

No business logic should require CLI.

---

# Definition of Done

A task is complete only if:

- Requirements are satisfied
- Tests pass
- Types pass
- Lint passes
- No duplicated business logic
- Public APIs are documented
- Architecture remains modular

---

# Anti-Patterns

Do not:

- create God classes
- create utility dumping grounds
- duplicate parser logic
- duplicate matching logic
- couple infrastructure to domain
- hardcode job boards
- hardcode search providers
- hardcode scoring rules

---

# Agent Behavior

Before implementing:

1. Read REQUIREMENTS.md.
2. Read ARCHITECTURE.md.
3. Read TASKS.md.

Implement only the current task.

Do not implement future roadmap items unless explicitly requested.

When uncertain, preserve architecture over implementation speed.

Favor small, reviewable commits.

Do not introduce new dependencies unless they provide clear value.

Keep changes minimal, cohesive, and reversible.
