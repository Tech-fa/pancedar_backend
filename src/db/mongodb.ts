import { registerAs } from "@nestjs/config";

export default registerAs("mongodb", () => ({
  uri: process.env.MONGODB_URI || process.env.MONGO_URI,
}));
