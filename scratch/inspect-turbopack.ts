async function inspectTurbopackChunk() {
  const chunkUrl = 'https://lms-e-learning-system.vercel.app/_next/static/chunks/690b407ef3fc9c45.js';
  const res = await fetch(chunkUrl);
  const text = await res.text();
  console.log('Chunk length:', text.length);

  // Let's find all occurrences of strings containing LeetCode, MERN, Python, UI/UX, etc.
  const regex = /\{[^{}]*?(?:title|name|description|price)[^{}]*?\}/gi;
  let match;
  let count = 0;
  while ((match = regex.exec(text)) !== null && count < 20) {
    console.log('Matched object:', match[0]);
    count++;
  }

  // Also let's search for the raw array or object literals inside the chunk
  const leetIdx = text.toLowerCase().indexOf('leetcode');
  if (leetIdx !== -1) {
    console.log('\n--- Context around LeetCode ---');
    console.log(text.substring(Math.max(0, leetIdx - 200), Math.min(text.length, leetIdx + 600)));
  }
}

inspectTurbopackChunk().catch(console.error);
