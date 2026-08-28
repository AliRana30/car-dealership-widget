import * as fs from 'fs';

const contentPath = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\fb4d7503-4e80-4923-82bc-08fd0d172e3e\\.system_generated\\steps\\411\\content.md';
const fullRaw = fs.readFileSync(contentPath, 'utf8');

console.log('Total file length:', fullRaw.length);

const terms = ['8,652', '8652', '12.4', 'Diamond Black', 'SPECIFICATIONS', 'Kilometers', 'Exterior Colour'];
for (const term of terms) {
  const idx = fullRaw.indexOf(term);
  console.log(`Term "${term}": found at index ${idx}`);
  if (idx !== -1) {
    console.log(`Snippet around "${term}":\n`, fullRaw.substring(Math.max(0, idx - 100), idx + 200));
  }
}
