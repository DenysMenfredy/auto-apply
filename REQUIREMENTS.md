# AutoApply CLI

## Requirements Specification

Version: 0.1

---

# Vision

AutoApply CLI is a command-line application capable of discovering Software Engineering and AI Engineering opportunities, extracting job information, and ranking each opportunity according to the candidate's professional profile.

The first version is intentionally read-only.

No job applications will be submitted.

---

# Functional Requirements

## RF-001 — Candidate Profile

The system shall build a unified Candidate Profile from:

- Resume (PDF)
- LinkedIn Profile

The profile must be converted into a normalized JSON representation.

---

## RF-002 — Resume Parsing

The system shall parse a PDF resume and extract:

- Name
- Summary
- Experience
- Skills
- Technologies
- Education
- Certifications
- Languages
- Seniority
- Years of experience

---

## RF-003 — LinkedIn Parsing

The system shall parse a LinkedIn exported profile (JSON or HTML in future versions).

Initially the parser will support JSON.

The extracted information must include:

- Headline
- About
- Experience
- Skills
- Certifications
- Technologies

---

## RF-004 — Candidate Profile Merge

The system shall merge Resume and LinkedIn information into a single Candidate Profile.

Duplicate skills shall be removed.

---

## RF-005 — Search Query Generation

The system shall automatically generate Google search queries.

The queries must consider:

Preferred Roles

- Software Engineer
- Backend Engineer
- AI Engineer
- Machine Learning Engineer
- Full Stack Engineer

Preferred Technologies

- Node.js
- TypeScript
- Python
- AWS
- LLM
- AI
- Machine Learning

Preferred Location

- Remote
- LATAM
- US
- Europe

---

## RF-006 — Google Search

The system shall search Google using Google Hacking operators.

Supported boards:

- Ashby
- Greenhouse
- Lever
- BambooHR
- Workable

---

## RF-007 — URL Collection

The system shall collect job URLs.

Duplicate URLs must be removed.

---

## RF-008 — Job Parsing

For every discovered job, extract:

- Title
- Company
- Location
- Remote
- Salary (if available)
- Description
- Requirements
- Responsibilities
- Technologies
- Employment Type
- Seniority
- URL
- Job Board

---

## RF-009 — Job Matching

Each job shall receive a compatibility score between:

0 and 100

The score must consider:

- Technology overlap
- Years of experience
- Seniority
- AI experience
- Backend experience
- Cloud experience
- Preferred location

---

## RF-010 — Ranking

Jobs shall be sorted by descending score.

---

## RF-011 — Export

Results shall be exportable to:

- JSON
- CSV
- Markdown

---

# Non Functional Requirements

## RNF-001

Execution shall occur entirely through CLI.

---

## RNF-002

The architecture shall be modular.

---

## RNF-003

Every module shall depend only on interfaces.

---

## RNF-004

Business rules shall not depend on CLI implementation.

---

## RNF-005

The search engine shall be replaceable.

Google Search is only the first provider.

---

## RNF-006

The parser for each job board shall be independent.

---

## RNF-007

The matching engine shall be independent from search and parsing.

---

## RNF-008

The application shall support future expansion to:

- REST API
- Web Dashboard
- Automatic Applications
- AI Agents

without major architectural changes.

---

# Acceptance Criteria

Given a resume and LinkedIn profile

When:

autoapply search

is executed

Then:

✓ Candidate Profile is generated

✓ Google searches are executed

✓ Jobs are collected

✓ Jobs are parsed

✓ Match score is calculated

✓ Jobs are ranked

✓ Results are exported
