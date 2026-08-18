const fs = require('fs');
const path = require('path');

const contentPath = 'C:\\Users\\PC\\.gemini\\antigravity\\brain\\2017b31f-8a5f-4f2f-ae65-f60d54b6e6b8\\.system_generated\\steps\\1549\\content.md';
if (!fs.existsSync(contentPath)) {
  console.log('File does not exist');
  process.exit(1);
}

const content = fs.readFileSync(contentPath, 'utf8');
const lines = content.split('\n');
const line6 = lines[5]; // 0-indexed

// Replace escaped newlines or just show it
console.log('Line 6 Length:', line6.length);
fs.writeFileSync('line6.py', line6);
console.log('Line 6 written to line6.py');
