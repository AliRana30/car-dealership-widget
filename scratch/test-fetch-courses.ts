async function testFetchCourses() {
  const url = 'https://lms-e-learning-system.vercel.app/courses';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  });
  const html = await res.text();
  console.log('Status:', res.status);
  console.log('HTML Length:', html.length);
  console.log('HTML Head/Body:', html.substring(0, 1500));
  
  // Look for LeetCode or MERN or course names in HTML or inline script / Next.js data
  const hasLeetcode = html.toLowerCase().includes('leetcode');
  const hasMern = html.toLowerCase().includes('mern');
  console.log('Contains LeetCode in initial HTML?', hasLeetcode);
  console.log('Contains MERN in initial HTML?', hasMern);

  // Check if there is __NEXT_DATA__ or bundled JSON scripts or client data
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    console.log('Found __NEXT_DATA__! Length:', nextDataMatch[1].length);
    console.log('__NEXT_DATA__ preview:', nextDataMatch[1].substring(0, 500));
    console.log('__NEXT_DATA__ has leetcode?', nextDataMatch[1].toLowerCase().includes('leetcode'));
  }

  // Also check for any inline JSON scripts (type="application/json" or self.__next_f)
  const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  console.log('Total script tags:', scriptMatches?.length);
  if (scriptMatches) {
    for (const s of scriptMatches) {
      if (s.toLowerCase().includes('leetcode') || s.toLowerCase().includes('mern')) {
        console.log('Found script containing course data! Snippet:', s.substring(0, 300));
      }
    }
  }
}

testFetchCourses().catch(console.error);
