// ============================================================
// Color Token Definitions for the Widget Customizer
// Maps UI token labels → VoiceWidgetThemeConfig field paths
// ============================================================

export interface ColorToken {
  id: string;           // unique ID for this token
  label: string;        // display name
  field: string;        // dot-path in VoiceWidgetThemeConfig
  group: string;        // group heading
  description?: string;
}

export const COLOR_TOKEN_GROUPS: { group: string; tokens: ColorToken[] }[] = [
  {
    group: 'Brand',
    tokens: [
      { id: 'primaryColor', label: 'Primary', field: 'primaryColor', group: 'Brand', description: 'Main accent and CTA color' },
      { id: 'primaryHoverColor', label: 'Primary Hover', field: 'primaryHoverColor', group: 'Brand', description: 'On hover state' },
      { id: 'primaryActiveColor', label: 'Primary Active', field: 'primaryActiveColor', group: 'Brand', description: 'On press/active state' },
    ],
  },
  {
    group: 'Panel',
    tokens: [
      { id: 'panelBackground', label: 'Panel Background', field: 'panelBackground', group: 'Panel' },
      { id: 'headerBackground', label: 'Header Background', field: 'headerBackground', group: 'Panel' },
      { id: 'transcriptBackground', label: 'Transcript Area', field: 'transcriptBackground', group: 'Panel' },
    ],
  },
  {
    group: 'Text',
    tokens: [
      { id: 'primaryTextColor', label: 'Primary Text', field: 'primaryTextColor', group: 'Text' },
      { id: 'secondaryTextColor', label: 'Secondary Text', field: 'secondaryTextColor', group: 'Text' },
      { id: 'mutedTextColor', label: 'Muted Text', field: 'mutedTextColor', group: 'Text' },
    ],
  },
  {
    group: 'Border',
    tokens: [
      { id: 'borderColor', label: 'Border', field: 'borderColor', group: 'Border' },
      { id: 'inputBorderColor', label: 'Input Border', field: 'inputBorderColor', group: 'Border' },
    ],
  },
  {
    group: 'Launcher',
    tokens: [
      { id: 'launcherBackground', label: 'Background', field: 'launcherBackground', group: 'Launcher' },
    ],
  },
  {
    group: 'Conversation',
    tokens: [
      { id: 'userMessageBackground', label: 'User Message', field: 'userMessageBackground', group: 'Conversation' },
      { id: 'agentMessageBackground', label: 'Agent Message', field: 'agentMessageBackground', group: 'Conversation' },
    ],
  },
  {
    group: 'Status',
    tokens: [
      { id: 'successColor', label: 'Success', field: 'successColor', group: 'Status' },
      { id: 'errorColor', label: 'Error', field: 'errorColor', group: 'Status' },
      { id: 'warningColor', label: 'Warning', field: 'warningColor', group: 'Status' },
      { id: 'connectingColor', label: 'Connecting', field: 'connectingColor', group: 'Status' },
    ],
  },
  {
    group: 'Audio',
    tokens: [
      { id: 'waveformColor', label: 'Waveform', field: 'waveformColor', group: 'Audio' },
      { id: 'speakingIndicatorColor', label: 'Speaking Indicator', field: 'speakingIndicatorColor', group: 'Audio' },
    ],
  },
];

export const ALL_COLOR_TOKENS: ColorToken[] = COLOR_TOKEN_GROUPS.flatMap(g => g.tokens);
