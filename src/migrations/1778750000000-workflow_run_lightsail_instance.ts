import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkflowRunLightsailInstance1778750000000
  implements MigrationInterface
{
  name = "WorkflowRunLightsailInstance1778750000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `workflow_runs` ADD `light_sail_instance_id` varchar(255) NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `workflow_runs` DROP COLUMN `light_sail_instance_id`",
    );
  }
}
