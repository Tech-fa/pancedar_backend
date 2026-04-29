import { MigrationInterface, QueryRunner } from "typeorm";

export class RunCompletedView1777466163669 implements MigrationInterface {
    name = 'RunCompletedView1777466163669'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` ADD \`completed_view\` json NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` DROP COLUMN \`completed_view\``);
    }

}
