// ============================================================
// VoiceWidget — Client Configuration Registry
// ============================================================
// Maps unique client identifiers to their branded configuration
// overrides.
// ============================================================

import { ClientVoiceWidgetConfig } from './types';
import myFrontDesk from './clients/myFrontDesk';
import clinicA from './clients/clinicA';
import darkSaaS from './clients/darkSaaS';

export const clientRegistry: Record<string, ClientVoiceWidgetConfig> = {
  'default': {}, // Uses default configuration
  'myfrontdesk': myFrontDesk,
  'clinic-a': clinicA,
  'dark-saas': darkSaaS,
};
