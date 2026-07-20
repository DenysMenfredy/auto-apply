/**
 * Canonical technology vocabulary and alias table.
 *
 * Aliases are matched case-insensitively on word boundaries so that free text
 * ("we use node and k8s") and structured skill lists both normalize to the
 * same canonical names.
 */
const TECHNOLOGY_ALIASES: Record<string, string[]> = {
  "Node.js": ["node.js", "nodejs", "node js", "node"],
  TypeScript: ["typescript", "ts"],
  JavaScript: ["javascript", "js", "ecmascript"],
  Python: ["python", "python3"],
  Go: ["golang", "Go"],
  Java: ["java"],
  AWS: ["aws", "amazon web services"],
  GCP: ["gcp", "google cloud", "google cloud platform"],
  Azure: ["azure", "microsoft azure"],
  Docker: ["docker"],
  Kubernetes: ["kubernetes", "k8s"],
  Terraform: ["terraform"],
  PostgreSQL: ["postgresql", "postgres"],
  MySQL: ["mysql"],
  MongoDB: ["mongodb", "mongo"],
  Redis: ["redis"],
  Kafka: ["kafka", "apache kafka"],
  RabbitMQ: ["rabbitmq"],
  GraphQL: ["graphql"],
  REST: ["rest", "restful", "rest api", "rest apis"],
  gRPC: ["grpc"],
  React: ["react", "react.js", "reactjs"],
  "Next.js": ["next.js", "nextjs"],
  Vue: ["vue", "vue.js", "vuejs"],
  Angular: ["angular"],
  NestJS: ["nestjs", "nest.js"],
  Express: ["express", "express.js", "expressjs"],
  Fastify: ["fastify"],
  Django: ["django"],
  Flask: ["flask"],
  FastAPI: ["fastapi"],
  ".NET": [".net", "dotnet", "c#", "csharp"],
  Ruby: ["ruby", "ruby on rails", "rails"],
  PHP: ["php", "laravel"],
  Rust: ["rust"],
  AI: ["ai", "artificial intelligence"],
  "Machine Learning": ["machine learning", "ml"],
  "Deep Learning": ["deep learning"],
  LLM: ["llm", "llms", "large language model", "large language models"],
  NLP: ["nlp", "natural language processing"],
  RAG: ["rag", "retrieval augmented generation", "retrieval-augmented generation"],
  LangChain: ["langchain"],
  OpenAI: ["openai", "gpt-4", "gpt4", "chatgpt"],
  Anthropic: ["anthropic", "claude"],
  PyTorch: ["pytorch", "torch"],
  TensorFlow: ["tensorflow"],
  "scikit-learn": ["scikit-learn", "sklearn", "scikit learn"],
  Pandas: ["pandas"],
  NumPy: ["numpy"],
  Spark: ["spark", "apache spark", "pyspark"],
  Airflow: ["airflow", "apache airflow"],
  SQL: ["sql"],
  NoSQL: ["nosql"],
  Elasticsearch: ["elasticsearch", "elastic search", "opensearch"],
  Git: ["git"],
  "CI/CD": ["ci/cd", "cicd", "continuous integration", "continuous delivery"],
  Linux: ["linux"],
  Microservices: ["microservices", "micro-services", "microservice"],
  Serverless: ["serverless", "aws lambda", "lambda"],
  Vitest: ["vitest"],
  Jest: ["jest"],
};

const CATEGORY_TECHNOLOGIES: Record<"backend" | "ai" | "cloud", string[]> = {
  backend: [
    "Node.js",
    "TypeScript",
    "JavaScript",
    "Python",
    "Go",
    "Java",
    ".NET",
    "Ruby",
    "PHP",
    "Rust",
    "PostgreSQL",
    "MySQL",
    "MongoDB",
    "Redis",
    "Kafka",
    "RabbitMQ",
    "GraphQL",
    "REST",
    "gRPC",
    "NestJS",
    "Express",
    "Fastify",
    "Django",
    "Flask",
    "FastAPI",
    "SQL",
    "Microservices",
  ],
  ai: [
    "AI",
    "Machine Learning",
    "Deep Learning",
    "LLM",
    "NLP",
    "RAG",
    "LangChain",
    "OpenAI",
    "Anthropic",
    "PyTorch",
    "TensorFlow",
    "scikit-learn",
    "Pandas",
    "NumPy",
    "Spark",
  ],
  cloud: ["AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "Serverless", "CI/CD"],
};

interface AliasEntry {
  canonical: string;
  pattern: RegExp;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Aliases written with an uppercase letter (e.g. "Go") match case-sensitively:
// lowercase "go" is an ordinary English word, not a technology mention.
const ALIAS_ENTRIES: AliasEntry[] = Object.entries(TECHNOLOGY_ALIASES).flatMap(
  ([canonical, aliases]) =>
    aliases.map((alias) => ({
      canonical,
      pattern: new RegExp(
        `(?<![\\w.#+])${escapeRegExp(alias)}(?![\\w+])`,
        /[A-Z]/.test(alias) ? "" : "i",
      ),
    })),
);

const ALIAS_LOOKUP = new Map<string, string>(
  Object.entries(TECHNOLOGY_ALIASES).flatMap(([canonical, aliases]) => [
    [canonical.toLowerCase(), canonical] as const,
    ...aliases.map((alias) => [alias, canonical] as const),
  ]),
);

/**
 * Normalize a single skill or technology label to its canonical name.
 * Unknown labels are trimmed and returned as-is so no information is lost.
 */
export function normalizeTechnology(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return trimmed;
  return ALIAS_LOOKUP.get(trimmed.toLowerCase()) ?? trimmed;
}

/**
 * Normalize a list of labels, removing duplicates (case-insensitive) and
 * empty entries while preserving first-seen order.
 */
export function normalizeTechnologies(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw) {
    const normalized = normalizeTechnology(entry);
    const key = normalized.toLowerCase();
    if (normalized.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

/** Extract every known technology mentioned in free text. */
export function extractTechnologies(text: string): string[] {
  const found = new Set<string>();
  for (const { canonical, pattern } of ALIAS_ENTRIES) {
    if (found.has(canonical)) continue;
    if (pattern.test(text)) found.add(canonical);
  }
  return [...found];
}

/** True when any of the technologies belongs to the given category. */
export function hasCategoryExperience(
  technologies: readonly string[],
  category: keyof typeof CATEGORY_TECHNOLOGIES,
): boolean {
  const wanted = new Set(CATEGORY_TECHNOLOGIES[category].map((t) => t.toLowerCase()));
  return technologies.some((t) => wanted.has(t.toLowerCase()));
}
