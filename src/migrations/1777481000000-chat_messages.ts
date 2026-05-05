import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatMessages1777481000000 implements MigrationInterface {
  name = 'ChatMessages1777481000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`chat_messages\` (\`id\` varchar(36) NOT NULL, \`workflow_run_id\` varchar(36) NOT NULL, \`message\` text NOT NULL, \`sent_by\` varchar(32) NOT NULL, \`team_member_id\` varchar(255) NULL, \`created_at\` bigint NOT NULL, INDEX \`IDX_chat_messages_workflow_run_created_at\` (\`workflow_run_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_messages\` ADD CONSTRAINT \`FK_chat_messages_workflow_run_id\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_messages\` ADD CONSTRAINT \`FK_chat_messages_team_member_id\` FOREIGN KEY (\`team_member_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chat_messages\` DROP FOREIGN KEY \`FK_chat_messages_team_member_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_messages\` DROP FOREIGN KEY \`FK_chat_messages_workflow_run_id\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_chat_messages_workflow_run_created_at\` ON \`chat_messages\``,
    );
    await queryRunner.query(`DROP TABLE \`chat_messages\``);
  }
}
