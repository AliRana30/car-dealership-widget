import { getWidget, getWidgetConfiguration } from '../src/config/widgetsDb';

async function testConfigurations() {
  const ids = ['lms', '635352a8-6d13-4b47-804f-8717b2a1539c', 'cfbfa598-6c36-4447-9b27-173dbefa8e55', 'front-desk', 'widget', 'default', 'myfrontdesk'];
  for (const id of ids) {
    const w = await getWidget(id);
    const cfg = await getWidgetConfiguration(id);
    console.log(`ID: "${id}" -> Widget found: ${!!w}, Config found: ${!!cfg}`);
  }
}

testConfigurations();
