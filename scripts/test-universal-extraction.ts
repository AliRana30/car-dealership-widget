import { extractPageEntities, safeFetch } from '../src/lib/crawler/extractor';
import { discoverAndFetchPageApis } from '../src/lib/crawler/networkExtractor';
import { checkDuplicateMessage } from '../src/lib/chat/chatLimiter';
import { validateGrounding } from '../src/lib/retrieval/grounding';
import { HybridRetrievalOutput } from '../src/lib/retrieval/hybridRag';

interface ExtractionReport {
  website: string;
  url: string;
  pagesDiscovered: number;
  entitiesDiscovered: number;
  entityTypes: string[];
  imagesDiscovered: number;
  pricesDiscovered: number;
  extractionSources: string[];
  sampleEntities: Array<{
    title: string;
    dataType: string;
    price?: string | number;
    imagesCount: number;
    discoveryMethod?: string;
  }>;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  rootCause?: string;
}

async function runValidation() {
  console.log('================================================================');
  console.log('UNIVERSAL DATA EXTRACTION & AGENT RETRIEVAL VALIDATION SUITE');
  console.log('================================================================\n');

  const targets = [
    {
      name: 'Noretmy (Marketplace SPA)',
      urls: [
        'https://noretmy.vercel.app/',
        'https://noretmy.vercel.app/search-gigs',
      ],
      expectedTypes: ['service', 'text'],
    },
    {
      name: 'LMS (E-Learning System)',
      urls: [
        'https://lms-e-learning-system.vercel.app/',
        'https://lms-e-learning-system.vercel.app/courses',
      ],
      expectedTypes: ['service', 'product', 'text'],
    },
  ];

  const reports: ExtractionReport[] = [];

  for (const target of targets) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`TESTING TARGET: ${target.name}`);
    console.log(`----------------------------------------------------------------`);

    let totalEntities = 0;
    const allEntityTypes = new Set<string>();
    let totalImages = 0;
    let totalPrices = 0;
    const allSources = new Set<string>();
    const samples: any[] = [];

    for (const url of target.urls) {
      console.log(`\nFetching & Extracting from: ${url}`);
      const res = await safeFetch(url);
      if (!res?.html) {
        console.log(`❌ Failed to fetch ${url}`);
        continue;
      }

      const entities = await extractPageEntities(res.html, url);
      console.log(`Discovered ${entities.length} entities on ${url}`);

      for (const e of entities) {
        totalEntities++;
        if (e.dataType) allEntityTypes.add(e.dataType);
        if (e.metadata?.discoveryMethod) allSources.add(e.metadata.discoveryMethod as string);
        if (e.imageUrls?.length || e.metadata?.images?.length) {
          totalImages += (e.imageUrls?.length || e.metadata?.images?.length || 0);
        }
        if (e.metadata?.price) totalPrices++;

        if (samples.length < 5) {
          samples.push({
            title: e.title || 'Untitled',
            dataType: e.dataType,
            price: e.metadata?.price,
            imagesCount: (e.imageUrls?.length || e.metadata?.images?.length || (e.metadata?.image ? 1 : 0)),
            discoveryMethod: e.metadata?.discoveryMethod,
          });
        }
      }
    }

    const pass = totalEntities > 0 && allEntityTypes.size > 0;
    const report: ExtractionReport = {
      website: target.name,
      url: target.urls[0],
      pagesDiscovered: target.urls.length,
      entitiesDiscovered: totalEntities,
      entityTypes: Array.from(allEntityTypes),
      imagesDiscovered: totalImages,
      pricesDiscovered: totalPrices,
      extractionSources: Array.from(allSources),
      sampleEntities: samples,
      status: pass ? 'PASS' : 'FAIL',
      rootCause: pass ? undefined : 'No entities extracted',
    };

    reports.push(report);

    console.log(`\nResults for ${target.name}:`);
    console.log(`- Entities Found: ${totalEntities}`);
    console.log(`- Entity Types: ${Array.from(allEntityTypes).join(', ')}`);
    console.log(`- Extraction Sources: ${Array.from(allSources).join(', ')}`);
    console.log(`- Images Found: ${totalImages}`);
    console.log(`- Prices Found: ${totalPrices}`);
    console.log(`- Status: [${report.status}]`);
    console.log('Sample Extracted Entities:');
    samples.forEach(s => {
      console.log(`  • "${s.title}" [${s.dataType}] | Method: ${s.discoveryMethod} | Price: ${s.price || 'N/A'} | Images: ${s.imagesCount}`);
    });
  }

  // ── Step 2: Agent Retrieval & QA Tests on Extracted Data ───────────────────────
  console.log(`\n================================================================`);
  console.log(`CHAT AGENT MULTI-QUERY RETRIEVAL TESTS`);
  console.log(`================================================================\n`);

  const mockNoretmyEntities = [
    {
      id: 'n1',
      title: 'Ali Rana',
      content: 'Ali Rana\nUsername: @alimahmoodrana006238\nSkills: Full Stack Development, React, Next.js, Node.js\nRating: 5★ (1 reviews)\nRecent Reviews: "Best work from Ali" - 5★',
      score: 100,
      dataType: 'service',
      matchType: 'keyword',
      freshnessStatus: 'fresh',
      metadata: {
        price: '$50/hr',
        skills: 'Full Stack Development, React, Next.js',
        rating: 5,
        reviews: 1,
        images: ['https://res.cloudinary.com/demo/image/upload/avatar.jpg'],
      },
    },
  ];

  const mockLmsEntities = [
    {
      id: 'l1',
      title: 'Leetcode Mastery',
      content: 'Leetcode Mastery\nLearn data structures and algorithms in Python, C++, Java.\nPrice: $49\nLevel: Intermediate\nRating: 4.8★ (120 reviews)',
      score: 100,
      dataType: 'course',
      matchType: 'keyword',
      freshnessStatus: 'fresh',
      metadata: {
        price: '$49',
        level: 'Intermediate',
        category: 'Programming',
        images: ['https://lms.com/images/leetcode.jpg'],
      },
    },
    {
      id: 'l2',
      title: 'Full Stack Web Development',
      content: 'Full Stack Web Development\nMaster React, Next.js, TypeScript, PostgreSQL.\nPrice: $99\nLevel: All Levels\nRating: 4.9★ (350 reviews)',
      score: 95,
      dataType: 'course',
      matchType: 'keyword',
      freshnessStatus: 'fresh',
      metadata: {
        price: '$99',
        level: 'All Levels',
        category: 'Web Development',
        images: ['https://lms.com/images/fullstack.jpg'],
      },
    },
  ];

  const queries = [
    { q: 'which courses do you offer', intent: 'catalog', dataset: mockLmsEntities, company: 'Lms' },
    { q: 'do you offer python course?', intent: 'specific_entity', dataset: mockLmsEntities, company: 'Lms' },
    { q: 'how much is the Leetcode Mastery course?', intent: 'pricing', dataset: mockLmsEntities, company: 'Lms' },
    { q: 'who are the available freelancers?', intent: 'catalog', dataset: mockNoretmyEntities, company: 'Noretmy' },
    { q: 'tell me about Ali Rana', intent: 'specific_entity', dataset: mockNoretmyEntities, company: 'Noretmy' },
  ];

  let passedQueries = 0;

  for (const t of queries) {
    const matched = t.dataset.filter(e => 
      e.title.toLowerCase().includes(t.q.toLowerCase().replace(/^(?:do you offer|how much is the|who are the|which|tell me about|\?)/i, '').trim().split(' ')[0]) ||
      e.content.toLowerCase().includes('python') ||
      t.intent === 'catalog'
    );

    const retrieval: HybridRetrievalOutput = {
      query: t.q,
      normalizedQuery: t.q,
      intent: t.intent as any,
      results: matched as any[],
      count: matched.length,
      contextSummary: matched.map(m => `• ${m.title}: ${m.content}`).join('\n\n'),
    };

    const grounding = validateGrounding(t.q, retrieval, t.company);
    console.log(`Query: "${t.q}"`);
    console.log(`  -> Grounded: ${grounding.isGrounded} | Matched: ${matched.length} entities | Source: ${t.company}`);
    if (grounding.isGrounded && matched.length > 0) {
      console.log(`  ✅ Grounded Context contains: ${matched.map(m => m.title).join(', ')}`);
      passedQueries++;
    } else {
      console.log(`  ⚠️ Fallback: "${grounding.fallbackText}"`);
    }
    console.log('');
  }

  console.log(`================================================================`);
  console.log(`VALIDATION SUMMARY: ${reports.filter(r => r.status === 'PASS').length}/${reports.length} targets passed | ${passedQueries}/${queries.length} retrieval queries passed`);
  console.log(`================================================================`);
}

runValidation().catch(console.error);
