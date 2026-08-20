async function inspectCoursesPage() {
  const url = 'https://lms-e-learning-system.vercel.app/courses';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();
  console.log(`Courses HTML Length: ${html.length}`);
  
  // Find all script tags
  const scripts = Array.from(html.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)).map(m => m[1]);
  console.log(`Total script tags: ${scripts.length}`);
  
  scripts.forEach((s, idx) => {
    if (s.includes('self.__next_f') || s.includes('__NEXT_DATA__') || s.includes('courses') || s.includes('course') || s.includes('price')) {
      console.log(`\n--- Script ${idx + 1} (length: ${s.length}) ---`);
      console.log(s.slice(0, 500));
    }
  });

  // Also check if there is an API route like /api/courses or /api/products
  const apiCheck = await fetch('https://lms-e-learning-system.vercel.app/api/courses').catch(() => null);
  if (apiCheck && apiCheck.ok) {
    const apiData = await apiCheck.json().catch(() => null);
    console.log('\n--- API /api/courses exists! ---');
    console.log(JSON.stringify(apiData).slice(0, 500));
  } else {
    console.log(`\nAPI /api/courses status: ${apiCheck?.status}`);
  }
}

inspectCoursesPage();
