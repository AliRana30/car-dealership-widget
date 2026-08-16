// ============================================================
// VoiceWidget — Client Configuration Registry
// ============================================================
// Maps unique client identifiers to their branded configuration
// overrides. Now driven dynamically by Supabase.
// ============================================================

import { ClientVoiceWidgetConfig } from './types';

export const clientRegistry: Record<string, ClientVoiceWidgetConfig> = {
  'default': {}, // Uses default configuration
};

