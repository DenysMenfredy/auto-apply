import * as cheerio from "cheerio";
import { detectBoard } from "../../../domain/job/boards.js";
import type { Job } from "../../../domain/job/job.js";
import type { HttpClient } from "../../../shared/interfaces/http-client.js";
import type { JobParser } from "../../../shared/interfaces/job-parser.js";
import { extractJsonLdJobPosting, fetchPage, finalizeJob, htmlToText } from "../extractors.js";

/**
 * Parser for jobs.lever.co/<company>/<job-uuid> pages. Lever's server-rendered
 * markup (.posting-*) is stable; JSON-LD is used when present.
 */
export class LeverParser implements JobParser {
  readonly board = "lever" as const;

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
      : htmlToText(
          $(".posting-page .section-wrapper").html() ??
            $(".content").html() ??
            $("body").html() ??
            "",
        );

    const categories = $(".posting-categories");

    return finalizeJob(this.board, url, {
      title:
        jsonLd?.title ??
        ($(".posting-headline h2").first().text().trim() || $("h2").first().text().trim()),
      company:
        jsonLd?.company ??
        ($('meta[property="og:site_name"]').attr("content")?.trim() || companyFromPath),
      description,
      location:
        jsonLd?.location ?? categories.find(".location").first().text().replace(/\/$/, "").trim(),
      ...(categories.find(".commitment").length > 0
        ? { employmentType: categories.find(".commitment").first().text().trim() }
        : {}),
    });
  }
}
