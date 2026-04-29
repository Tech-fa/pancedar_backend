import { ConfigService } from "@nestjs/config";
import { config as loadEnv } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { LlmAgent } from "./llm-agent";
import { RagRetrievalService } from "../rag/rag-retrieval.service";
import { CostService } from "src/cost/cost.service";
import { Cost } from "src/cost/cost.entity";
import { EmbeddingService } from "src/embedding/embedding.service";
import { ResourceChunk } from "src/rag/resource-chunk.ts_entity";

const ENV_FILES = [".env.override", ".env.local", ".env", ".env.aws"];

for (const envFile of ENV_FILES) {
  loadEnv({ path: envFile, quiet: true });
}

async function main(): Promise<void> {
  const rl = createInterface({ input, output });
  const config = new ConfigService();
  const [{ connectionSource }, { psqlSource }] = await Promise.all([
    import("src/db/database"),
    import("src/db/psql"),
  ]);
  const dataSource = connectionSource;
  const psqlDataSource = psqlSource;
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  if (!psqlDataSource.isInitialized) {
    await psqlDataSource.initialize();
  }

  const costRepository = dataSource.getRepository(Cost);
  const costService = new CostService(costRepository);
  const embeddingService = new EmbeddingService();
  const chunkRepository = psqlDataSource.getRepository(ResourceChunk);
  const ragRetrievalService = new RagRetrievalService(
    chunkRepository,
    embeddingService,
  );
  const agent = new LlmAgent(config, ragRetrievalService, null, {
    source: "test",
  });
  let shouldExit = false;

  console.log("Interactive LLM agent test");
  console.log("Type a message and press Enter. Type /exit to quit.\n");

  try {
    while (!shouldExit) {
      const userText = (await rl.question("You: ")).trim();
      if (!userText) continue;
      if (userText === "/exit" || userText === "/quit") break;

      let assistantStarted = false;
      const writeAssistantToken = (token: string): void => {
        if (!assistantStarted) {
          process.stdout.write("Assistant: ");
          assistantStarted = true;
        }
        process.stdout.write(token);
      };

      await agent.handleTurn(
        {
          sendPartialToken: writeAssistantToken,
          sendFullToken: writeAssistantToken,
          sendEmptyToken: () => {
            if (assistantStarted) process.stdout.write("\n");
          },
          endConversation: () => {
            shouldExit = true;
          },
        },
        userText,
      );

      if (!assistantStarted) {
        console.log("Assistant: [no spoken output]");
      }
    }
  } finally {
    rl.close();
    if (psqlDataSource.isInitialized) {
      await psqlDataSource.destroy();
    }
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((err) => {
  console.error("LLM agent test failed:", err);
  process.exitCode = 1;
});
