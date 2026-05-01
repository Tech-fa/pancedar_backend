import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type GoogleAccountDocument = HydratedDocument<GoogleAccount>;

@Schema({
  collection: "google_accounts",
  strict: false,
  timestamps: true,
  versionKey: false,
})
export class GoogleAccount {
  @Prop({ required: true, index: true, trim: true })
  connectorid: string;
}

export const GoogleAccountSchema = SchemaFactory.createForClass(GoogleAccount);
