async function inspectCoursesRSC() {
  const res = await fetch('https://lms-e-learning-system.vercel.app/courses');
  const html = await res.text();
  
  // Find all strings in self.__next_f
  const matches = Array.from(html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/gi));
  console.log(`Found ${matches.length} RSC chunks.`);
  matches.forEach((m, idx) => {
    try {
      const unescaped = JSON.parse(`"${m[1]}"`);
      console.log(`\n--- Chunk ${idx + 1} (${unescaped.length} chars) ---`);
      // Find strings longer than 15 chars without special symbols
      const words = unescaped.split(/[\\n"\\$:]+/).filter((w: string) => w.length > 20 && !w.startsWith('/') && !w.startsWith('_'));
      console.log('Interesting text chunks:', words.slice(0, 10));
    } catch {
      console.log(`Chunk ${idx + 1} raw:`, m[1].slice(0, 200));
    }
  });
}

inspectCoursesRSC();
