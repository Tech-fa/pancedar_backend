import { MigrationInterface, QueryRunner } from "typeorm";

export class RemovedClient1776795795759 implements MigrationInterface {
    name = 'RemovedClient1776795795759'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP FOREIGN KEY \`FK_7e69564ed0be83d0a0cb3998ce6\``);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` DROP FOREIGN KEY \`FK_d5611d5f47a746b23fd57a04323\``);
        await queryRunner.query(`ALTER TABLE \`permission_groups\` DROP FOREIGN KEY \`FK_2c12aa3f5e76264112e2a00a80c\``);
        await queryRunner.query(`ALTER TABLE \`teams\` DROP FOREIGN KEY \`FK_a8c74f3fee2a96e016dd04571d0\``);
        await queryRunner.query(`ALTER TABLE \`team_members\` DROP FOREIGN KEY \`FK_a4ee7096c62b53f88ae7702d99a\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP FOREIGN KEY \`FK_bdd4afca28e65ad9fa4a1395af7\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_0d1e90d75674c54f8660c4ed446\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP FOREIGN KEY \`FK_c4a765f8953f2f507ff575ff193\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` DROP FOREIGN KEY \`FK_user_incoming_email_workflow\``);
        await queryRunner.query(`ALTER TABLE \`otp\` DROP FOREIGN KEY \`FK_43d896fd0166caf911c6d241a42\``);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` DROP FOREIGN KEY \`FK_a02b57565b7791e09faf28fc3f3\``);
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` DROP FOREIGN KEY \`FK_863b9a547b9c53265c112d1175a\``);
        await queryRunner.query(`ALTER TABLE \`histories\` DROP FOREIGN KEY \`FK_3ce9fa8f56e82376db9bf5f8bfb\``);
        await queryRunner.query(`DROP INDEX \`IDX_7e69564ed0be83d0a0cb3998ce\` ON \`workflows\``);
        await queryRunner.query(`DROP INDEX \`IDX_d5611d5f47a746b23fd57a0432\` ON \`workflow_runs\``);
        await queryRunner.query(`DROP INDEX \`IDX_2c12aa3f5e76264112e2a00a80\` ON \`permission_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_b517fe821c23ee60c4231c39eb\` ON \`permission_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_01a1a874ee699b06e09359ab5d\` ON \`teams\``);
        await queryRunner.query(`DROP INDEX \`IDX_a8c74f3fee2a96e016dd04571d\` ON \`teams\``);
        await queryRunner.query(`DROP INDEX \`IDX_a4ee7096c62b53f88ae7702d99\` ON \`team_members\``);
        await queryRunner.query(`DROP INDEX \`IDX_bdd4afca28e65ad9fa4a1395af\` ON \`user_permission_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_0d1e90d75674c54f8660c4ed44\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_c4a765f8953f2f507ff575ff19\` ON \`connectors\``);
        await queryRunner.query(`DROP INDEX \`IDX_43d896fd0166caf911c6d241a4\` ON \`otp\``);
        await queryRunner.query(`DROP INDEX \`IDX_a02b57565b7791e09faf28fc3f\` ON \`workflow_email_category_resources\``);
        await queryRunner.query(`DROP INDEX \`IDX_863b9a547b9c53265c112d1175\` ON \`workflow_email_categories\``);
        await queryRunner.query(`DROP INDEX \`IDX_9edaa20785f2d428db299a9e68\` ON \`workflow_email_categories\``);
        await queryRunner.query(`ALTER TABLE \`histories\` CHANGE \`client_id\` \`team_id\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`permission_groups\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`teams\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`team_members\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`user_type\``);
        await queryRunner.query(`ALTER TABLE \`connectors\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`otp\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` DROP COLUMN \`client_id\``);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` DROP COLUMN \`current_step\``);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` ADD \`current_step\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`permission_groups\` ADD UNIQUE INDEX \`IDX_4d923def23302dc5da192374bf\` (\`name\`)`);
        await queryRunner.query(`ALTER TABLE \`teams\` ADD UNIQUE INDEX \`IDX_48c0c32e6247a2de155baeaf98\` (\`name\`)`);
        await queryRunner.query(`ALTER TABLE \`histories\` CHANGE \`team_id\` \`team_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_0e9465aa530a7da1b62a9fd2ad\` ON \`workflow_email_categories\` (\`team_id\`, \`name\`)`);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` ADD CONSTRAINT \`FK_e8e618eaf9aa8a4375829887490\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`histories\` ADD CONSTRAINT \`FK_8410f70e155264d2fe6a4e986c1\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`histories\` DROP FOREIGN KEY \`FK_8410f70e155264d2fe6a4e986c1\``);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` DROP FOREIGN KEY \`FK_e8e618eaf9aa8a4375829887490\``);
        await queryRunner.query(`DROP INDEX \`IDX_0e9465aa530a7da1b62a9fd2ad\` ON \`workflow_email_categories\``);
        await queryRunner.query(`ALTER TABLE \`histories\` CHANGE \`team_id\` \`team_id\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`teams\` DROP INDEX \`IDX_48c0c32e6247a2de155baeaf98\``);
        await queryRunner.query(`ALTER TABLE \`permission_groups\` DROP INDEX \`IDX_4d923def23302dc5da192374bf\``);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` DROP COLUMN \`current_step\``);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` ADD \`current_step\` varchar(225) NULL`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`otp\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`user_type\` enum ('standard', 'technician', 'pilot') NOT NULL DEFAULT 'standard'`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`team_members\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`teams\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`permission_groups\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD \`client_id\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`histories\` CHANGE \`team_id\` \`client_id\` varchar(255) NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_9edaa20785f2d428db299a9e68\` ON \`workflow_email_categories\` (\`client_id\`, \`name\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_863b9a547b9c53265c112d1175\` ON \`workflow_email_categories\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_a02b57565b7791e09faf28fc3f\` ON \`workflow_email_category_resources\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_43d896fd0166caf911c6d241a4\` ON \`otp\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_c4a765f8953f2f507ff575ff19\` ON \`connectors\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_0d1e90d75674c54f8660c4ed44\` ON \`users\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_bdd4afca28e65ad9fa4a1395af\` ON \`user_permission_groups\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_a4ee7096c62b53f88ae7702d99\` ON \`team_members\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_a8c74f3fee2a96e016dd04571d\` ON \`teams\` (\`client_id\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_01a1a874ee699b06e09359ab5d\` ON \`teams\` (\`client_id\`, \`name\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_b517fe821c23ee60c4231c39eb\` ON \`permission_groups\` (\`client_id\`, \`name\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_2c12aa3f5e76264112e2a00a80\` ON \`permission_groups\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_d5611d5f47a746b23fd57a0432\` ON \`workflow_runs\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_7e69564ed0be83d0a0cb3998ce\` ON \`workflows\` (\`client_id\`)`);
        await queryRunner.query(`ALTER TABLE \`histories\` ADD CONSTRAINT \`FK_3ce9fa8f56e82376db9bf5f8bfb\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_categories\` ADD CONSTRAINT \`FK_863b9a547b9c53265c112d1175a\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_email_category_resources\` ADD CONSTRAINT \`FK_a02b57565b7791e09faf28fc3f3\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`otp\` ADD CONSTRAINT \`FK_43d896fd0166caf911c6d241a42\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_incoming_emails\` ADD CONSTRAINT \`FK_user_incoming_email_workflow\` FOREIGN KEY (\`workflow_run_id\`) REFERENCES \`workflow_runs\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`connectors\` ADD CONSTRAINT \`FK_c4a765f8953f2f507ff575ff193\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD CONSTRAINT \`FK_0d1e90d75674c54f8660c4ed446\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD CONSTRAINT \`FK_bdd4afca28e65ad9fa4a1395af7\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`team_members\` ADD CONSTRAINT \`FK_a4ee7096c62b53f88ae7702d99a\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`teams\` ADD CONSTRAINT \`FK_a8c74f3fee2a96e016dd04571d0\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`permission_groups\` ADD CONSTRAINT \`FK_2c12aa3f5e76264112e2a00a80c\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflow_runs\` ADD CONSTRAINT \`FK_d5611d5f47a746b23fd57a04323\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD CONSTRAINT \`FK_7e69564ed0be83d0a0cb3998ce6\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
