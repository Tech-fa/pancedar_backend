import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkflowRuns1776719374392 implements MigrationInterface {
    name = 'WorkflowRuns1776719374392'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`workflow_runs\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`workflow_id\` varchar(255) NOT NULL, \`context\` json NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, \`status\` varchar(255) NOT NULL, \`current_step\` varchar(255) NOT NULL, \`steps_context\` json NULL, \`explanation\` json NULL, INDEX \`IDX_d5611d5f47a746b23fd57a0432\` (\`client_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` ADD CONSTRAINT \`FK_d5611d5f47a746b23fd57a04323\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` ADD CONSTRAINT \`FK_a2995918456c0a612cf1e5ba22a\` FOREIGN KEY (\`workflow_id\`) REFERENCES \`workflows\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` DROP FOREIGN KEY \`FK_a2995918456c0a612cf1e5ba22a\``);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` DROP FOREIGN KEY \`FK_d5611d5f47a746b23fd57a04323\``);
        await queryRunner.query(`DROP INDEX \`IDX_d5611d5f47a746b23fd57a0432\` ON \`workflow_runs\``);
        await queryRunner.query(`DROP TABLE \`workflow_runs\``);
    }

}
