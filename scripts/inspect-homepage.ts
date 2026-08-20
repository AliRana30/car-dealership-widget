async function inspectHomepage() {
  const url = 'https://lms-e-learning-system.vercel.app';
  const res = await fetch(url);
  const html = await res.text();
  
  // Extract all text chunks, headings, and course cards
  console.log('--- HOMEPAGE RAW HTML LENGTH ---', html.length);
  
  // Extract headings (h1, h2, h3)
  const headings = Array.from(html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)).map(m => m[1].replace(/<[^>]+>/g, '').trim());
  console.log('Headings:', headings);

  // Extract paragraphs (p)
  const paragraphs = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)).map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(p => p.length > 10);
  console.log('Paragraphs:', paragraphs);

  // Extract script text for Next.js flight payload
  const scripts = Array.from(html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/gi)).map(m => m[1]);
  console.log(`Next.js flight scripts count: ${scripts.length}`);
  scripts.forEach((s, idx) => {
    if (s.includes('Course') || s.includes('Master') || s.includes('Full') || s.includes('Python') || s.includes('React') || s.includes('$')) {
      console.log(`\n--- Flight script with content ${idx} ---`);
      console.log(s.slice(0, 1000));
    }
  });
}

inspectHomepage();
