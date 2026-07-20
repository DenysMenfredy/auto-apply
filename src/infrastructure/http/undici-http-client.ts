import { fetch } from "undici";
import type { HttpClient, HttpResponse } from "../../shared/interfaces/http-client.js";

// `||` not `??`: an empty AUTOAPPLY_USER_AGENT= line in .env must not send a blank UA.
const DEFAULT_USER_AGENT =
  process.env.AUTOAPPLY_USER_AGENT ||
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export class UndiciHttpClient implements HttpClient {
  constructor(private readonly timeoutMs = 15_000) {}

  async get(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        ...headers,
      },
    });
    return { status: response.status, body: await response.text() };
  }
}
