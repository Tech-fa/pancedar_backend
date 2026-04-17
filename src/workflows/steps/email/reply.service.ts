import { Injectable, Logger } from "@nestjs/common";
import { UsersService } from "../../../user/user.service";
import { LlmService } from "../../../llm-integration/llm.service";
import { CategoryService } from "../../../category/category.service";
import { QueuePublisher } from "../../../queue/queue.publisher";
import { EmailAnalysisResult } from "./dto";
import { WorkflowEmailCategory } from "../../../category/category.entity";
import { Events } from "../../../queue/queue-constants";
import { EmailWorkflowReplyPayload } from "../../../email-handler/dto";

@Injectable()
export class ReplyEmailService {
  private readonly logger = new Logger(ReplyEmailService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly categoryService: CategoryService,
    private readonly llmService: LlmService,
    private readonly queuePublisher: QueuePublisher,
  ) {}

  async runStep(
    incomingEmailId: string,
    category: WorkflowEmailCategory,
    analysis: EmailAnalysisResult,
  ): Promise<EmailWorkflowReplyPayload | null> {
    let resources: {
      id: string;
      textResource: string | null;
      links: string[];
      files: string[];
    }[] = [];

    if (category?.resources?.length) {
      resources = category.resources.map((r) => ({
        id: r.id,
        textResource: r.textResource,
        links: r.links ?? [],
        files: r.files ?? [],
      }));
    }

    const incoming = await this.usersService.findIncomingEmailById(
      incomingEmailId,
      ["connector"],
    );
    if (!resources.length) {
      return null;
    }

    const replyBody = await this.buildReplyBody(analysis, resources);
    const response = {
      incomingEmailId,
      replyTo: incoming.from,
      subject: incoming.subject
        ? `Re: ${incoming.subject}`
        : "Re: (no subject)",
      replyBody,
    };
    if (analysis.shouldSendReply) {
      await this.queuePublisher.publish(Events.EMAIL_WORKFLOW_REPLY, response);
    }

    return response;
  }

  private async buildReplyBody(
    analysis: EmailAnalysisResult,
    resources: {
      id: string;
      textResource: string | null;
      links: string[];
      files: string[];
    }[],
  ): Promise<string> {
    if (!resources.length) {
      return analysis.summary || "Thank you for your message.";
    }

    const resourceBlock = resources
      .map((r, i) => {
        const parts = [
          r.textResource ? `Text: ${r.textResource}` : null,
          (r.links?.length ?? 0) > 0 ? `Links: ${r.links.join(", ")}` : null,
          (r.files?.length ?? 0) > 0 ? `Files: ${r.files.join(", ")}` : null,
        ].filter(Boolean);
        return `Resource ${i + 1}:\n${parts.join("\n")}`;
      })
      .join("\n\n");

    const prompt = `You are drafting a concise email reply to the sender.

Email summary:
${analysis.summary}

Open questions noted from the email:
${(analysis.questions ?? []).join("; ") || "(none)"}

Approved knowledge base resources you may use (do not invent facts beyond these):
${resourceBlock}

Write only the reply body text (no subject line). Be helpful and professional.`;

    try {
      return (await this.llmService.completeUserPrompt(prompt)).trim();
    } catch (error) {
      this.logger.error(
        "LLM reply generation failed, using summary fallback",
        error,
      );
      return analysis.summary || "Thank you for your message.";
    }
  }
}
