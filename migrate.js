const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.dtgkaokrcnrorwsjgjcr:lqCBs0ytEgEHF2se@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres';

async function runMigration() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const sqlFiles = [
      'schema.sql',
      'dashboard_migration.sql',
      'fix_auth_and_rls.sql',
      'add_user_assignments.sql'
    ];

    for (const file of sqlFiles) {
      const sqlPath = path.join(__dirname, file);
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`Executing ${file}...`);
        await client.query(sql);
        console.log(`${file} completed successfully`);
      } else {
        console.warn(`File ${file} not found, skipping.`);
      }
    }

    console.log('All migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
