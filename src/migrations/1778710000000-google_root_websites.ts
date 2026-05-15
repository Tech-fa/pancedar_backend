import { MigrationInterface, QueryRunner } from "typeorm";

export class GoogleRootWebsites1778710000000 implements MigrationInterface {
  name = "GoogleRootWebsites1778710000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`google_root_websites\` (\`id\` varchar(36) NOT NULL, \`team_id\` varchar(36) NULL, \`workflow_run_id\` varchar(36) NULL, \`google_maps_search_url\` text NULL, \`website_url\` varchar(2048) NOT NULL, \`phones\` json NULL, \`emails\` json NULL, \`linkedin_url\` varchar(2048) NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`google_root_websites\` ADD CONSTRAINT \`FK_google_root_workflow_runs\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\` (\`id\`) ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`google_flagged_pages\` ADD \`google_root_website_id\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`google_flagged_pages\` ADD CONSTRAINT \`FK_google_flagged_pages_root\` FOREIGN KEY (\`google_root_website_id\`) REFERENCES \`google_root_websites\` (\`id\`) ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`google_flagged_pages\` DROP FOREIGN KEY \`FK_google_flagged_pages_root\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`google_flagged_pages\` DROP COLUMN \`google_root_website_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`google_root_websites\` DROP FOREIGN KEY \`FK_google_root_workflow_runs\``,
    );
    await queryRunner.query(`DROP TABLE \`google_root_websites\``);
  }
}
