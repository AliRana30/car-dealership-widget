import fs from 'fs';
import path from 'path';

// Load .env manually
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (e) {}

async function runTests() {
  const { getRelevantWebsiteData, getRelevantWebsiteRecords } = await import('../src/config/widgetsDb');

  console.log('====================================================');
  console.log('TESTING ENHANCED UNIVERSAL RETRIEVAL & CONVERSATION');
  console.log('====================================================\n');

  const widgetId = 'default';

  // 1. Test Negative Search (e.g. "Do you offer frontend course?")
  console.log('--- TEST 1: Negative Query ("Do you offer frontend course?") ---');
  const negRecords = await getRelevantWebsiteRecords(widgetId, 'Do you offer frontend course?');
  console.log('Negative query records count:', negRecords.length);
  if (negRecords.length === 0) {
    console.log('✅ PASS: Returned 0 unrelated catalog cards on negative search (Anti-hallucination working!).');
  } else {
    console.log('❌ FAIL: Returned unrelated records for negative search:', negRecords.map(r => r.title));
  }

  // 2. Test Specific Entity Search (e.g. "Tell me about Backend Mastery")
  console.log('\n--- TEST 2: Specific Entity ("Tell me about Backend Mastery") ---');
  const specificRecords = await getRelevantWebsiteRecords(widgetId, 'Tell me about Backend Mastery');
  console.log('Specific query records count:', specificRecords.length);
  console.log('Titles:', specificRecords.map(r => `${r.title} ($${r.price})`));
  if (specificRecords.length === 1 && specificRecords[0].title?.toLowerCase().includes('backend')) {
    console.log('✅ PASS: Returned ONLY the specific requested entity!');
  } else {
    console.log('Result count/titles:', specificRecords.length, specificRecords.map(r => r.title));
  }

  // 3. Test General Catalog Search (e.g. "What courses do you offer?")
  console.log('\n--- TEST 3: General Catalog ("What courses do you offer?") ---');
  const catalogRecords = await getRelevantWebsiteRecords(widgetId, 'What courses do you offer?');
  console.log('Catalog query records count:', catalogRecords.length);
  console.log('Catalog items:', catalogRecords.map(r => `${r.title} - ${r.price ? '$' + r.price : 'N/A'}`));
  if (catalogRecords.length >= 2) {
    console.log('✅ PASS: Returned multiple catalog options for general query.');
  }

  // 4. Test Budget Constraint (e.g. "Courses under $100")
  console.log('\n--- TEST 4: Price Constraint ("Courses under $100") ---');
  const budgetRecords = await getRelevantWebsiteRecords(widgetId, 'Courses under $100');
  console.log('Budget query records count:', budgetRecords.length);
  console.log('Budget items:', budgetRecords.map(r => `${r.title} ($${r.price})`));
  const allUnder100 = budgetRecords.every(r => !r.price || parseFloat(String(r.price).replace(/[^0-9.]/g, '')) <= 100);
  if (allUnder100 && budgetRecords.length > 0) {
    console.log('✅ PASS: All returned records satisfy price constraint (<= $100).');
  } else {
    console.log('Result count:', budgetRecords.length);
  }

  // 5. Test Image Extraction
  console.log('\n--- TEST 5: Image Verification ---');
  let hasUnsplash = false;
  let hasRealImages = false;
  catalogRecords.forEach(r => {
    if (r.images && r.images.length > 0) {
      r.images.forEach(img => {
        if (img.includes('images.unsplash.com')) hasUnsplash = true;
        else hasRealImages = true;
      });
    }
  });
  console.log(`Has Unsplash placeholders: ${hasUnsplash}, Has real crawled images: ${hasRealImages}`);
  if (!hasUnsplash) {
    console.log('✅ PASS: No hardcoded Unsplash placeholder URLs found in results.');
  }

  // 6. Test Text Context (getRelevantWebsiteData)
  console.log('\n--- TEST 6: Context Generation (getRelevantWebsiteData) ---');
  const contextData = await getRelevantWebsiteData(widgetId, 'Backend Mastery');
  console.log('Context excerpt:\n', contextData.substring(0, 300));
  if (contextData.toLowerCase().includes('backend')) {
    console.log('✅ PASS: getRelevantWebsiteData contains accurate entity context.');
  }

  console.log('\n====================================================');
  console.log('ALL RETRIEVAL & SEARCH TESTS COMPLETED');
  console.log('====================================================');
}

runTests().catch(console.error);
