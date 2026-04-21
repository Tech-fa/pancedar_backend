import { MigrationInterface, QueryRunner } from "typeorm";

export class Cost1776798730940 implements MigrationInterface {
    name = 'Cost1776798730940'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`costs\` (\`id\` varchar(36) NOT NULL, \`team_id\` varchar(255) NOT NULL, \`workflow_run_id\` varchar(255) NULL, \`llm_model_name\` varchar(255) NOT NULL, \`llm_model_tokens_input\` int UNSIGNED NOT NULL, \`llm_model_tokens_output\` int UNSIGNED NOT NULL, \`llm_model_api\` varchar(100) NOT NULL, \`llm_model_cost\` decimal(18,8) NOT NULL DEFAULT '0.00000000', \`created_at\` bigint NOT NULL, \`month\` varchar(255) NOT NULL, \`year\` varchar(255) NOT NULL, INDEX \`IDX_54e09895de61c596b277602d3c\` (\`workflow_run_id\`), INDEX \`IDX_10ed8e7d3d72a67fc1d603ef0e\` (\`team_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`costs\` ADD CONSTRAINT \`FK_10ed8e7d3d72a67fc1d603ef0e5\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`costs\` ADD CONSTRAINT \`FK_54e09895de61c596b277602d3c6\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`costs\` DROP FOREIGN KEY \`FK_54e09895de61c596b277602d3c6\``);
        await queryRunner.query(`ALTER TABLE \`costs\` DROP FOREIGN KEY \`FK_10ed8e7d3d72a67fc1d603ef0e5\``);
        await queryRunner.query(`DROP INDEX \`IDX_10ed8e7d3d72a67fc1d603ef0e\` ON \`costs\``);
        await queryRunner.query(`DROP INDEX \`IDX_54e09895de61c596b277602d3c\` ON \`costs\``);
        await queryRunner.query(`DROP TABLE \`costs\``);
    }

}
