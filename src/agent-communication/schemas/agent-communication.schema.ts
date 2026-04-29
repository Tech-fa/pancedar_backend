import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";

export type AgentCommunicationDocument = HydratedDocument<AgentCommunication>;

@Schema({
  collection: "agent_communications",
  strict: false,
  timestamps: true,
  versionKey: false,
})
export class AgentCommunication {
  @Prop({ required: true, index: true, trim: true })
  workflowRunId: string;

  @Prop({ trim: true })
  type?: string;

  @Prop({ type: SchemaTypes.Mixed })
  content?: unknown;

  @Prop({ trim: true })
  role?: string;

  @Prop({ type: SchemaTypes.Mixed })
  metadata?: Record<string, unknown>;
}

export const AgentCommunicationSchema = SchemaFactory.createForClass(
  AgentCommunication,
);

AgentCommunicationSchema.index({ workflowRunId: 1, createdAt: 1 });
