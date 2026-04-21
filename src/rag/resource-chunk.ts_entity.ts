import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
  ValueTransformer,
} from "typeorm";

export type ChunkSourceType = "text" | "file" | "link";

/**
 * Converts number[] <-> pgvector's text representation ("[0.1,0.2,...]").
 * Stored as the built-in `vector` type column via the ColumnType override below.
 */
const vectorTransformer: ValueTransformer = {
  to: (value: number[] | null): string | null =>
    value === null || value === undefined
      ? null
      : `[${value.map((n) => n.toFixed(7)).join(",")}]`,
  from: (value: string | number[] | null): number[] | null => {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value as number[];
    const trimmed = String(value).replace(/^\[|\]$/g, "");
    if (!trimmed.length) return [];
    return trimmed.split(",").map((s) => Number(s));
  },
};

@Entity("resource_chunks")
@Index(["resourceId", "resourceType"])
@Index(["teamId"])
export class ResourceChunk {
  @PrimaryColumn({ name: "id", type: "uuid" })
  id: string;

  @Column({ name: "client_id", type: "varchar", length: 36 })
  teamId: string;

  @Column({ name: "resource_id", type: "varchar", length: 36 })
  resourceId: string;

  @Column({ name: "source_type", type: "varchar", length: 16 })
  sourceType: ChunkSourceType;

  @Column({ name: "resource_type", type: "varchar", length: 16 })
  resourceType: "category" | "resource";

  @Column({ name: "source_ref", type: "text", nullable: true })
  sourceRef: string | null;

  @Column({ name: "chunk_index", type: "int" })
  chunkIndex: number;

  @Column({ name: "content", type: "text" })
  content: string;

  @Column({
    name: "embedding",
    type: "text",
    transformer: vectorTransformer,
  })
  embedding: number[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
