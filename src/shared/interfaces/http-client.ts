export interface HttpResponse {
  status: number;
  body: string;
}

/** Minimal HTTP abstraction so providers and parsers stay testable offline. */
export interface HttpClient {
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
}
