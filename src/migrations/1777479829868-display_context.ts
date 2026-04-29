import { MigrationInterface, QueryRunner } from "typeorm";

export class DisplayContext1777479829868 implements MigrationInterface {
  name = "DisplayContext1777479829868";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`workflow_runs\` ADD \`display_context\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`workflow_runs\` DROP COLUMN \`display_context\``,
    );
  }
}
