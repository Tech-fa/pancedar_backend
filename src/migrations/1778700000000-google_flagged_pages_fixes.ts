import { MigrationInterface, QueryRunner } from "typeorm";

export class GoogleFlaggedPagesFixes1778700000000 implements MigrationInterface {
  name = "GoogleFlaggedPagesFixes1778700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`google_flagged_pages\` DROP workflow_id`);
    await queryRunner.query(`ALTER TABLE \`google_flagged_pages\` ADD \`workflow_run_id\` varchar(36) NULL`);
    await queryRunner.query(`ALTER TABLE \`google_flagged_pages\` ADD CONSTRAINT \`FK_google_flagged_pages_workflow_runs\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\` (\`id\`)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`google_flagged_pages\``);
  }
}
