# Architecture

Version 0.1

---

# Architecture Style

Hexagonal Architecture

+

Clean Architecture

+

Domain Driven Design (lightweight)

---

# Layers

CLI

↓

Application

↓

Domain

↓

Infrastructure

---

# Modules

cmd/

application/

domain/

infrastructure/

shared/

---

# Domain

Candidate

Job

Match

Search

Ranking

---

# Application

Use Cases

SearchJobs

ParseResume

ParseLinkedIn

BuildCandidateProfile

RankJobs

ExportResults

---

# Infrastructure

Google Provider

Ashby Parser

Lever Parser

Greenhouse Parser

Bamboo Parser

Workable Parser

Filesystem

Cache

Logger

---

# Shared

Configuration

Utilities

Interfaces

Types

---

# Dependency Rule

Infrastructure

↓

Application

↓

Domain

Domain never depends on Infrastructure.

---

# Candidate Profile Flow

Resume PDF

↓

Resume Parser

↓

LinkedIn Parser

↓

Candidate Builder

↓

Candidate JSON

---

# Search Flow

Candidate

↓

Query Generator

↓

Google Provider

↓

URLs

↓

Board Detection

↓

Specific Parser

↓

Job

↓

Matcher

↓

Ranking

↓

Exporter

---

# Future Modules

Database

Application History

Resume Optimizer

Cover Letter Generator

Playwright

ATS Automation

Dashboard

Notification Service

Scheduler

---

# Storage

V1

Filesystem

cache/

outputs/

V2

SQLite

V3

PostgreSQL

---

# Cache

Interface only.

Implementation comes later.

CacheProvider

Future implementations:

Filesystem

SQLite

Redis

---

# Search Provider

interface SearchProvider

GoogleProvider

BingProvider

DuckDuckGoProvider

Future:

SerpAPI

Google Custom Search

---

# Parser Provider

interface JobParser

AshbyParser

GreenhouseParser

LeverParser

WorkableParser

---

# Match Provider

interface MatchEngine

KeywordMatch

SemanticMatch

LLMMatch

---

# Export Provider

interface Exporter

JsonExporter

CsvExporter

MarkdownExporter

Future

NotionExporter

SheetsExporter

AirtableExporter

---

# Tech Stack

Language

TypeScript

Runtime

Node.js

CLI

Commander

Validation

Zod

Logging

Pino

HTTP

Undici

Parsing

Cheerio

Testing

Vitest

Package Manager

pnpm

Formatting

Biome

Lint

Biome

Build

tsup

Configuration

dotenv
