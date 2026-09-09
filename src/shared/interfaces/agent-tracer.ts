import type { TokenUsage } from "../../domain/agent/budget.js";

/** One unit of traced work inside an agent run. */
export interface Span {
  /** Records model token usage against this span. */
  recordUsage(usage: TokenUsage, costUsd: number): void;
  /** Ends the span; `error` marks it failed. */
  end(error?: Error): void;
}

export interface SpanAttributes {
  node?: string;
  provider?: string;
  model?: string;
  tier?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Observability port (AGENT_PLAN §7). Vendor-neutral by design: the LangSmith
 * implementation and an OpenTelemetry one satisfy the same contract, and the
 * agent degrades to Pino-only logging when no tracer is configured.
 */
export interface AgentTracer {
  startSpan(name: string, attributes?: SpanAttributes): Span;
  /** Correlates traces with the structured log stream. */
  readonly runId: string;
}
