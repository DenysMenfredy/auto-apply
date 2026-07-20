import * as cheerio from "cheerio";
import { detectBoard } from "../../../domain/job/boards.js";
import type { Job } from "../../../domain/job/job.js";
import type { HttpClient } from "../../../shared/interfaces/http-client.js";
import type { JobParser } from "../../../shared/interfaces/job-parser.js";
import { extractJsonLdJobPosting, fetchPage, finalizeJob, htmlToText } from "../extractors.js";

/**
 * Parser for <company>.bamboohr.com/careers/<id> pages. BambooHR careers
 * pages embed JobPosting JSON-LD; the company name falls back to the
 * subdomain when metadata is missing.
 */
export class BambooHrParser implements JobParser {
  readonly board = "bamboohr" as const;

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
    const companyFromSubdomain = url.hostname.split(".")[0] ?? "";

    const description = jsonLd?.descriptionHtml
      ? htmlToText(jsonLd.descriptionHtml)
      : htmlToText(
          $('[class*="description"]').first().html() ?? $("main").html() ?? $("body").html() ?? "",
        );

    return finalizeJob(this.board, url, {
      title:
        jsonLd?.title ??
        ($('meta[property="og:title"]').attr("content")?.trim() || $("h1").first().text().trim()),
      company:
        jsonLd?.company ??
        ($('meta[property="og:site_name"]').attr("content")?.trim() || companyFromSubdomain),
      description,
      location: jsonLd?.location ?? $('[class*="location"]').first().text().trim(),
      ...(jsonLd?.employmentType ? { employmentType: jsonLd.employmentType } : {}),
    });
  }
}
