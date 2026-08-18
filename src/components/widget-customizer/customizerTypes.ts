import { VoiceWidgetConfig } from '@/config/voiceWidget/types';

export type CustomizerSection =
  | 'branding'
  | 'colors'
  | 'typography'
  | 'launcher'
  | 'panel'
  | 'behavior'
  | 'responsive'
  | 'crawler'
  | 'deploy';

export interface CustomizerState {
  activeSection: CustomizerSection;
  draft: VoiceWidgetConfig;
  openColorTokenId: string | null;
}

export interface SectionNavItem {
  id: CustomizerSection;
  label: string;
}

export const SECTION_NAV: SectionNavItem[] = [
  { id: 'branding',    label: 'Branding' },
  { id: 'colors',      label: 'Colors' },
  { id: 'typography',  label: 'Typography' },
  { id: 'launcher',    label: 'Launcher' },
  { id: 'panel',       label: 'Panel' },
  { id: 'behavior',    label: 'Behavior' },
  { id: 'responsive',  label: 'Responsive' },
  { id: 'crawler',     label: 'Crawler' },
  { id: 'deploy',      label: 'Deploy' },
];
