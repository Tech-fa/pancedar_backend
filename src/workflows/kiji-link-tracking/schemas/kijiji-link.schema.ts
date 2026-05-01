import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type KijijiLinkDocument = HydratedDocument<KijijiLink>;

@Schema({
  collection: "kijiji_links",
  timestamps: true,
  versionKey: false,
})
export class KijijiLink {
  @Prop({ required: true, index: true, trim: true })
  workflowId: string;

  @Prop({ required: true, trim: true })
  link: string;

  @Prop({ required: true, default: Date.now })
  collectedAt: Date;

  @Prop({ required: true, default: Date.now })
  lastSeenAt: Date;
}

export const KijijiLinkSchema = SchemaFactory.createForClass(KijijiLink);

KijijiLinkSchema.index({ workflowId: 1, link: 1 }, { unique: true });
KijijiLinkSchema.index({ workflowId: 1, createdAt: -1 });
