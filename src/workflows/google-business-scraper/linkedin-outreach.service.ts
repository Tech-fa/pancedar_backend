import { Injectable, Logger } from "@nestjs/common";
import { completeUserPrompt } from "src/llm-integration/llm-stream";
import {
  LinkedInPersonProfile,
  RealBrowserService,
} from "../../resource-ingestion/real-browser";

export type LinkedInOutreachResult = {
  linkedinContactProfileUrl: string | null;
  linkedinOutreachSummary: string | null;
  skipReason?: string;
};

@Injectable()
export class LinkedInOutreachService {
  private readonly logger = new Logger(LinkedInOutreachService.name);

  constructor(private readonly realBrowser: RealBrowserService) {}

  /**
   * Scrapes company /people, picks the best contact via LLM, reads recent activity,
   * and drafts a personalized outreach message.
   */
  async runOutreach(
    companyLinkedInUrl: string,
    keywords: string[],
  ): Promise<LinkedInOutreachResult> {
    const empty: LinkedInOutreachResult = {
      linkedinContactProfileUrl: null,
      linkedinOutreachSummary: null,
    };

    if (!companyLinkedInUrl?.trim()) {
      return { ...empty, skipReason: "no_linkedin_url" };
    }

    const peopleData = await this.realBrowser.collectLinkedInPeopleProfiles(
      companyLinkedInUrl,
    );
    if (peopleData.skipReason) {
      this.logger.log(
        `[linkedin-outreach] skipped: ${peopleData.skipReason}`,
      );
      return { ...empty, skipReason: peopleData.skipReason };
    }
    if (!peopleData.profiles.length) {
      return { ...empty, skipReason: "no_profiles_found" };
    }

    const selected = await this.pickMostRelevantProfile(
      peopleData.profiles,
      keywords,
    );
    if (!selected) {
      return { ...empty, skipReason: "no_profile_selected" };
    }

    const activitySnippets =
      await this.realBrowser.collectLinkedInProfileActivitySnippets(
        selected.profileUrl,
        5,
      );

    const summary = await this.summarizeOutreachMessage(
      keywords,
      selected,
      activitySnippets,
    );

    return {
      linkedinContactProfileUrl: selected.profileUrl,
      linkedinOutreachSummary: summary,
    };
  }

  private async pickMostRelevantProfile(
    profiles: LinkedInPersonProfile[],
    keywords: string[],
  ): Promise<LinkedInPersonProfile | null> {
    if (profiles.length === 1) {
      return profiles[0];
    }

    const apiUrl = process.env.LLM_API_URL;
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    if (!apiUrl?.trim() || !apiKey?.trim() || !model?.trim()) {
      this.logger.warn(
        "[linkedin-outreach] LLM not configured; using first profile",
      );
      return profiles[0];
    }

    const profileList = profiles
      .map(
        (p, i) =>
          `${i}: name="${p.name}", position="${p.position}", url=${p.profileUrl}`,
      )
      .join("\n");

    const prompt = `You help pick the best LinkedIn contact at a company for B2B outreach.

Keywords we matched on the company's website:
${keywords.map((k) => `- ${k}`).join("\n")}

Candidates:
${profileList}

Pick the single person most likely to care about or own topics related to those keywords (role seniority and title relevance matter).

Respond ONLY with JSON (no markdown):
{"profileIndex": number, "reason": "one short sentence"}`;

    try {
      const raw = await completeUserPrompt({
        apiUrl,
        apiKey,
        model,
        messages: [{ role: "system", content: prompt }],
      });
      const parsed = this.parseJsonObject(raw);
      const idx = Number(parsed?.profileIndex);
      if (Number.isInteger(idx) && idx >= 0 && idx < profiles.length) {
        return profiles[idx];
      }
    } catch (e) {
      this.logger.warn(
        `[linkedin-outreach] profile pick LLM failed: ${(e as Error).message}`,
      );
    }
    return profiles[0];
  }

  private async summarizeOutreachMessage(
    keywords: string[],
    profile: LinkedInPersonProfile,
    activitySnippets: string[],
  ): Promise<string> {
    const apiUrl = process.env.LLM_API_URL;
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    if (!apiUrl?.trim() || !apiKey?.trim() || !model?.trim()) {
      return `Hi ${profile.name}, I noticed your work as ${profile.position} and thought we might connect regarding ${keywords.join(", ")}.`;
    }

    const postsBlock =
      activitySnippets.length > 0
        ? activitySnippets.map((t, i) => `[${i + 1}] ${t}`).join("\n\n")
        : "(No recent public posts were available.)";

    const prompt = `You write short, warm LinkedIn connection or InMail openers (2-4 sentences max).

Target person:
- Name: ${profile.name}
- Position: ${profile.position}

Topics we want to relate to (from their company website):
${keywords.map((k) => `- ${k}`).join("\n")}

Their recent LinkedIn activity snippets:
${postsBlock}

Write one message the sender can paste. Reference something specific from their posts when possible; otherwise tie to their role and the keywords. Sound human, not salesy. Do not use placeholders like [Name]. Return only the message text, no quotes or labels.`;

    try {
      const text = await completeUserPrompt({
        apiUrl,
        apiKey,
        model,
        messages: [{ role: "system", content: prompt }],
      });
      const trimmed = text.trim();
      if (trimmed) {
        return trimmed;
      }
    } catch (e) {
      this.logger.warn(
        `[linkedin-outreach] summary LLM failed: ${(e as Error).message}`,
      );
    }

    return `Hi ${profile.name}, I came across your profile and your recent posts resonated with what we're working on around ${keywords.slice(0, 2).join(" and ")}. Would love to connect.`;
  }

  private parseJsonObject(raw: string): Record<string, unknown> | null {
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.slice(7);
      }
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3);
      }
      return JSON.parse(cleaned.trim()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
