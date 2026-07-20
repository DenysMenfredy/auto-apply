import * as cheerio from "cheerio";
import { detectBoard } from "../../../domain/job/boards.js";
import type { Job } from "../../../domain/job/job.js";
import type { HttpClient } from "../../../shared/interfaces/http-client.js";
import type { JobParser } from "../../../shared/interfaces/job-parser.js";
import { extractJsonLdJobPosting, fetchPage, finalizeJob, htmlToText } from "../extractors.js";

/**
 * Parser for apply.workable.com/<company>/j/<id> and jobs.workable.com/view/<id>
 * pages. Both embed schema.org JobPosting JSON-LD; DOM fallbacks handle
 * postings that omit it.
 */
export class WorkableParser implements JobParser {
  readonly board = "workable" as const;

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
    const companyFromPath =
      url.hostname === "apply.workable.com"
        ? (url.pathname.split("/").filter(Boolean)[0] ?? "")
        : "";

    const description = jsonLd?.descriptionHtml
      ? htmlToText(jsonLd.descriptionHtml)
      : htmlToText(
          $('[data-ui="job-description"]').html() ?? $("main").html() ?? $("body").html() ?? "",
        );

    return finalizeJob(this.board, url, {
      title: jsonLd?.title ?? $("h1").first().text().trim(),
      company:
        jsonLd?.company ??
        ($('[data-ui="company-name"]').first().text().trim() ||
          $('meta[property="og:site_name"]').attr("content")?.trim() ||
          companyFromPath),
      description,
      location: jsonLd?.location ?? $('[data-ui="job-location"]').first().text().trim(),
      ...(jsonLd?.employmentType ? { employmentType: jsonLd.employmentType } : {}),
    });
  }
}
