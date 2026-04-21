import { MigrationInterface, QueryRunner } from "typeorm";

export class CostCacheHit1776799000000 implements MigrationInterface {
    name = 'CostCacheHit1776799000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE \`costs\` ADD \`llm_model_tokens_cache_hit\` int UNSIGNED NOT NULL DEFAULT 0`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE \`costs\` DROP COLUMN \`llm_model_tokens_cache_hit\``
        );
    }
}
