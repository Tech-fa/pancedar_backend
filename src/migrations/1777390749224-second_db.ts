import { MigrationInterface, QueryRunner } from "typeorm";

export class SecondDb1777390749224 implements MigrationInterface {
    name = 'SecondDb1777390749224'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_3c660e54b01d947c40bde51f62\` ON \`connectors\``);
        await queryRunner.query(`CREATE TABLE \`workflow_connectors\` (\`workflow_id\` varchar(36) NOT NULL, \`connector_id\` varchar(36) NOT NULL, INDEX \`IDX_4b9787cff67bfb4e324f41d529\` (\`workflow_id\`), INDEX \`IDX_39c1789b81024de2680b603752\` (\`connector_id\`), PRIMARY KEY (\`workflow_id\`, \`connector_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`workflows\` ADD \`workflow_type\` varchar(255) NOT NULL`);
        await queryRunner.query(`Update workflows set workflow_type = name`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_67e4c1bf3b7bdd49426e88ac84\` ON \`connectors\` (\`primary_identifier\`, \`connector_type_id\`)`);
        await queryRunner.query(`ALTER TABLE \`workflow_connectors\` ADD CONSTRAINT \`FK_4b9787cff67bfb4e324f41d5292\` FOREIGN KEY (\`workflow_id\`) REFERENCES \`workflows\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`workflow_connectors\` ADD CONSTRAINT \`FK_39c1789b81024de2680b6037528\` FOREIGN KEY (\`connector_id\`) REFERENCES \`connectors\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`workflow_connectors\` DROP FOREIGN KEY \`FK_39c1789b81024de2680b6037528\``);
        await queryRunner.query(`ALTER TABLE \`workflow_connectors\` DROP FOREIGN KEY \`FK_4b9787cff67bfb4e324f41d5292\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP FOREIGN KEY \`FK_913a13b46eb7924fa658144ed83\``);
        await queryRunner.query(`DROP INDEX \`IDX_1b006612d4a2d0cbf458eccfc5\` ON \`workflows\``);
        await queryRunner.query(`DROP INDEX \`IDX_67e4c1bf3b7bdd49426e88ac84\` ON \`connectors\``);
        await queryRunner.query(`DROP INDEX \`IDX_fc8d8290f84ed2494fd4f18bb9\` ON \`user_permission_groups\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` DROP COLUMN \`user_id\``);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD \`user_id\` varchar(255) NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_fc8d8290f84ed2494fd4f18bb9\` ON \`user_permission_groups\` (\`user_id\`, \`permission_group_id\`, \`team_id\`)`);
        await queryRunner.query(`ALTER TABLE \`user_permission_groups\` ADD CONSTRAINT \`FK_913a13b46eb7924fa658144ed83\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`workflows\` DROP COLUMN \`workflow_type\``);
        await queryRunner.query(`DROP INDEX \`IDX_39c1789b81024de2680b603752\` ON \`workflow_connectors\``);
        await queryRunner.query(`DROP INDEX \`IDX_4b9787cff67bfb4e324f41d529\` ON \`workflow_connectors\``);
        await queryRunner.query(`DROP TABLE \`workflow_connectors\``);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_3c660e54b01d947c40bde51f62\` ON \`connectors\` (\`primary_identifier\`)`);
    }

}
