import { MigrationInterface, QueryRunner } from "typeorm";

export class InitRagChunks1779300000000 implements MigrationInterface {
  name = "InitRagChunks1779300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      CREATE TABLE resource_chunks (
        id uuid PRIMARY KEY,
        team_id varchar(36) NOT NULL,
        resource_id varchar(36) NOT NULL,
        resource_type varchar(16) NOT NULL,
        source_type varchar(16) NOT NULL,
        source_ref text,
        chunk_index int NOT NULL,
        content text NOT NULL,
        content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
        embedding vector(384) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_resource_chunks_team_id ON resource_chunks (team_id)
    `);

    await queryRunner.query(
      `CREATE INDEX ON resource_chunks (resource_id, resource_type)`,
    );
    await queryRunner.query(
      `CREATE INDEX ON resource_chunks USING GIN (content_tsv)`,
    );
    await queryRunner.query(
      `CREATE INDEX ON resource_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS resource_chuncks`);
  }
}
