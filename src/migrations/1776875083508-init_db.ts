import { MigrationInterface, QueryRunner } from "typeorm";

export class InitDb1776875083508 implements MigrationInterface {
    name = 'InitDb1776875083508'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`workflows\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`description\` text NULL, \`trigger_queue\` varchar(255) NOT NULL, \`steps\` json NULL, \`context\` json NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, \`team_id\` varchar(36) NOT NULL, INDEX \`IDX_d5673b06a25da351f39b24bc1c\` (\`team_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`workflow_runs\` (\`id\` varchar(36) NOT NULL, \`workflow_id\` varchar(255) NOT NULL, \`context\` json NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, \`status\` varchar(255) NOT NULL, \`current_step\` varchar(255) NULL, \`steps_context\` json NULL, \`explanation\` json NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`permission_groups\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`permissions\` json NOT NULL, \`custom\` tinyint NOT NULL DEFAULT 0, \`deleted\` tinyint NOT NULL DEFAULT 0, \`description\` text NULL, UNIQUE INDEX \`IDX_4d923def23302dc5da192374bf\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`teams\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, UNIQUE INDEX \`IDX_48c0c32e6247a2de155baeaf98\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`team_members\` (\`id\` varchar(36) NOT NULL, \`team_id\` varchar(255) NOT NULL, \`user_id\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, UNIQUE INDEX \`IDX_1d3c06a8217a8785e2af0ec4ab\` (\`team_id\`, \`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`user_permission_groups\` (\`id\` int NOT NULL AUTO_INCREMENT, \`team_id\` varchar(255) NOT NULL, \`user_id\` varchar(255) NULL, \`permission_group_id\` int NULL, UNIQUE INDEX \`IDX_fc8d8290f84ed2494fd4f18bb9\` (\`user_id\`, \`permission_group_id\`, \`team_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`users\` (\`id\` varchar(255) NOT NULL, \`fname\` varchar(255) NOT NULL, \`lname\` varchar(255) NOT NULL, \`phone\` varchar(255) NULL, \`email\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, \`password\` text NOT NULL, \`failed_logins\` int NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 0, \`verified_at\` bigint NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, \`last_login\` bigint NULL, \`created_by\` varchar(255) NULL, INDEX \`IDX_b147a0c758f65b438f114cc193\` (\`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`connectors\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`primary_identifier\` varchar(255) NOT NULL, \`credentials\` json NULL, \`connector_type_id\` varchar(36) NOT NULL, \`status\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, \`team_id\` varchar(36) NOT NULL, \`updated_at\` bigint NOT NULL, UNIQUE INDEX \`IDX_3c660e54b01d947c40bde51f62\` (\`primary_identifier\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`user_incoming_emails\` (\`id\` varchar(255) NOT NULL, \`connector_id\` varchar(255) NOT NULL, \`from\` varchar(255) NOT NULL, \`subject\` varchar(500) NULL, \`html_text\` longtext NULL, \`text\` longtext NULL, \`message_id\` varchar(255) NOT NULL, \`attachments\` json NULL, \`creation_date\` bigint NOT NULL, \`created_at\` bigint NOT NULL, \`workflow_run_id\` varchar(36) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`otp\` (\`id\` int NOT NULL AUTO_INCREMENT, \`email\` varchar(255) NULL, \`code\` varchar(255) NOT NULL, \`created\` bigint NOT NULL, UNIQUE INDEX \`IDX_463cf01e0ea83ad57391fd4e1d\` (\`email\`), UNIQUE INDEX \`IDX_f6f87548102f5848e26035bde0\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`histories\` (\`id\` int NOT NULL AUTO_INCREMENT, \`entity_type\` varchar(255) NOT NULL, \`entity_id\` varchar(255) NOT NULL, \`changes\` json NOT NULL, \`action\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, \`team_id\` varchar(255) NOT NULL, \`user_id\` varchar(255) NULL, INDEX \`IDX_79c23b4d607d60b8b056aa4a05\` (\`entity_id\`, \`entity_type\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`costs\` (\`id\` varchar(36) NOT NULL, \`team_id\` varchar(255) NOT NULL, \`workflow_run_id\` varchar(255) NULL, \`llm_model_name\` varchar(255) NOT NULL, \`llm_model_tokens_input\` int UNSIGNED NOT NULL, \`llm_model_tokens_output\` int UNSIGNED NOT NULL, \`llm_model_tokens_cache_hit\` int UNSIGNED NOT NULL DEFAULT '0', \`llm_model_api\` varchar(100) NOT NULL, \`llm_model_cost\` decimal(18,8) NOT NULL DEFAULT '0.00000000', \`created_at\` bigint NOT NULL, \`month\` varchar(255) NOT NULL, \`year\` varchar(255) NOT NULL, INDEX \`IDX_54e09895de61c596b277602d3c\` (\`workflow_run_id\`), INDEX \`IDX_10ed8e7d3d72a67fc1d603ef0e\` (\`team_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`workflow_email_category_resources\` (\`id\` varchar(36) NOT NULL, \`category_id\` varchar(36) NOT NULL, \`text_resource\` text NULL, \`links\` json NULL, \`files\` json NULL, \`all_text\` varchar(500) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`workflow_email_categories\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`description\` text NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, \`team_id\` varchar(36) NOT NULL, UNIQUE INDEX \`IDX_0e9465aa530a7da1b62a9fd2ad\` (\`team_id\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` ADD CONSTRAINT \`FK_a2995918456c0a612cf1e5ba22a\` FOREIGN KEY (\`workflow_id\`) REFERENCES \`workflows\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`team_members\` ADD CONSTRAINT \`FK_fdad7d5768277e60c40e01cdcea\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`team_members\` ADD CONSTRAINT \`FK_c2bf4967c8c2a6b845dadfbf3d4\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD CONSTRAINT \`FK_913a13b46eb7924fa658144ed83\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD CONSTRAINT \`FK_d3386195cb6d575bd263cdd3780\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD CONSTRAINT \`FK_353995aefa3d96ce1a599b128d8\` FOREIGN KEY (\`permission_group_id\`) REFERENCES \`permission_groups\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD CONSTRAINT \`FK_f32b1cb14a9920477bcfd63df2c\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD CONSTRAINT \`FK_b466046358a1ad945919ee0819b\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` ADD CONSTRAINT \`FK_d0c5c9c548aeca701b1c5e324af\` FOREIGN KEY (\`connector_id\`) REFERENCES \`connectors\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` ADD CONSTRAINT \`FK_e8e618eaf9aa8a4375829887490\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`histories\` ADD CONSTRAINT \`FK_8410f70e155264d2fe6a4e986c1\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`histories\` ADD CONSTRAINT \`FK_a5c0f522c47fcafbe1250c43add\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`costs\` ADD CONSTRAINT \`FK_10ed8e7d3d72a67fc1d603ef0e5\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`costs\` ADD CONSTRAINT \`FK_54e09895de61c596b277602d3c6\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` ADD CONSTRAINT \`FK_3aafc8eb664dbccc589a214d632\` FOREIGN KEY (\`category_id\`) REFERENCES \`workflow_email_categories\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` ADD CONSTRAINT \`FK_07075348bfe5738c0b865ab3f33\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` DROP FOREIGN KEY \`FK_07075348bfe5738c0b865ab3f33\``);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` DROP FOREIGN KEY \`FK_3aafc8eb664dbccc589a214d632\``);
        await queryRunner.query(`ALTER TABLE \`costs\` DROP FOREIGN KEY \`FK_54e09895de61c596b277602d3c6\``);
        await queryRunner.query(`ALTER TABLE \`costs\` DROP FOREIGN KEY \`FK_10ed8e7d3d72a67fc1d603ef0e5\``);
        await queryRunner.query(`ALTER TABLE \`histories\` DROP FOREIGN KEY \`FK_a5c0f522c47fcafbe1250c43add\``);
        await queryRunner.query(`ALTER TABLE \`histories\` DROP FOREIGN KEY \`FK_8410f70e155264d2fe6a4e986c1\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` DROP FOREIGN KEY \`FK_e8e618eaf9aa8a4375829887490\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` DROP FOREIGN KEY \`FK_d0c5c9c548aeca701b1c5e324af\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP FOREIGN KEY \`FK_b466046358a1ad945919ee0819b\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_f32b1cb14a9920477bcfd63df2c\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP FOREIGN KEY \`FK_353995aefa3d96ce1a599b128d8\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP FOREIGN KEY \`FK_d3386195cb6d575bd263cdd3780\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP FOREIGN KEY \`FK_913a13b46eb7924fa658144ed83\``);
        await queryRunner.query(`ALTER TABLE \`team_members\` DROP FOREIGN KEY \`FK_c2bf4967c8c2a6b845dadfbf3d4\``);
        await queryRunner.query(`ALTER TABLE \`team_members\` DROP FOREIGN KEY \`FK_fdad7d5768277e60c40e01cdcea\``);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` DROP FOREIGN KEY \`FK_a2995918456c0a612cf1e5ba22a\``);
        await queryRunner.query(`DROP INDEX \`IDX_0e9465aa530a7da1b62a9fd2ad\` ON \`workflow_email_categories\``);
        await queryRunner.query(`DROP TABLE \`workflow_email_categories\``);
        await queryRunner.query(`DROP TABLE \`workflow_email_category_resources\``);
        await queryRunner.query(`DROP INDEX \`IDX_10ed8e7d3d72a67fc1d603ef0e\` ON \`costs\``);
        await queryRunner.query(`DROP INDEX \`IDX_54e09895de61c596b277602d3c\` ON \`costs\``);
        await queryRunner.query(`DROP TABLE \`costs\``);
        await queryRunner.query(`DROP INDEX \`IDX_79c23b4d607d60b8b056aa4a05\` ON \`histories\``);
        await queryRunner.query(`DROP TABLE \`histories\``);
        await queryRunner.query(`DROP INDEX \`IDX_f6f87548102f5848e26035bde0\` ON \`otp\``);
        await queryRunner.query(`DROP INDEX \`IDX_463cf01e0ea83ad57391fd4e1d\` ON \`otp\``);
        await queryRunner.query(`DROP TABLE \`otp\``);
        await queryRunner.query(`DROP TABLE \`user_incoming_emails\``);
        await queryRunner.query(`DROP INDEX \`IDX_3c660e54b01d947c40bde51f62\` ON \`connectors\``);
        await queryRunner.query(`DROP TABLE \`connectors\``);
        await queryRunner.query(`DROP INDEX \`IDX_b147a0c758f65b438f114cc193\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_fc8d8290f84ed2494fd4f18bb9\` ON \`user_permission_groups\``);
        await queryRunner.query(`DROP TABLE \`user_permission_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_1d3c06a8217a8785e2af0ec4ab\` ON \`team_members\``);
        await queryRunner.query(`DROP TABLE \`team_members\``);
        await queryRunner.query(`DROP INDEX \`IDX_48c0c32e6247a2de155baeaf98\` ON \`teams\``);
        await queryRunner.query(`DROP TABLE \`teams\``);
        await queryRunner.query(`DROP INDEX \`IDX_4d923def23302dc5da192374bf\` ON \`permission_groups\``);
        await queryRunner.query(`DROP TABLE \`permission_groups\``);
        await queryRunner.query(`DROP TABLE \`workflow_runs\``);
        await queryRunner.query(`DROP INDEX \`IDX_d5673b06a25da351f39b24bc1c\` ON \`workflows\``);
        await queryRunner.query(`DROP TABLE \`workflows\``);
    }

}
