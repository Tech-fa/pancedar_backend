import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";

export type AgentCollectedInformationDocument = HydratedDocument<
  AgentCollectedInformation
>;

@Schema({
  collection: "agent_collected_information",
  strict: false,
  timestamps: true,
  versionKey: false,
})
export class AgentCollectedInformation {}

export const AgentCollectedInformationSchema = SchemaFactory.createForClass(
  AgentCollectedInformation,
);
