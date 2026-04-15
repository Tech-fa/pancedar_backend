import { createConnection } from 'mysql2/promise';
import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenvConfig({ path: path.resolve(__dirname, '../.env') });

async function dropAndCreateDatabase() {
  try {
    // First, connect without specifying a database using connection URL
    const connectionUrl = `localhost://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || '3306'}`;

    const connection = await createConnection(connectionUrl);

    console.log('Connected to MySQL server');

    // Drop the database if it exists
    const dbName = process.env.DB_NAME;
    console.log(`Dropping database ${dbName} if it exists...`);
    await connection.query(`DROP DATABASE IF EXISTS ${dbName}`);

    // Create the database
    console.log(`Creating database ${dbName}...`);
    await connection.query(
      `CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );

    console.log(
      `Database ${dbName} has been dropped and recreated successfully`,
    );

    // Close the connection
    await connection.end();

    console.log('Connection closed');
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

// Execute the function
dropAndCreateDatabase();
