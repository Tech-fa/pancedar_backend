import { EntityManager } from 'typeorm';

interface DisplayIdOptions {
  tableName: string;
  prefix: string;
  padLength?: number;
}

const DEFAULT_PAD_LENGTH = 3;
const VALID_TABLE_NAME = /[^a-zA-Z0-9_]/g;

function sanitizeTableName(tableName: string): string {
  const sanitized = tableName.replace(VALID_TABLE_NAME, '');
  if (!sanitized) {
    throw new Error('Invalid table name provided for display id generation');
  }
  return sanitized;
}

export async function generateClientScopedDisplayId(
  manager: EntityManager,
  clientId: string,
  options: DisplayIdOptions,
): Promise<string> {
  const tableName = sanitizeTableName(options.tableName);
  const prefix = options.prefix.toUpperCase();
  const padLength = options.padLength ?? DEFAULT_PAD_LENGTH;

  const rows = await manager.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(display_id, '-', -1) AS UNSIGNED)), 0) AS maxSeq
     FROM \`${tableName}\`
     WHERE client_id = ? AND display_id LIKE ?`,
    [clientId, `${prefix}-%`],
  );

  const nextSequence = Number(rows?.[0]?.maxSeq ?? 0) + 1;
  return `${prefix}-${nextSequence.toString().padStart(padLength, '0')}`;
}
