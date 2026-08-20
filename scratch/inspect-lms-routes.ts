async function inspectLmsApi() {
  const url = 'https://lms-e-learning-system.vercel.app';
  console.log('Fetching LMS homepage...');
  const res = await fetch(url);
  const html = await res.text();
  
  // Find script chunks
  const scriptRegex = /src="([^"]+\/_next\/static\/chunks\/[^"]+)"/g;
  let match;
  const chunkUrls: string[] = [];
  while ((match = scriptRegex.exec(html)) !== null) {
    chunkUrls.push(match[1].startsWith('http') ? match[1] : `${url}${match[1]}`);
  }

  console.log(`Found ${chunkUrls.length} script chunks. Searching for course detail routes & API endpoints...`);
  
  for (const chunkUrl of chunkUrls) {
    try {
      const cRes = await fetch(chunkUrl);
      const cText = await cRes.text();
      
      // Look for course-access or course-detail links
      const linkMatches = cText.match(/\/(?:courses?|course-access|course-detail)\/[a-zA-Z0-9_-]+/g);
      if (linkMatches) {
        console.log(`[${chunkUrl.split('/').pop()}] Link matches:`, Array.from(new Set(linkMatches)).slice(0, 5));
      }

      // Look for API endpoints
      const apiMatches = cText.match(/https?:\/\/[a-zA-Z0-9.-]+\.onrender\.com\/[^\s"',]+/g);
      if (apiMatches) {
        console.log(`[${chunkUrl.split('/').pop()}] API endpoints:`, Array.from(new Set(apiMatches)).slice(0, 5));
      }
    } catch (e: any) {
      console.log('Error fetching chunk:', e.message);
    }
  }
}

inspectLmsApi().catch(console.error);
