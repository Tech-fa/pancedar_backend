import { Injectable, Logger } from "@nestjs/common";
import { UsersService } from "../../../user/user.service";
import { LlmService } from "../../../llm-integration/llm.service";
import { CategoryService } from "../../../category/category.service";
import { QueuePublisher } from "../../../queue/queue.publisher";
import { EmailAnalysisResult } from "./dto";
import { WorkflowEmailCategory } from "../../../category/category.entity";
import { Events } from "../../../queue/queue-constants";
import { EmailWorkflowReplyPayload } from "../../../email-handler/dto";
import { RagRetrievalService } from "../../../rag/rag-retrieval.service";

@Injectable()
export class ReplyEmailService {
  private readonly logger = new Logger(ReplyEmailService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly categoryService: CategoryService,
    private readonly llmService: LlmService,
    private readonly queuePublisher: QueuePublisher,
    private readonly ragRetrievalService: RagRetrievalService,
  ) {}

  async runStep(
    incomingEmailId: string,
    category: WorkflowEmailCategory,
    analysis: EmailAnalysisResult,
  ): Promise<EmailWorkflowReplyPayload | null> {
    const hasResources = !!category?.resource;

    const incoming = await this.usersService.findIncomingEmailById(
      incomingEmailId,
      ["connector"],
    );

    if (!hasResources) {
      return null;
    }

    const replyBody = await this.buildReplyBody(
      analysis,
      category.id,
      category.teamId,
    );
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
    categoryId: string,
    teamId: string,
  ): Promise<string> {
    const query = [analysis.summary, ...(analysis.questions ?? [])]
      .filter(Boolean)
      .join("\n");

    let resourceBlock: string;
    try {
      const chunks = await this.ragRetrievalService.retrieve(
        categoryId,
        "category",
        teamId,
        query,
        5,
      );
      if (chunks.length === 0) {
        return analysis.summary || "Thank you for your message.";
      }
      resourceBlock = chunks
        .map(
          (c, i) =>
            `[${i + 1}] (${c.sourceType}${
              c.sourceRef ? `: ${c.sourceRef}` : ""
            })\n${c.content}`,
        )
        .join("\n\n");
    } catch (err) {
      this.logger.error("RAG retrieval failed, falling back to summary", err);
      return analysis.summary || "Thank you for your message.";
    }

    const prompt = `You are drafting a concise email reply to the sender.

Email summary:
${analysis.summary}

Open questions noted from the email:
${(analysis.questions ?? []).join("; ") || "(none)"}

Approved knowledge base resources you may use (do not invent facts beyond these):
${resourceBlock}

Write only the reply body text (no subject line). Be helpful and professional.`;

    try {
      return (
        await this.llmService.completeUserPrompt(prompt, { teamId })
      ).trim();
    } catch (error) {
      this.logger.error(
        "LLM reply generation failed, using summary fallback",
        error,
      );
      return analysis.summary || "Thank you for your message.";
    }
  }
}
