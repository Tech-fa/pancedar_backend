import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkedinLeadsMessaged1778780000000 implements MigrationInterface {
  name = "LinkedinLeadsMessaged1778780000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `linkedin_leads` ADD `messaged` tinyint NOT NULL DEFAULT 0",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `linkedin_leads` DROP COLUMN `messaged`",
    );
  }
}
