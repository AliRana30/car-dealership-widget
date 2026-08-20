import { getRelevantWebsiteData, getRelevantWebsiteRecords } from '../src/config/widgetsDb';

async function runTests() {
  const widgetId = 'cfbfa598-6c36-4447-9b27-173dbefa8e55'; // CampusCore LMS

  console.log('====================================================');
  console.log('🧪 TEST 1: Specific Item Query ("can you show me the mern sstack course?")');
  console.log('====================================================');
  const data1 = await getRelevantWebsiteData(widgetId, 'can you show me the mern sstack course?');
  const records1 = await getRelevantWebsiteRecords(widgetId, 'can you show me the mern sstack course?');
  console.log('Relevant Text Snippets:\n', data1);
  console.log('Returned Cards Count:', records1.length);
  console.log('Card 1 Title:', records1[0]?.title);
  console.log('Card 1 Price:', records1[0]?.price);
  console.log('Card 1 Source URL:', records1[0]?.sourceUrl);
  if (records1.length === 1 && records1[0]?.title?.includes('MERN') && records1[0]?.sourceUrl?.includes('/course/6945abe7c4769ef223f140fd')) {
    console.log('✅ TEST 1 PASSED: Exactly 1 specific MERN course card with /course/:id route returned!');
  } else {
    console.error('❌ TEST 1 FAILED!');
  }

  console.log('\n====================================================');
  console.log('🧪 TEST 2: Budget Constraint Query ("show me courses under $100")');
  console.log('====================================================');
  const data2 = await getRelevantWebsiteData(widgetId, 'show me courses under $100');
  const records2 = await getRelevantWebsiteRecords(widgetId, 'show me courses under $100');
  console.log('Relevant Text Snippets:\n', data2);
  console.log('Returned Cards Count:', records2.length);
  console.log('Card 1 Title:', records2[0]?.title);
  console.log('Card 1 Price:', records2[0]?.price);
  console.log('Card 1 Source URL:', records2[0]?.sourceUrl);
  if (records2.length === 1 && records2[0]?.title?.includes('Leetcode') && records2[0]?.price === '$90') {
    console.log('✅ TEST 2 PASSED: Budget filtering accurately selected only Leetcode Mastery ($90)!');
  } else {
    console.error('❌ TEST 2 FAILED!');
  }

  console.log('\n====================================================');
  console.log('🧪 TEST 3: Information Query ("show me your about")');
  console.log('====================================================');
  const data3 = await getRelevantWebsiteData(widgetId, 'show me your about');
  const records3 = await getRelevantWebsiteRecords(widgetId, 'show me your about');
  console.log('Relevant Text Snippets:\n', data3);
  console.log('Returned Cards Count (Should be 0):', records3.length);
  if (records3.length === 0 && data3.toLowerCase().includes('about')) {
    console.log('✅ TEST 3 PASSED: About information retrieved without polluting catalog cards!');
  } else {
    console.error('❌ TEST 3 FAILED!');
  }

  console.log('\n====================================================');
  console.log('🧪 TEST 4: Policy Query ("what is your policy?")');
  console.log('====================================================');
  const data4 = await getRelevantWebsiteData(widgetId, 'what is your policy?');
  const records4 = await getRelevantWebsiteRecords(widgetId, 'what is your policy?');
  console.log('Relevant Text Snippets:\n', data4);
  console.log('Returned Cards Count (Should be 0):', records4.length);
  if (records4.length === 0 && data4.toLowerCase().includes('policy')) {
    console.log('✅ TEST 4 PASSED: Policy text retrieved without polluting catalog cards!');
  } else {
    console.error('❌ TEST 4 FAILED!');
  }

  console.log('\n====================================================');
  console.log('🧪 TEST 5: General Catalog Query ("which courses do you have")');
  console.log('====================================================');
  const records5 = await getRelevantWebsiteRecords(widgetId, 'which courses do you have');
  console.log('Returned Cards Count:', records5.length);
  records5.forEach((r, i) => console.log(`Card ${i + 1}: ${r.title} - ${r.price} - ${r.sourceUrl}`));
  if (records5.length >= 2) {
    console.log('✅ TEST 5 PASSED: General catalog returned all available courses with direct links!');
  } else {
    console.error('❌ TEST 5 FAILED!');
  }
}

runTests().catch(console.error);
