import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkflowIsStopped1778760000000 implements MigrationInterface {
  name = "WorkflowIsStopped1778760000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `workflows` ADD `is_stopped` tinyint NOT NULL DEFAULT 0",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `workflows` DROP COLUMN `is_stopped`",
    );
  }
}
