import { config as loadEnv } from "dotenv";
import mongoose, { Model } from "mongoose";
import * as path from "path";
import {
  KijijiLink,
  KijijiLinkDocument,
  KijijiLinkSchema,
} from "./workflows/kiji-link-tracking/schemas/kijiji-link.schema";

const envFiles = [".env.override", ".env.local", ".env", ".env.aws"];

for (const envFile of envFiles) {
  loadEnv({ path: path.resolve(process.cwd(), envFile) });
}

async function syncModelIndexes<T>(model: Model<T>) {
  console.log(`Syncing Mongo indexes for ${model.collection.name}...`);
  const result = await model.syncIndexes();
  console.log(`Synced Mongo indexes for ${model.collection.name}:`, result);
}

async function syncMongoIndexes() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI or MONGO_URI must be set to sync Mongo indexes");
  }

  try {
    await mongoose.connect(mongoUri);

    await syncModelIndexes<KijijiLinkDocument>(
      mongoose.model<KijijiLinkDocument>(KijijiLink.name, KijijiLinkSchema),
    );

    console.log("Mongo index sync completed successfully");
  } finally {
    await mongoose.disconnect();
  }
}

syncMongoIndexes().catch((error) => {
  console.error("Mongo index sync failed:", error);
  process.exit(1);
});
