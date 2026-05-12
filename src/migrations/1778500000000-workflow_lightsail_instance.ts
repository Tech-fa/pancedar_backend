import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkflowLightsailInstance1778500000000
  implements MigrationInterface
{
  name = "WorkflowLightsailInstance1778500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `workflows` ADD `light_sail_instance_id` varchar(255) NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `workflows` DROP COLUMN `light_sail_instance_id`",
    );
  }
}
