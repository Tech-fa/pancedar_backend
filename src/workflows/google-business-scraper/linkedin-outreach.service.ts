import { Injectable, Logger } from "@nestjs/common";
import { completeUserPrompt } from "src/llm-integration/llm-stream";
import { Connector } from "../../connector/connector.entity";
import {
  LinkedInAuthCredentials,
  LinkedInCompanyProfile,
  LinkedInPersonProfile,
  RealBrowserService,
} from "../../resource-ingestion/real-browser";
import { decrypt } from "../../util/helper-util";

import type { Browser } from "rebrowser-puppeteer-core";

const LINKEDIN_USERNAME_FIELD = "LinkedIn Username";
const LINKEDIN_PASSWORD_FIELD = "LinkedIn Password";

export type LinkedInOutreachResult = {
  linkedinContactProfileUrl: string | null;
  linkedinOutreachSummary: string | null;
  contactName?: string | null;
  contactPosition?: string | null;
  skipReason?: string;
};

export type LinkedInCompanySearchLeadResult = {
  company: LinkedInCompanyProfile;
  outreach: LinkedInOutreachResult;
  contactName?: string | null;
  contactPosition?: string | null;
  status: "completed" | "skipped" | "failed";
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
    selectionCriteria: string,
    messageTopic: string,
    credentials?: LinkedInAuthCredentials,
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
      credentials,
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
      selectionCriteria,
    );
    if (!selected) {
      return { ...empty, skipReason: "no_profile_selected" };
    }

    const activitySnippets = selected.profileUrl
      ? await this.realBrowser.collectLinkedInProfileActivitySnippets(
          selected.profileUrl,
          5,
          credentials,
        )
      : [];

    const summary = await this.summarizeOutreachMessage(
      messageTopic,
      selected,
      activitySnippets,
    );

    return {
      linkedinContactProfileUrl: selected.profileUrl ?? null,
      linkedinOutreachSummary: summary,
      contactName: selected.name,
      contactPosition: selected.position,
    };
  }

  /**
   * Visits one member profile's recent activity and drafts outreach from workflow keywords.
   */
  async runOutreachForProfile(
    profile: LinkedInPersonProfile,
    messageTopic: string,
    credentials?: LinkedInAuthCredentials,
    browser?: Browser,
  ): Promise<LinkedInOutreachResult> {
    const empty: LinkedInOutreachResult = {
      linkedinContactProfileUrl: profile.profileUrl ?? null,
      linkedinOutreachSummary: null,
    };

    if (!profile.profileUrl?.trim()) {
      return { ...empty, skipReason: "no_profile_url" };
    }

    const activitySnippets =
      await this.realBrowser.collectLinkedInProfileActivitySnippets(
        profile.profileUrl,
        5,
        credentials,
        browser
      );

    const summary = await this.summarizeOutreachMessage(
      messageTopic,
      profile,
      activitySnippets,
    );

    return {
      linkedinContactProfileUrl: profile.profileUrl,
      linkedinOutreachSummary: summary,
    };
  }

  /**
   * Loads company page URLs from a LinkedIn company search URL.
   */
  async collectCompaniesFromSearch(
    searchUrl: string,
    credentials?: LinkedInAuthCredentials,
    startPage = 1,
    maxPages = 10,
  ): Promise<{
    companies: LinkedInCompanyProfile[];
    skipReason?: string;
  }> {
    const scrapeResult =
      await this.realBrowser.collectLinkedInSearchCompanyUrls(
        searchUrl,
        maxPages,
        credentials,
        startPage,
      );

    return {
      companies: scrapeResult.companies ?? [],
      skipReason: scrapeResult.skipReason,
    };
  }

  /**
   * Loads companies from a LinkedIn company search URL, then for each company
   * runs {@link runOutreach} (people → decision-maker → posts → message).
   */
  async runCompanySearchOutreach(
    searchUrl: string,
    selectionCriteria: string,
    messageTopic: string,
    credentials?: LinkedInAuthCredentials,
    startPage = 1,
    maxPages = 10,
  ): Promise<{
    companies: LinkedInCompanyProfile[];
    leads: LinkedInCompanySearchLeadResult[];
    skipReason?: string;
  }> {
    const { companies, skipReason } = await this.collectCompaniesFromSearch(
      searchUrl,
      credentials,
      startPage,
      maxPages,
    );

    if (skipReason === "linkedin_auth_required") {
      return { companies, leads: [], skipReason };
    }

    const leads: LinkedInCompanySearchLeadResult[] = [];

    for (const company of companies) {
      try {
        const outreach = await this.runOutreach(
          company.companyUrl,
          selectionCriteria,
          messageTopic,
          credentials,
        );
        const skipped = Boolean(
          outreach.skipReason ||
            !outreach.linkedinContactProfileUrl ||
            !outreach.linkedinOutreachSummary,
        );
        leads.push({
          company,
          outreach,
          contactName: outreach.contactName ?? null,
          contactPosition: outreach.contactPosition ?? null,
          status: skipped ? "skipped" : "completed",
        });
      } catch (error) {
        leads.push({
          company,
          outreach: {
            linkedinContactProfileUrl: null,
            linkedinOutreachSummary: null,
            skipReason: (error as Error).message,
          },
          status: "failed",
        });
        this.logger.warn(
          `[linkedin-outreach] company search failed for ${company.companyUrl}: ${
            (error as Error).message
          }`,
        );
      }
    }

    return { companies, leads };
  }

  /** Resolves username/password from a linked LinkedIn connector record. */
  async credentialsFromConnector(
    connector: Connector | undefined,
  ): Promise<LinkedInAuthCredentials | undefined> {
    if (!connector?.credentials) {
      return undefined;
    }
    const username = String(
      connector.credentials[LINKEDIN_USERNAME_FIELD] ?? "",
    ).trim();
    const encryptedPassword = connector.credentials[LINKEDIN_PASSWORD_FIELD];
    if (!username || !encryptedPassword) {
      return undefined;
    }
    const password = await decrypt(String(encryptedPassword));
    if (!password?.trim()) {
      return undefined;
    }
    return { username, password: password.trim() };
  }

  private async pickMostRelevantProfile(
    profiles: LinkedInPersonProfile[],
    selectionCriteria: string,
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
          `${i}: name="${p.name}", position="${p.position}", url=${p.profileUrl ?? "(not available)"}`,
      )
      .join("\n");
    const prompt = `You are an expert B2B salesperson specializing in LinkedIn outreach.

You help pick the best LinkedIn contact at a company for B2B outreach

Candidates:
${profileList}

Pick the single person most likely to match the selection criteria based on their position.

Selection criteria:
${selectionCriteria}

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
    messageTopic: string,
    profile: LinkedInPersonProfile,
    activitySnippets: string[],
  ): Promise<string> {
    const apiUrl = process.env.LLM_API_URL;
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    if (!apiUrl?.trim() || !apiKey?.trim() || !model?.trim()) {
      return `Hi ${profile.name}, I noticed your work as ${profile.position} and thought we might connect regarding ${messageTopic}.`;
    }
messageTopic = `sell a software platform that helps companies manage their ISO management systems. We also have an ecosystem of certified consulting partners who help clients implement the system and get fully certified.`
    const postsBlock =
      activitySnippets.length > 0
        ? activitySnippets.map((t, i) => `[${i + 1}] ${t}`).join("\n\n")
        : "(No recent public posts were available.)";

    const prompt = `You are an expert B2B copywriter specializing in ultra-short LinkedIn connection notes. 

${messageTopic}

Analyze the LinkedIn profile information provided below. Write exactly ONE hyper-personalized connection note targeting this person. 

CRITICAL CONSTRAINTS:
1. The note MUST be strictly under 300 characters (including spaces). 
2. Absolutely no aggressive sales pitches or asking for a meeting. 
3. Blend our ISO software efficiency or partner network into a "Zero-Ask" 

Target person:
- Name: ${profile.name}
- Position: ${profile.position}

Their recent LinkedIn activity snippets:
${postsBlock}`;

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

    return `Hi ${profile.name}, I came across your profile and your recent posts resonated with what we're working on around ${messageTopic}. Would love to connect.`;
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
