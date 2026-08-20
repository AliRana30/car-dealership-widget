import { safeFetch, extractPageEntities } from '../src/lib/crawler/extractor';

async function testPages() {
  const pages = [
    'https://lms-e-learning-system.vercel.app/',
    'https://lms-e-learning-system.vercel.app/about',
    'https://lms-e-learning-system.vercel.app/faq',
    'https://lms-e-learning-system.vercel.app/policy',
  ];

  for (const url of pages) {
    const data = await safeFetch(url);
    if (!data) {
      console.log('Failed:', url);
      continue;
    }
    const entities = await extractPageEntities(data.html, url);
    console.log(`\n========================================`);
    console.log(`PAGE: ${url}`);
    console.log(`Entities count: ${entities.length}`);
    entities.forEach(e => {
      console.log(`Title: ${e.title}`);
      console.log(`Content:\n${e.content}\n`);
    });
  }
}

testPages();
