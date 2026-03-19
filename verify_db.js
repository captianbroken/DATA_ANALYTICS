const { Client } = require('pg');

const connectionString = 'postgresql://postgres.dtgkaokrcnrorwsjgjcr:lqCBs0ytEgEHF2se@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres';

async function verifyFunctions() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const res = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name IN ('dashboard_login', 'create_dashboard_user', 'seed_admin_user');
    `);

    console.log('Found functions:', res.rows.map(r => r.routine_name).join(', '));

    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'sites', 'cameras', 'employees');
    `);
    console.log('Found tables:', tableRes.rows.map(r => r.table_name).join(', '));

  } catch (err) {
    console.error('Verification failed:', err.message);
  } finally {
    await client.end();
  }
}

verifyFunctions();
