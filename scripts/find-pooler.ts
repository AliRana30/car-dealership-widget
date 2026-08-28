import { Client } from 'pg';
import * as dns from 'dns';

const regions = [
  'us-east-1',
  'us-west-1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'sa-east-1',
  'ca-central-1'
];

async function checkPoolers() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const connStr = `postgresql://postgres.xkysuvmckhhcktgrmwxn:AliRana28!%40@${host}:6543/postgres`;
    console.log(`Checking ${region} (${host})...`);
    const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      console.log(`>>> SUCCESS WITH REGION: ${region} <<<`);
      const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`);
      console.log('Tables found:', res.rows.map(r => r.table_name));
      await client.end();
      return region;
    } catch (e: any) {
      console.log(`  ${region} failed:`, e.message);
    }
  }
}

checkPoolers();
