import * as cheerio from "cheerio";
import { detectBoard } from "../../../domain/job/boards.js";
import type { Job } from "../../../domain/job/job.js";
import type { HttpClient } from "../../../shared/interfaces/http-client.js";
import type { JobParser } from "../../../shared/interfaces/job-parser.js";
import { extractJsonLdJobPosting, fetchPage, finalizeJob, htmlToText } from "../extractors.js";

/**
 * Parser for boards.greenhouse.io/<company>/jobs/<id> pages (classic layout)
 * and job-boards.greenhouse.io (new layout). JSON-LD first, CSS fallbacks.
 */
export class GreenhouseParser implements JobParser {
  readonly board = "greenhouse" as const;

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
    const companyFromPath = url.pathname.split("/").filter(Boolean)[0] ?? "";

    const description = jsonLd?.descriptionHtml
      ? htmlToText(jsonLd.descriptionHtml)
      : htmlToText($("#content").html() ?? $(".job__description").html() ?? $("body").html() ?? "");

    return finalizeJob(this.board, url, {
      title:
        jsonLd?.title ??
        ($(".app-title").first().text().trim() ||
          $("h1.section-header--title").first().text().trim() ||
          $("h1").first().text().trim()),
      company:
        jsonLd?.company ??
        ($(".company-name")
          .first()
          .text()
          .replace(/^at\s+/i, "")
          .trim() ||
          companyFromPath),
      description,
      location:
        jsonLd?.location ??
        ($(".location").first().text().trim() || $(".job__location").first().text().trim()),
      ...(jsonLd?.employmentType ? { employmentType: jsonLd.employmentType } : {}),
    });
  }
}
