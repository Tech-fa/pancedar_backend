import { MigrationInterface, QueryRunner } from "typeorm";

export class SeoBlogDrafts1778730000000 implements MigrationInterface {
  name = "SeoBlogDrafts1778730000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`seo_blog_drafts\` (\`id\` varchar(36) NOT NULL, \`team_id\` varchar(36) NOT NULL, \`workflow_run_id\` varchar(36) NOT NULL, \`topic\` text NOT NULL, \`research\` json NULL, \`blog_content\` longtext NOT NULL, \`linkedin_content\` longtext NOT NULL, \`blog_filename\` varchar(512) NOT NULL, \`status\` varchar(32) NOT NULL DEFAULT 'draft', \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, INDEX \`IDX_seo_blog_drafts_team_created\` (\`team_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`seo_blog_drafts\` ADD CONSTRAINT \`FK_seo_blog_drafts_workflow_runs\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\` (\`id\`) ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`seo_blog_drafts\` DROP FOREIGN KEY \`FK_seo_blog_drafts_workflow_runs\``,
    );
    await queryRunner.query(`DROP TABLE \`seo_blog_drafts\``);
  }
}
