import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  AgentCommunication,
  AgentCommunicationDocument,
} from "./schemas/agent-communication.schema";

@Injectable()
export class AgentCommunicationService {
  constructor(
    @InjectModel(AgentCommunication.name)
    private readonly agentCommunicationModel: Model<AgentCommunicationDocument>,
  ) {}

  async recordCommunication(data: {
    role: string;
    content: string;
    workflowRunId: string;
  }) {
    const agentCommunication = new this.agentCommunicationModel(data);
    return agentCommunication.save();
  }

  async findByWorkflowRunId(workflowRunId: string) {
    return this.agentCommunicationModel
      .find({ workflowRunId })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async hasCommunicationCreatedBefore(
    workflowRunId: string,
    before: Date,
  ): Promise<boolean> {
    const communication = await this.agentCommunicationModel
      .findOne({
        workflowRunId,
        createdAt: { $lte: before },
      })
      .select({ _id: 1 })
      .lean()
      .exec();
    return Boolean(communication);
  }
}
