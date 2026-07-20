import * as cheerio from "cheerio";
import { detectBoard } from "../../../domain/job/boards.js";
import type { Job } from "../../../domain/job/job.js";
import type { HttpClient } from "../../../shared/interfaces/http-client.js";
import type { JobParser } from "../../../shared/interfaces/job-parser.js";
import { extractJsonLdJobPosting, fetchPage, finalizeJob, htmlToText } from "../extractors.js";

/**
 * Parser for jobs.ashbyhq.com/<org>/<job-uuid> pages.
 * Primary source is JSON-LD; falls back to OpenGraph tags, whose title is
 * formatted as "Job Title @ Company".
 */
export class AshbyParser implements JobParser {
  readonly board = "ashby" as const;

  constructor(private readonly http: HttpClient) {}

  supports(url: URL): boolean {
    return detectBoard(url) === this.board;
  }

  async parse(url: URL): Promise<Job> {
    return this.parseHtml(await fetchPage(this.http, url), url);
  }

  parseHtml(html: string, url: URL): Job {
    const $ = cheerio.load(html);
    const jsonLd = extractJsonLdJobPosting($);

    const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
    const [ogJobTitle = "", ogCompany = ""] = ogTitle.split("@").map((part) => part.trim());
    const companyFromPath = url.pathname.split("/").filter(Boolean)[0] ?? "";

    const description = jsonLd?.descriptionHtml
      ? htmlToText(jsonLd.descriptionHtml)
      : htmlToText($("main").html() ?? $("body").html() ?? "");

    return finalizeJob(this.board, url, {
      title: jsonLd?.title ?? ogJobTitle ?? $("h1").first().text().trim(),
      company: jsonLd?.company ?? ogCompany ?? companyFromPath,
      description,
      location:
        jsonLd?.location ?? $('meta[property="og:description"]').attr("content")?.trim() ?? "",
      ...(jsonLd?.employmentType ? { employmentType: jsonLd.employmentType } : {}),
    });
  }
}
