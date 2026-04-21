import { MigrationInterface, QueryRunner } from "typeorm";

export class InitDb1776693140404 implements MigrationInterface {
    name = 'InitDb1776693140404'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`clients\` (\`id\` varchar(255) NOT NULL, \`company_name\` varchar(255) NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT '0', \`created_at\` bigint NOT NULL, \`domain\` varchar(255) NOT NULL, \`logo_key\` varchar(512) NULL, UNIQUE INDEX \`IDX_99ba9f1605b7b03bfaf8e6badf\` (\`company_name\`), UNIQUE INDEX \`IDX_cbde010903c666a692d843d8b5\` (\`domain\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`workflows\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`description\` text NULL, \`trigger_queue\` varchar(255) NOT NULL, \`steps\` json NULL, \`context\` json NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, \`team_id\` varchar(36) NOT NULL, INDEX \`IDX_7e69564ed0be83d0a0cb3998ce\` (\`client_id\`), INDEX \`IDX_d5673b06a25da351f39b24bc1c\` (\`team_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`permission_groups\` (\`client_id\` varchar(255) NOT NULL, \`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`permissions\` json NOT NULL, \`custom\` tinyint NOT NULL DEFAULT 0, \`deleted\` tinyint NOT NULL DEFAULT 0, \`description\` text NULL, INDEX \`IDX_2c12aa3f5e76264112e2a00a80\` (\`client_id\`), UNIQUE INDEX \`IDX_b517fe821c23ee60c4231c39eb\` (\`client_id\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`user_permission_groups\` (\`client_id\` varchar(255) NOT NULL, \`id\` int NOT NULL AUTO_INCREMENT, \`team_id\` varchar(255) NOT NULL, \`user_id\` varchar(255) NULL, \`permission_group_id\` int NULL, INDEX \`IDX_bdd4afca28e65ad9fa4a1395af\` (\`client_id\`), UNIQUE INDEX \`IDX_fc8d8290f84ed2494fd4f18bb9\` (\`user_id\`, \`permission_group_id\`, \`team_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`users\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(255) NOT NULL, \`fname\` varchar(255) NOT NULL, \`lname\` varchar(255) NOT NULL, \`phone\` varchar(255) NULL, \`email\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, \`password\` text NOT NULL, \`failed_logins\` int NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 0, \`verified_at\` bigint NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, \`user_type\` enum ('standard', 'technician', 'pilot') NOT NULL DEFAULT 'standard', \`last_login\` bigint NULL, \`created_by\` varchar(255) NULL, INDEX \`IDX_0d1e90d75674c54f8660c4ed44\` (\`client_id\`), INDEX \`IDX_b147a0c758f65b438f114cc193\` (\`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`teams\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, INDEX \`IDX_a8c74f3fee2a96e016dd04571d\` (\`client_id\`), UNIQUE INDEX \`IDX_01a1a874ee699b06e09359ab5d\` (\`client_id\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`team_members\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`team_id\` varchar(255) NOT NULL, \`user_id\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, INDEX \`IDX_a4ee7096c62b53f88ae7702d99\` (\`client_id\`), UNIQUE INDEX \`IDX_1d3c06a8217a8785e2af0ec4ab\` (\`team_id\`, \`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`connectors\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`primary_identifier\` varchar(255) NOT NULL, \`credentials\` json NULL, \`connector_type_id\` varchar(36) NOT NULL, \`status\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, \`team_id\` varchar(36) NOT NULL, \`updated_at\` bigint NOT NULL, INDEX \`IDX_c4a765f8953f2f507ff575ff19\` (\`client_id\`), UNIQUE INDEX \`IDX_3c660e54b01d947c40bde51f62\` (\`primary_identifier\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`user_incoming_emails\` (\`id\` varchar(255) NOT NULL, \`connector_id\` varchar(255) NOT NULL, \`from\` varchar(255) NOT NULL, \`subject\` varchar(500) NULL, \`html_text\` longtext NULL, \`text\` longtext NULL, \`message_id\` varchar(255) NOT NULL, \`attachments\` json NULL, \`summary\` text NULL, \`has_unsubscribe\` tinyint NOT NULL DEFAULT 0, \`is_processed\` tinyint NOT NULL DEFAULT 0, \`processing_status\` enum ('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending', \`processed_at\` bigint NULL, \`processing_attempts\` int NOT NULL DEFAULT '0', \`creation_date\` bigint NOT NULL, \`created_at\` bigint NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`otp\` (\`client_id\` varchar(255) NOT NULL, \`id\` int NOT NULL AUTO_INCREMENT, \`email\` varchar(255) NULL, \`code\` varchar(255) NOT NULL, \`created\` bigint NOT NULL, INDEX \`IDX_43d896fd0166caf911c6d241a4\` (\`client_id\`), UNIQUE INDEX \`IDX_463cf01e0ea83ad57391fd4e1d\` (\`email\`), UNIQUE INDEX \`IDX_f6f87548102f5848e26035bde0\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`locations\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`address\` text NULL, \`city\` varchar(100) NULL, \`state\` varchar(100) NULL, \`country\` varchar(100) NULL, \`postal_code\` varchar(20) NULL, \`latitude\` decimal(10,7) NULL, \`longitude\` decimal(10,7) NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, INDEX \`IDX_c1cb69cb5766cdb5f799520107\` (\`client_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`histories\` (\`id\` int NOT NULL AUTO_INCREMENT, \`entity_type\` varchar(255) NOT NULL, \`entity_id\` varchar(255) NOT NULL, \`changes\` json NOT NULL, \`action\` varchar(255) NOT NULL, \`created_at\` bigint NOT NULL, \`client_id\` varchar(255) NULL, \`user_id\` varchar(255) NULL, INDEX \`IDX_79c23b4d607d60b8b056aa4a05\` (\`entity_id\`, \`entity_type\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`comments\` (\`client_id\` varchar(255) NOT NULL, \`id\` int NOT NULL AUTO_INCREMENT, \`text\` text NOT NULL, \`creator_id\` varchar(255) NULL, INDEX \`IDX_c56af4da87fbe1a72d542dd419\` (\`client_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`workflow_email_category_resources\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`category_id\` varchar(36) NOT NULL, \`text_resource\` text NULL, \`links\` json NULL, \`files\` json NULL, \`all_text\` varchar(500) NULL, INDEX \`IDX_a02b57565b7791e09faf28fc3f\` (\`client_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`workflow_email_categories\` (\`client_id\` varchar(255) NOT NULL, \`id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`description\` text NULL, \`created_at\` bigint NOT NULL, \`updated_at\` bigint NOT NULL, \`team_id\` varchar(36) NOT NULL, INDEX \`IDX_863b9a547b9c53265c112d1175\` (\`client_id\`), UNIQUE INDEX \`IDX_9edaa20785f2d428db299a9e68\` (\`client_id\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD CONSTRAINT \`FK_7e69564ed0be83d0a0cb3998ce6\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`permission_groups\` ADD CONSTRAINT \`FK_2c12aa3f5e76264112e2a00a80c\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD CONSTRAINT \`FK_bdd4afca28e65ad9fa4a1395af7\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD CONSTRAINT \`FK_913a13b46eb7924fa658144ed83\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD CONSTRAINT \`FK_d3386195cb6d575bd263cdd3780\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD CONSTRAINT \`FK_353995aefa3d96ce1a599b128d8\` FOREIGN KEY (\`permission_group_id\`) REFERENCES \`permission_groups\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD CONSTRAINT \`FK_0d1e90d75674c54f8660c4ed446\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD CONSTRAINT \`FK_f32b1cb14a9920477bcfd63df2c\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`teams\` ADD CONSTRAINT \`FK_a8c74f3fee2a96e016dd04571d0\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`team_members\` ADD CONSTRAINT \`FK_a4ee7096c62b53f88ae7702d99a\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`team_members\` ADD CONSTRAINT \`FK_fdad7d5768277e60c40e01cdcea\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`team_members\` ADD CONSTRAINT \`FK_c2bf4967c8c2a6b845dadfbf3d4\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD CONSTRAINT \`FK_c4a765f8953f2f507ff575ff193\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD CONSTRAINT \`FK_b466046358a1ad945919ee0819b\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` ADD CONSTRAINT \`FK_d0c5c9c548aeca701b1c5e324af\` FOREIGN KEY (\`connector_id\`) REFERENCES \`connectors\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`otp\` ADD CONSTRAINT \`FK_43d896fd0166caf911c6d241a42\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`locations\` ADD CONSTRAINT \`FK_c1cb69cb5766cdb5f799520107c\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`histories\` ADD CONSTRAINT \`FK_3ce9fa8f56e82376db9bf5f8bfb\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`histories\` ADD CONSTRAINT \`FK_a5c0f522c47fcafbe1250c43add\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`comments\` ADD CONSTRAINT \`FK_c56af4da87fbe1a72d542dd419f\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`comments\` ADD CONSTRAINT \`FK_7761ee03973c7c9375b032ca676\` FOREIGN KEY (\`creator_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
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
        await queryRunner.query(`ALTER TABLE \`comments\` DROP FOREIGN KEY \`FK_7761ee03973c7c9375b032ca676\``);
        await queryRunner.query(`ALTER TABLE \`comments\` DROP FOREIGN KEY \`FK_c56af4da87fbe1a72d542dd419f\``);
        await queryRunner.query(`ALTER TABLE \`histories\` DROP FOREIGN KEY \`FK_a5c0f522c47fcafbe1250c43add\``);
        await queryRunner.query(`ALTER TABLE \`histories\` DROP FOREIGN KEY \`FK_3ce9fa8f56e82376db9bf5f8bfb\``);
        await queryRunner.query(`ALTER TABLE \`locations\` DROP FOREIGN KEY \`FK_c1cb69cb5766cdb5f799520107c\``);
        await queryRunner.query(`ALTER TABLE \`otp\` DROP FOREIGN KEY \`FK_43d896fd0166caf911c6d241a42\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` DROP FOREIGN KEY \`FK_d0c5c9c548aeca701b1c5e324af\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP FOREIGN KEY \`FK_b466046358a1ad945919ee0819b\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP FOREIGN KEY \`FK_c4a765f8953f2f507ff575ff193\``);
        await queryRunner.query(`ALTER TABLE \`team_members\` DROP FOREIGN KEY \`FK_c2bf4967c8c2a6b845dadfbf3d4\``);
        await queryRunner.query(`ALTER TABLE \`team_members\` DROP FOREIGN KEY \`FK_fdad7d5768277e60c40e01cdcea\``);
        await queryRunner.query(`ALTER TABLE \`team_members\` DROP FOREIGN KEY \`FK_a4ee7096c62b53f88ae7702d99a\``);
        await queryRunner.query(`ALTER TABLE \`teams\` DROP FOREIGN KEY \`FK_a8c74f3fee2a96e016dd04571d0\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_f32b1cb14a9920477bcfd63df2c\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_0d1e90d75674c54f8660c4ed446\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP FOREIGN KEY \`FK_353995aefa3d96ce1a599b128d8\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP FOREIGN KEY \`FK_d3386195cb6d575bd263cdd3780\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP FOREIGN KEY \`FK_913a13b46eb7924fa658144ed83\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP FOREIGN KEY \`FK_bdd4afca28e65ad9fa4a1395af7\``);
        await queryRunner.query(`ALTER TABLE \`permission_groups\` DROP FOREIGN KEY \`FK_2c12aa3f5e76264112e2a00a80c\``);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP FOREIGN KEY \`FK_7e69564ed0be83d0a0cb3998ce6\``);
        await queryRunner.query(`DROP INDEX \`IDX_9edaa20785f2d428db299a9e68\` ON \`workflow_email_categories\``);
        await queryRunner.query(`DROP INDEX \`IDX_863b9a547b9c53265c112d1175\` ON \`workflow_email_categories\``);
        await queryRunner.query(`DROP TABLE \`workflow_email_categories\``);
        await queryRunner.query(`DROP INDEX \`IDX_a02b57565b7791e09faf28fc3f\` ON \`workflow_email_category_resources\``);
        await queryRunner.query(`DROP TABLE \`workflow_email_category_resources\``);
        await queryRunner.query(`DROP INDEX \`IDX_c56af4da87fbe1a72d542dd419\` ON \`comments\``);
        await queryRunner.query(`DROP TABLE \`comments\``);
        await queryRunner.query(`DROP INDEX \`IDX_79c23b4d607d60b8b056aa4a05\` ON \`histories\``);
        await queryRunner.query(`DROP TABLE \`histories\``);
        await queryRunner.query(`DROP INDEX \`IDX_c1cb69cb5766cdb5f799520107\` ON \`locations\``);
        await queryRunner.query(`DROP TABLE \`locations\``);
        await queryRunner.query(`DROP INDEX \`IDX_f6f87548102f5848e26035bde0\` ON \`otp\``);
        await queryRunner.query(`DROP INDEX \`IDX_463cf01e0ea83ad57391fd4e1d\` ON \`otp\``);
        await queryRunner.query(`DROP INDEX \`IDX_43d896fd0166caf911c6d241a4\` ON \`otp\``);
        await queryRunner.query(`DROP TABLE \`otp\``);
        await queryRunner.query(`DROP TABLE \`user_incoming_emails\``);
        await queryRunner.query(`DROP INDEX \`IDX_3c660e54b01d947c40bde51f62\` ON \`connectors\``);
        await queryRunner.query(`DROP INDEX \`IDX_c4a765f8953f2f507ff575ff19\` ON \`connectors\``);
        await queryRunner.query(`DROP TABLE \`connectors\``);
        await queryRunner.query(`DROP INDEX \`IDX_1d3c06a8217a8785e2af0ec4ab\` ON \`team_members\``);
        await queryRunner.query(`DROP INDEX \`IDX_a4ee7096c62b53f88ae7702d99\` ON \`team_members\``);
        await queryRunner.query(`DROP TABLE \`team_members\``);
        await queryRunner.query(`DROP INDEX \`IDX_01a1a874ee699b06e09359ab5d\` ON \`teams\``);
        await queryRunner.query(`DROP INDEX \`IDX_a8c74f3fee2a96e016dd04571d\` ON \`teams\``);
        await queryRunner.query(`DROP TABLE \`teams\``);
        await queryRunner.query(`DROP INDEX \`IDX_b147a0c758f65b438f114cc193\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_0d1e90d75674c54f8660c4ed44\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_fc8d8290f84ed2494fd4f18bb9\` ON \`user_permission_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_bdd4afca28e65ad9fa4a1395af\` ON \`user_permission_groups\``);
        await queryRunner.query(`DROP TABLE \`user_permission_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_b517fe821c23ee60c4231c39eb\` ON \`permission_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_2c12aa3f5e76264112e2a00a80\` ON \`permission_groups\``);
        await queryRunner.query(`DROP TABLE \`permission_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_d5673b06a25da351f39b24bc1c\` ON \`workflows\``);
        await queryRunner.query(`DROP INDEX \`IDX_7e69564ed0be83d0a0cb3998ce\` ON \`workflows\``);
        await queryRunner.query(`DROP TABLE \`workflows\``);
        await queryRunner.query(`DROP INDEX \`IDX_cbde010903c666a692d843d8b5\` ON \`clients\``);
        await queryRunner.query(`DROP INDEX \`IDX_99ba9f1605b7b03bfaf8e6badf\` ON \`clients\``);
        await queryRunner.query(`DROP TABLE \`clients\``);
    }

}
