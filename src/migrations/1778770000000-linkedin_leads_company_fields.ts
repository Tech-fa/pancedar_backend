import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkedinLeadsCompanyFields1778770000000
  implements MigrationInterface
{
  name = "LinkedinLeadsCompanyFields1778770000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`linkedin_leads\` ADD \`company_linkedin_url\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`linkedin_leads\` ADD \`company_name\` varchar(512) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`linkedin_leads\` DROP COLUMN \`company_name\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`linkedin_leads\` DROP COLUMN \`company_linkedin_url\``,
    );
  }
}
