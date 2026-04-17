import { MigrationInterface, QueryRunner } from "typeorm";

export class InitDb1776362457977 implements MigrationInterface {
    name = 'InitDb1776362457977'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP FOREIGN KEY \`FK_2438fdb765cc9b1e5963807fd5d\``);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP FOREIGN KEY \`FK_7fa069e870ccf0e924b8c9d9088\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP FOREIGN KEY \`FK_1adda217b0e07ee74ba8c2cda92\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` DROP FOREIGN KEY \`FK_67c3c3898e198ea93feba50299c\``);
        await queryRunner.query(`DROP INDEX \`IDX_6905d7aee94efc6cc54a3223db\` ON \`workflows\``);
        await queryRunner.query(`DROP INDEX \`REL_7fa069e870ccf0e924b8c9d908\` ON \`workflows\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` CHANGE \`credential_id\` \`connector_id\` varchar(255) NULL`);
        await queryRunner.query(`CREATE TABLE \`workflow_email_category_resources\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`category_id\` varchar(36) NOT NULL, \`text_resource\` text NULL, \`links\` json NULL, \`files\` json NULL, INDEX \`IDX_a02b57565b7791e09faf28fc3f\` (\`client_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`workflow_email_categories\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`description\` text NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, \`team_id\` varchar(36) NOT NULL, INDEX \`IDX_863b9a547b9c53265c112d1175\` (\`client_id\`), UNIQUE INDEX \`IDX_9edaa20785f2d428db299a9e68\` (\`client_id\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP COLUMN \`parent_id\``);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP COLUMN \`trigger_id\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP COLUMN \`displays\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP COLUMN \`is_active\``);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD \`trigger_queue\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD \`connectors_needed\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD \`steps\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD \`context\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD \`team_id\` varchar(36) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD \`primary_identifier\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD UNIQUE INDEX \`IDX_3c660e54b01d947c40bde51f62\` (\`primary_identifier\`)`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD \`status\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`team_members\` CHANGE \`is_compliant\` \`is_compliant\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP COLUMN \`credentials\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD \`credentials\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` DROP COLUMN \`connector_id\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` ADD \`connector_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`CREATE INDEX \`IDX_d5673b06a25da351f39b24bc1c\` ON \`workflows\` (\`team_id\`)`);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` ADD CONSTRAINT \`FK_d0c5c9c548aeca701b1c5e324af\` FOREIGN KEY (\`connector_id\`) REFERENCES \`connectors\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` ADD CONSTRAINT \`FK_a02b57565b7791e09faf28fc3f3\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` ADD CONSTRAINT \`FK_3aafc8eb664dbccc589a214d632\` FOREIGN KEY (\`category_id\`) REFERENCES \`workflow_email_categories\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` ADD CONSTRAINT \`FK_863b9a547b9c53265c112d1175a\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` ADD CONSTRAINT \`FK_07075348bfe5738c0b865ab3f33\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` DROP FOREIGN KEY \`FK_07075348bfe5738c0b865ab3f33\``);
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` DROP FOREIGN KEY \`FK_863b9a547b9c53265c112d1175a\``);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` DROP FOREIGN KEY \`FK_3aafc8eb664dbccc589a214d632\``);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` DROP FOREIGN KEY \`FK_a02b57565b7791e09faf28fc3f3\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` DROP FOREIGN KEY \`FK_d0c5c9c548aeca701b1c5e324af\``);
        await queryRunner.query(`DROP INDEX \`IDX_d5673b06a25da351f39b24bc1c\` ON \`workflows\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` DROP COLUMN \`connector_id\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` ADD \`connector_id\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP COLUMN \`credentials\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD \`credentials\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`team_members\` CHANGE \`is_compliant\` \`is_compliant\` tinyint NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP COLUMN \`status\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP INDEX \`IDX_3c660e54b01d947c40bde51f62\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP COLUMN \`primary_identifier\``);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP COLUMN \`team_id\``);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP COLUMN \`context\``);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP COLUMN \`steps\``);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP COLUMN \`connectors_needed\``);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP COLUMN \`trigger_queue\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD \`is_active\` tinyint NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD \`displays\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD \`trigger_id\` varchar(36) NULL`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD \`parent_id\` varchar(36) NULL`);
        await queryRunner.query(`DROP INDEX \`IDX_9edaa20785f2d428db299a9e68\` ON \`workflow_email_categories\``);
        await queryRunner.query(`DROP INDEX \`IDX_863b9a547b9c53265c112d1175\` ON \`workflow_email_categories\``);
        await queryRunner.query(`DROP TABLE \`workflow_email_categories\``);
        await queryRunner.query(`DROP INDEX \`IDX_a02b57565b7791e09faf28fc3f\` ON \`workflow_email_category_resources\``);
        await queryRunner.query(`DROP TABLE \`workflow_email_category_resources\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` CHANGE \`connector_id\` \`credential_id\` varchar(255) NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`REL_7fa069e870ccf0e924b8c9d908\` ON \`workflows\` (\`trigger_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_6905d7aee94efc6cc54a3223db\` ON \`workflows\` (\`client_id\`, \`parent_id\`)`);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` ADD CONSTRAINT \`FK_67c3c3898e198ea93feba50299c\` FOREIGN KEY (\`credential_id\`) REFERENCES \`user_credentials\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD CONSTRAINT \`FK_1adda217b0e07ee74ba8c2cda92\` FOREIGN KEY (\`connector_type_id\`) REFERENCES \`connector_types\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD CONSTRAINT \`FK_7fa069e870ccf0e924b8c9d9088\` FOREIGN KEY (\`trigger_id\`) REFERENCES \`workflow_triggers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD CONSTRAINT \`FK_2438fdb765cc9b1e5963807fd5d\` FOREIGN KEY (\`parent_id\`) REFERENCES \`workflows\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
