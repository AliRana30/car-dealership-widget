import { searchEntities, getEntityDetails, executeAgentTool } from '../src/lib/agents/tools';
import { getWidget } from '../src/config/widgetsDb';

async function testSearchKnowledge() {
  const widget = await getWidget('lms');
  const widgetId = widget?.id || 'lms';
  console.log('Testing search for widgetId:', widgetId);

  // 1. Search LeetCode Mastery
  console.log('\n--- 1. Search "LeetCode Mastery" ---');
  const leetResults = await searchEntities(widgetId, 'LeetCode Mastery', 3);
  console.log('Results count:', leetResults.length);
  for (const r of leetResults) {
    console.log(`- [${r.dataType}] "${r.title}" (Price: ${r.metadata?.price || 'N/A'}) - ${r.shortDescription?.substring(0, 100)}`);
  }

  // 2. Search MERN Stack
  console.log('\n--- 2. Search "MERN Stack Development Course" ---');
  const mernResults = await searchEntities(widgetId, 'MERN Stack Development Course', 3);
  console.log('Results count:', mernResults.length);
  for (const r of mernResults) {
    console.log(`- [${r.dataType}] "${r.title}" (Price: ${r.metadata?.price || 'N/A'}) - ${r.shortDescription?.substring(0, 100)}`);
  }

  // 3. Execute tool call via executeAgentTool
  console.log('\n--- 3. executeAgentTool search_entities ---');
  const toolResult = await executeAgentTool(widgetId, 'search_entities', { query: 'What courses do you offer for coding interviews?' });
  console.log('Tool response:', JSON.stringify(toolResult, null, 2));
}

testSearchKnowledge().catch(console.error);
