import * as fs from 'fs';

const contentPath = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\fb4d7503-4e80-4923-82bc-08fd0d172e3e\\.system_generated\\steps\\411\\content.md';
const fullRaw = fs.readFileSync(contentPath, 'utf8');

// Search for fuel economy patterns
const terms = ['L/100', '100Km', '100km', 'Highway', 'specsFuel', 'fuelEconomy', 'divSpecificationsBlock'];
for (const term of terms) {
  const idx = fullRaw.indexOf(term);
  console.log(`Term "${term}": found at index ${idx}`);
  if (idx !== -1) {
    console.log(`Snippet around "${term}":\n`, fullRaw.substring(Math.max(0, idx - 150), idx + 250));
    console.log('--------------------------------------------------');
  }
}

// Print the JSON block around index 735000
console.log('\n=== Full Embedded Data Object around 735000 ===');
const start = fullRaw.lastIndexOf('<script', 735000);
const end = fullRaw.indexOf('</script>', 735000);
console.log(fullRaw.substring(start, end + 9));
