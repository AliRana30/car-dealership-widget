import * as fs from 'fs';
import * as path from 'path';

// Manually load .env into process.env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

import { toConfigurationRecord, fromConfigurationRecord, defaultVoiceWidgetConfig, deepMerge } from '../src/config/voiceWidget/default';
import { getWidgetConfiguration, saveWidgetConfiguration } from '../src/config/widgetsDb';

async function testCustomizerSync() {
  console.log('--- 1. Testing toConfigurationRecord and fromConfigurationRecord ---');
  const customConfig = deepMerge(defaultVoiceWidgetConfig, {
    branding: {
      ...defaultVoiceWidgetConfig.branding,
      assistantName: 'Elite Receptionist AI',
      companyName: 'LMS Academy Corp',
      title: 'Talk to Elite AI',
      welcomeMessage: 'Welcome to LMS Academy! How may I assist your learning journey today?',
      placeholderText: 'Ask our Elite AI anything...',
      agentMessageName: 'AI Front Desk',
      userMessageName: 'Student',
    },
    typography: {
      ...defaultVoiceWidgetConfig.typography,
      fontFamily: "'Outfit', sans-serif",
      headingWeight: 700,
      bodyWeight: 400,
      fontSizeScale: 'lg' as const,
    },
    launcher: {
      ...defaultVoiceWidgetConfig.launcher,
      icon: 'sparkles' as const,
      shape: 'rounded' as const,
      variant: 'icon-label' as const,
      label: {
        show: true,
        text: 'Ask AI Agent',
        position: 'left' as const,
      },
    },
    panel: {
      ...defaultVoiceWidgetConfig.panel,
      width: 380,
      maxHeight: 520,
    },
    avatar: {
      enabled: true,
      src: 'https://example.com/receptionist.jpg',
      fallbackText: 'ER',
      shape: 'circle' as const,
      size: 48,
    },
  });

  const record = toConfigurationRecord(customConfig);
  console.log('toConfigurationRecord branding:', record.branding);
  console.log('toConfigurationRecord typography:', record.typography);
  console.log('toConfigurationRecord launcher:', record.launcher);

  const restored = fromConfigurationRecord(record);
  console.log('restored assistantName:', restored.branding.assistantName);
  console.log('restored fontFamily:', restored.typography.fontFamily);
  console.log('restored launcher icon:', restored.launcher.icon);
  console.log('restored avatar src:', restored.avatar?.src);

  if (restored.branding.assistantName !== 'Elite Receptionist AI') {
    throw new Error('Branding assistantName was not preserved!');
  }
  if (restored.typography.fontFamily !== "'Outfit', sans-serif") {
    throw new Error('Typography fontFamily was not preserved!');
  }
  if (restored.launcher.icon !== 'sparkles') {
    throw new Error('Launcher icon was not preserved!');
  }

  console.log('\n--- 2. Testing Database saveWidgetConfiguration and getWidgetConfiguration ---');
  const saved = await saveWidgetConfiguration('front-desk', record);
  console.log('Saved to DB:', !!saved);

  const fetched = await getWidgetConfiguration('front-desk');
  console.log('Fetched from DB branding:', fetched?.branding);
  console.log('Fetched from DB typography:', fetched?.typography);

  if (fetched?.branding?.assistantName !== 'Elite Receptionist AI') {
    throw new Error('DB did not return updated assistantName!');
  }
  if (fetched?.typography?.fontFamily !== "'Outfit', sans-serif") {
    throw new Error('DB did not return updated fontFamily!');
  }

  console.log('\n✓ ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testCustomizerSync().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
