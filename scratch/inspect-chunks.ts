async function inspectNextChunks() {
  const url = 'https://lms-e-learning-system.vercel.app/courses';
  const res = await fetch(url);
  const html = await res.text();

  // Extract all chunk URLs
  const chunkMatches = html.match(/\/(_next\/static\/chunks\/[^"'\s>]+)/g) || [];
  const uniqueChunks = [...new Set(chunkMatches)];
  console.log('Unique chunk URLs found:', uniqueChunks);

  for (const chunk of uniqueChunks) {
    const chunkRes = await fetch(`https://lms-e-learning-system.vercel.app${chunk}`);
    const code = await chunkRes.text();
    if (code.toLowerCase().includes('leetcode') || code.toLowerCase().includes('mern')) {
      console.log(`\n>>> FOUND COURSE CONTENT IN CHUNK: ${chunk} (Length: ${code.length})`);
      // Find where leetcode appears
      const idx = code.toLowerCase().indexOf('leetcode');
      console.log('Context:', code.substring(Math.max(0, idx - 100), Math.min(code.length, idx + 400)));
    }
  }

  // Also check if there's an API route on the site, e.g. /api/courses
  const apiUrls = ['/api/courses', '/api/course', '/courses.json', '/data/courses.json'];
  for (const api of apiUrls) {
    try {
      const apiRes = await fetch(`https://lms-e-learning-system.vercel.app${api}`);
      console.log(`API check ${api} status:`, apiRes.status);
      if (apiRes.ok) {
        const text = await apiRes.text();
        console.log(`API ${api} response snippet:`, text.substring(0, 300));
      }
    } catch {}
  }
}

inspectNextChunks().catch(console.error);
