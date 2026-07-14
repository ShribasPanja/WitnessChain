const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Manually parse .env file to extract DATABASE_URL
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found in supplychainfe directory!');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (match) {
      // Strip quotes and return connection string
      return match[1].replace(/['"]/g, '').trim();
    }
  }
  return null;
}

async function main() {
  console.log('🔄 Starting PostgreSQL Database Migration...');
  const databaseUrl = loadEnv();
  
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL is not set in .env file!');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database.');

    const sqlDir = path.resolve(__dirname, '../database-schema');
    if (!fs.existsSync(sqlDir)) {
      console.error(`Error: Migration folder not found at ${sqlDir}`);
      process.exit(1);
    }

    const files = fs.readdirSync(sqlDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration file(s).`);

    for (const file of files) {
      const filePath = path.join(sqlDir, file);
      console.log(`Applying migration: ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
    }
    
    console.log('🎉 All migrations successful! Database schema is up-to-date.');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
