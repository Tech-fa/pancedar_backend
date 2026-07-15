import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkedinContentPosts1778790000000 implements MigrationInterface {
  name = "LinkedinContentPosts1778790000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`linkedin_content_posts\` (\`id\` varchar(36) NOT NULL, \`workflow_run_id\` varchar(36) NOT NULL, \`search_url\` text NOT NULL, \`search_word\` varchar(512) NOT NULL, \`company_linkedin_url\` text NULL, \`company_name\` varchar(512) NULL, \`company_location\` varchar(512) NULL, \`post_content\` text NULL, \`post_link\` text NULL, \`status\` varchar(32) NOT NULL DEFAULT 'pending', \`skip_reason\` varchar(255) NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`linkedin_content_posts\` ADD CONSTRAINT \`FK_linkedin_content_posts_workflow_runs\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\` (\`id\`) ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`linkedin_content_posts\` DROP FOREIGN KEY \`FK_linkedin_content_posts_workflow_runs\``,
    );
    await queryRunner.query(`DROP TABLE \`linkedin_content_posts\``);
  }
}
