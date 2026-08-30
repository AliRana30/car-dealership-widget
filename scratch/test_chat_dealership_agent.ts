/**
 * Test realistic chat agent user conversations against the live database
 * with real crawled inventory and unifiedTools / hybridRetrieve.
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  });
}

import { executeUnifiedTool } from '@/lib/agents/unifiedTools';
import { hybridRetrieve } from '@/lib/retrieval/hybridRag';
import { getDbClient } from '@/config/widgetsDb';

async function runConversations() {
  const { client: dbClient } = getDbClient();
  const { data: vehs } = await dbClient.from('vehicles').select('widget_id').limit(10);
  const widgetId = vehs?.[0]?.widget_id || 'e0330b35-27c1-4f27-95d0-93640bd05812';

  console.log(`\n======================================================`);
  console.log(` TESTING REALISTIC USER CONVERSATIONS (Widget: ${widgetId})`);
  console.log(`======================================================\n`);

  const queries = [
    {
      userQuery: "Show me SUVs in stock.",
      toolName: "filter_entities",
      toolArgs: { body_style: "SUV", category: "SUV" }
    },
    {
      userQuery: "Do you have any used Ram 1500s or trucks?",
      toolName: "search_knowledge",
      toolArgs: { query: "used Ram 1500", condition: "used" }
    },
    {
      userQuery: "Show me vehicles under $50,000.",
      toolName: "filter_entities",
      toolArgs: { max_price: 50000, sort_by: "price_asc" }
    },
    {
      userQuery: "Do you have a Jeep Grand Cherokee?",
      toolName: "search_knowledge",
      toolArgs: { query: "Jeep Grand Cherokee" }
    },
    {
      userQuery: "Show me cars under $30k with low mileage.",
      toolName: "filter_entities",
      toolArgs: { max_price: 30000, sort_by: "price_asc" }
    },
    {
      userQuery: "What is the fuel efficiency of the Hyundai Elantra?",
      toolName: "search_knowledge",
      toolArgs: { query: "Hyundai Elantra fuel efficiency" }
    }
  ];

  let turn = 1;
  for (const q of queries) {
    console.log(`💬 Turn ${turn++}: "${q.userQuery}"`);
    console.log(`⚙️ Tool Calling: ${q.toolName}(${JSON.stringify(q.toolArgs)})`);

    const result = await executeUnifiedTool(
      widgetId,
      q.toolName,
      q.toolArgs,
      { sessionId: "test-dealership-chat-session" }
    );

    console.log(`  Status: ${result.success ? 'SUCCESS' : 'FAILED'} | Count: ${result.count} | Grounded: ${result.grounded}`);

    if (result.results && result.results.length > 0) {
      result.results.slice(0, 3).forEach((r, idx) => {
        const title = r.title || `${r.year || ''} ${r.make || ''} ${r.model || ''}`;
        const priceStr = r.price ? `$${r.price}` : 'Price unlisted';
        const cond = r.condition ? `[${r.condition.toUpperCase()}]` : '';
        const mileageStr = r.mileage ? `${r.mileage} km` : '';
        console.log(`    [${idx + 1}] ${cond} ${title} - ${priceStr} ${mileageStr}`);
      });
    } else {
      console.log(`    (No vehicles matched query parameters)`);
    }

    // Direct Hybrid RAG query test
    const ragResult = await hybridRetrieve(widgetId, q.userQuery, { limit: 3 });
    console.log(`  Hybrid RAG Intent: ${ragResult.intent} | Retrieved candidates: ${ragResult.count}`);
    if (ragResult.results.length > 0) {
      console.log(`  Top Match: "${ragResult.results[0].title}" (score: ${ragResult.results[0].score})`);
    }
    console.log(`------------------------------------------------------\n`);
  }
}

runConversations()
  .then(() => {
    console.log('✅ All realistic chat conversations executed successfully with zero errors.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Conversation test error:', err);
    process.exit(1);
  });
