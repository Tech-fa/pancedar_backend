import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { AgentWorkflowAction } from "./agent-workflow-action";
import {
  AgentCollectedInformation,
  AgentCollectedInformationDocument,
} from "./schemas/agent-collected-information.schema";

@Injectable()
export class CollectInformationAction implements AgentWorkflowAction {
  constructor(
    @InjectModel(AgentCollectedInformation.name)
    private readonly collectedInformationModel: Model<
      AgentCollectedInformationDocument
    >,
  ) {}

  async execute(body?: unknown): Promise<void> {
    if (typeof body === "undefined") {
      return;
    }

    await this.collectedInformationModel.create(body);
  }
}
