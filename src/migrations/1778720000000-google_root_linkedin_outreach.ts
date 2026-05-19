import { MigrationInterface, QueryRunner } from "typeorm";

export class GoogleRootLinkedinOutreach1778720000000
  implements MigrationInterface
{
  name = "GoogleRootLinkedinOutreach1778720000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`google_root_websites\` ADD \`linkedin_contact_profile_url\` varchar(2048) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`google_root_websites\` ADD \`linkedin_outreach_summary\` text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`google_root_websites\` DROP COLUMN \`linkedin_outreach_summary\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`google_root_websites\` DROP COLUMN \`linkedin_contact_profile_url\``,
    );
  }
}
