import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

async function main() {
  const { supabase, getWidget, getWidgetConfiguration } = await import('../src/config/widgetsDb');

  console.log('--- Inspecting Widgets ---');
  const { data: widgets, error: wErr } = await supabase.from('widgets').select('id, widget_id, name, config');
  if (wErr) {
    console.error('widgets error:', wErr);
  } else {
    console.log(`Found ${widgets?.length} widgets:`);
    for (const w of widgets || []) {
      console.log(`- ID: ${w.id}, Slug: ${w.widget_id}, Name: ${w.name}`);
      console.log(`  Avatar in config:`, JSON.stringify(w.config?.avatar));
      console.log(`  AssistantName in config:`, w.config?.branding?.assistantName);
      console.log(`  PrimaryColor in config:`, w.config?.theme?.primaryColor);
    }
  }

  console.log('\n--- Inspecting Widget Configurations Table ---');
  const { data: configs, error: cErr } = await supabase.from('widget_configurations').select('*');
  if (cErr) {
    console.error('widget_configurations error:', cErr);
  } else {
    console.log(`Found ${configs?.length} widget_configurations rows:`);
    for (const c of configs || []) {
      console.log(`- Widget ID: ${c.widget_id}`);
      console.log(`  Branding Avatar:`, JSON.stringify(c.branding?.avatar));
      console.log(`  AssistantName:`, c.branding?.assistantName);
      console.log(`  Theme PrimaryColor:`, c.theme?.primaryColor);
    }
  }
}

main().catch(console.error);
