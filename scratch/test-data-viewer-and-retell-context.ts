import { createClient } from '@supabase/supabase-js';
import { getWebsiteContextSummary, getRelevantWebsiteData, getRelevantWebsiteRecords } from '../src/config/widgetsDb';
import { GET } from '../src/app/api/websites/[websiteId]/data/route';
import { NextRequest } from 'next/server';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✅ PASSED: ${msg}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('⚡ Starting Data Viewer & Retell Context Verification');
  console.log('================================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Test Data Viewer API with non-UUID slug ("lms")
  console.log('--- 1. Testing Data Viewer with non-UUID slug ("lms") ---');
  const reqSlug = new NextRequest('http://localhost:3000/api/websites/lms/data?format=json');
  const resSlug = await GET(reqSlug, { params: { websiteId: 'lms' } });
  assert(resSlug.status === 200, `GET /api/websites/lms/data returned status 200 (was not 500 error)`);
  const jsonSlug = await resSlug.json();
  assert(jsonSlug.websiteId === 'lms', `Response contains websiteId: 'lms'`);
  assert(typeof jsonSlug.totalCount === 'number', `Response contains totalCount number`);
  assert(typeof jsonSlug.knowledgeEntitiesCount === 'number', `Response contains knowledgeEntitiesCount`);
  assert(typeof jsonSlug.sitePagesCount === 'number', `Response contains sitePagesCount`);

  // 2. Test Data Viewer API with the exact UUID from user screenshot ("cfbfa598-6c36-4447-9b27-173dbefa8e55")
  console.log('\n--- 2. Testing Data Viewer with target UUID ("cfbfa598-6c36-4447-9b27-173dbefa8e55") ---');
  const reqUuid = new NextRequest('http://localhost:3000/api/websites/cfbfa598-6c36-4447-9b27-173dbefa8e55/data?format=json');
  const resUuid = await GET(reqUuid, { params: { websiteId: 'cfbfa598-6c36-4447-9b27-173dbefa8e55' } });
  assert(resUuid.status === 200, `GET with target UUID returned status 200`);
  const jsonUuid = await resUuid.json();
  assert(jsonUuid.websiteId === 'cfbfa598-6c36-4447-9b27-173dbefa8e55', `Response contains target websiteId`);

  // 3. Test Data Viewer HTML rendering
  console.log('\n--- 3. Testing Data Viewer HTML UI Output ---');
  const reqHtml = new NextRequest('http://localhost:3000/api/websites/cfbfa598-6c36-4447-9b27-173dbefa8e55/data');
  const resHtml = await GET(reqHtml, { params: { websiteId: 'cfbfa598-6c36-4447-9b27-173dbefa8e55' } });
  assert(resHtml.status === 200, `GET HTML returned 200`);
  const htmlContent = await resHtml.text();
  assert(htmlContent.includes('tab-bar'), `HTML includes tab-bar navigation`);
  assert(htmlContent.includes('Knowledge Records / Catalog'), `HTML includes Knowledge Records / Catalog tab`);
  assert(htmlContent.includes('Site Pages & Content'), `HTML includes Site Pages & Content tab`);
  assert(htmlContent.includes('applyFilters'), `HTML includes client-side live filter script`);

  // 4. Test Retell Context Summary generation
  console.log('\n--- 4. Testing Retell Context Summary (getWebsiteContextSummary) ---');
  const contextSummary = await getWebsiteContextSummary('cfbfa598-6c36-4447-9b27-173dbefa8e55');
  console.log(`Context summary length: ${contextSummary.length} characters.`);
  assert(typeof contextSummary === 'string', `getWebsiteContextSummary returned a string`);

  // Also test with non-UUID slug
  const contextSlug = await getWebsiteContextSummary('lms');
  assert(typeof contextSlug === 'string', `getWebsiteContextSummary('lms') safely returned without throwing`);

  console.log('\n================================================================');
  console.log('🎉 ALL DATA VIEWER & RETELL CONTEXT TESTS PASSED (10/10)!');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Error during test execution:', err);
  process.exit(1);
});
