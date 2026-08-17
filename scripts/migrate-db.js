const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables manually
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

// AES-256-GCM encryption helper matching src/lib/encryption.ts
const ALGORITHM = 'aes-256-gcm';
const DELIMITER = ':';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(DELIMITER);
}

async function run() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    console.error('SUPABASE_DATABASE_URL is not set in env.');
    process.exit(1);
  }

  console.log('Connecting to Supabase Database...');
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // 1. Run supabase_auth_migration.sql
    console.log('Executing migration SQL...');
    const migrationSqlPath = path.join(__dirname, '../supabase_auth_migration.sql');
    const sql = fs.readFileSync(migrationSqlPath, 'utf8');
    await client.query(sql);
    console.log('Migration SQL completed successfully.');

    // 2. Encrypt existing widget secrets
    console.log('Scanning for unencrypted widget secrets...');
    const { rows: secrets } = await client.query(
      'SELECT id, retell_api_key, vapi_api_key, encrypted FROM widget_secrets WHERE encrypted = false'
    );

    console.log(`Found ${secrets.length} unencrypted secret rows to migrate.`);

    for (const row of secrets) {
      const encryptedRetell = row.retell_api_key && !row.retell_api_key.includes(':') 
        ? encrypt(row.retell_api_key) 
        : row.retell_api_key;
      const encryptedVapi = row.vapi_api_key && !row.vapi_api_key.includes(':') 
        ? encrypt(row.vapi_api_key) 
        : row.vapi_api_key;

      await client.query(
        'UPDATE widget_secrets SET retell_api_key = $1, vapi_api_key = $2, encrypted = true WHERE id = $3',
        [encryptedRetell, encryptedVapi, row.id]
      );
      console.log(`Encrypted and migrated secret row: ${row.id}`);
    }

    console.log('Database migration & encryption completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
