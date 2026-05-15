import { MigrationInterface, QueryRunner } from "typeorm";

export class GoogleFlaggedPages1778600000000 implements MigrationInterface {
  name = "GoogleFlaggedPages1778600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`google_flagged_pages\` (\`id\` varchar(36) NOT NULL, \`team_id\` varchar(36) NULL, \`workflow_id\` varchar(36) NULL, \`google_maps_search_url\` text NULL, \`website_url\` varchar(2048) NOT NULL, \`page_url\` varchar(2048) NOT NULL, \`matched_keywords\` json NOT NULL, \`text_snippet\` text NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, INDEX \`IDX_google_flagged_team_created\` (\`team_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`google_flagged_pages\``);
  }
}
