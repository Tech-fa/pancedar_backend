import { registerAs } from '@nestjs/config';
import { config as dotenvConfig } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

dotenvConfig({ path: '.env' });

const config = {
  type: 'postgres',
  url: process.env.PG_URL,
  synchronize: false,
  logging: false,
  migrationsTableName: 'typeorm_migrations_ts',
  entities: [__dirname + `/../**/*.ts_entity{.ts,.js}`],
  migrations: [__dirname + '/../migrations-timescale/*{.ts,.js}'],
};
export default registerAs('psql', () => config);
export const psqlSource = new DataSource(config as DataSourceOptions);
