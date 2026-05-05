import { MigrationInterface, QueryRunner } from "typeorm";

export class TeamConfig1777480000000 implements MigrationInterface {
  name = "TeamConfig1777480000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`team_configs\` (\`id\` varchar(36) NOT NULL, \`team_id\` varchar(36) NOT NULL, \`config\` json NOT NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, UNIQUE INDEX \`IDX_team_configs_team_id\` (\`team_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`team_configs\` ADD CONSTRAINT \`FK_team_configs_team_id\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`team_configs\` DROP FOREIGN KEY \`FK_team_configs_team_id\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_team_configs_team_id\` ON \`team_configs\``,
    );
    await queryRunner.query(`DROP TABLE \`team_configs\``);
  }
}
