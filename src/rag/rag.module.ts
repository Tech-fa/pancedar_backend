import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ResourceChunk } from "./resource-chunk.ts_entity";
import { ChunkerService } from "./chunker.service";
import { RagIngestionService } from "./rag-ingestion.service";
import { RagRetrievalService } from "./rag-retrieval.service";
import { EmbeddingModule } from "../embedding/embedding.module";

@Module({
  imports: [TypeOrmModule.forFeature([ResourceChunk], "psql"), EmbeddingModule],
  providers: [ChunkerService, RagIngestionService, RagRetrievalService],
  exports: [RagIngestionService, RagRetrievalService],
})
export class RagModule {}
