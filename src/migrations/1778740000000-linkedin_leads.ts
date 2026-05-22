import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkedinLeads1778740000000 implements MigrationInterface {
  name = "LinkedinLeads1778740000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`linkedin_leads\` (\`id\` varchar(36) NOT NULL, \`workflow_run_id\` varchar(36) NOT NULL, \`search_url\` text NOT NULL, \`profile_url\` text NOT NULL, \`name\` varchar(512) NULL, \`position\` varchar(1024) NULL, \`outreach_summary\` text NULL, \`status\` varchar(32) NOT NULL DEFAULT 'pending', \`skip_reason\` varchar(255) NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`linkedin_leads\` ADD CONSTRAINT \`FK_linkedin_leads_workflow_runs\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\` (\`id\`) ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`linkedin_leads\` DROP FOREIGN KEY \`FK_linkedin_leads_workflow_runs\``,
    );
    await queryRunner.query(`DROP TABLE \`linkedin_leads\``);
  }
}
