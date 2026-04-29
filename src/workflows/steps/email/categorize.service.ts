import { Injectable, Logger } from "@nestjs/common";
import { UsersService } from "../../../user/user.service";
import {
  EmailAnalysisResult,
  EmailCategory,
  CategorizeStepContext,
} from "./dto";
import { completeUserPrompt } from "src/llm-integration/llm-stream";

@Injectable()
export class CategorizeEmailService {
  private readonly logger = new Logger(CategorizeEmailService.name);

  constructor(
    private readonly usersService: UsersService,
  ) {}

  async runStep(context: CategorizeStepContext): Promise<EmailAnalysisResult> {
    const emailId =  context.incomingEmailId;
    if (!emailId) {
      throw new Error(
        "Categorize step requires userIncomingEmail or incomingEmailId in context",
      );
    }

    const incoming = await this.usersService.findIncomingEmailById(emailId, []);
    if (!incoming) {
      throw new Error(`Incoming email ${emailId} not found`);
    }

    const emailContent = incoming.htmlText || incoming.text || "";
    if (!emailContent.trim()) {
      this.logger.warn(`Empty email content for categorization ${emailId}`);
      return {
        categoryName: null,
        summary: "Empty email content",
        questions: [],
      };
    }

    const categories = context.categories ?? [];
    const categoriesDescription =
      categories.length > 0
        ? categories
            .map((c) => `- "${c.name}": ${c.description || "No description"}`)
            .join("\n")
        : "No categories defined";
    const prompt = `Analyze the following email and provide:
1. The most appropriate category from the list below, or null if none match
2. A brief summary of the email (2-3 sentences max)
3. are we asked to answer a question or a task?

Available Categories:
${categoriesDescription}

Email Content:
${emailContent}

Subject:
${incoming.subject ?? ""}

Respond ONLY with a valid JSON object in this exact format (no markdown, no code blocks, just the JSON):
{
  "categoryName": "category name here or null if no match",
  "summary": "brief summary here",
  "questions": "array of questions or null if no questions",
}`;

    const responseText = await completeUserPrompt(prompt,{teamId: context.teamId});
    return this.parseCategorizationResponse(responseText, categories);
  }

  private parseCategorizationResponse(
    responseText: string,
    categories: EmailCategory[],
  ): EmailAnalysisResult {
    try {
      let cleanedResponse = responseText.trim();
      if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.slice(7);
      }
      if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.slice(3);
      }
      if (cleanedResponse.endsWith("```")) {
        cleanedResponse = cleanedResponse.slice(0, -3);
      }
      cleanedResponse = cleanedResponse.trim();

      const parsed = JSON.parse(cleanedResponse) as {
        categoryName?: string | null;
        summary?: string;
        questions?: string[];
      };

      let categoryName: string | null | undefined = parsed.categoryName;
      if (categoryName) {
        const validCategory = categories.find(
          (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
        );
        categoryName = validCategory ? validCategory.name : null;
      }

      return {
        categoryName: categoryName || null,
        summary: parsed.summary || "Unable to generate summary",
        questions: parsed.questions || [],
      };
    } catch (error) {
      this.logger.error("Error parsing LLM categorization response:", error);
      this.logger.debug("Raw response:", responseText);
      return {
        categoryName: null,
        summary: "Unable to analyze email",
        questions: [],
      };
    }
  }
}
