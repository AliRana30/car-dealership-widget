async function testChatApi() {
  const widgetId = 'cfbfa598-6c36-4447-9b27-173dbefa8e55';
  const queries = [
    'can you tell me which courses do you have/',
    'can you show me the mern sstack course?',
    'show me your about',
    'what is your policy?',
    'show me courses under $100',
  ];

  for (const q of queries) {
    console.log(`\n========================================`);
    console.log(`User Question: "${q}"`);
    console.log(`========================================`);

    const res = await fetch('http://localhost:3000/api/retell/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId,
        content: q,
        chatId: `test_${Date.now()}`,
      }),
    });

    const data = await res.json();
    console.log('Agent Response Text:\n', data.messages?.[1]?.content || data.messages?.[0]?.content);
    console.log('Attached Results Cards Count:', data.messages?.[1]?.results?.length || 0);
    console.log('Navigation URL:', data.navigationUrl || 'None');
    console.log('Action:', JSON.stringify(data.action));
  }
}

testChatApi().catch(console.error);
