import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  });
}

import { generateOtp, verifyOtp } from '@/lib/users';

async function testOtp() {
  const testEmail = 'test-verification-flow@example.com';
  console.log('Generating OTP for:', testEmail);
  const code = await generateOtp(testEmail);
  console.log('Generated OTP:', code);

  const isValid = await verifyOtp(testEmail, code);
  console.log('Verification result (valid code):', isValid);

  const isReusedValid = await verifyOtp(testEmail, code);
  console.log('Verification result (reused code):', isReusedValid);

  if (isValid && !isReusedValid) {
    console.log('✅ OTP generation & one-time verification PASSED!');
  } else {
    console.error('❌ OTP test FAILED!');
    process.exit(1);
  }
}

testOtp().catch(console.error);
