import { VoiceWidgetConfig } from '@/config/voiceWidget/types';

export type CustomizerSection =
  | 'branding'
  | 'colors'
  | 'typography'
  | 'launcher'
  | 'panel'
  | 'behavior'
  | 'responsive'
  | 'deploy';

export interface CustomizerState {
  activeSection: CustomizerSection;
  draft: VoiceWidgetConfig;
  openColorTokenId: string | null;
}

export interface SectionNavItem {
  id: CustomizerSection;
  label: string;
  icon: string;
}

export const SECTION_NAV: SectionNavItem[] = [
  { id: 'branding',    label: 'Branding',    icon: '✦' },
  { id: 'colors',      label: 'Colors',      icon: '◐' },
  { id: 'typography',  label: 'Typography',  icon: 'T' },
  { id: 'launcher',    label: 'Launcher',    icon: '◎' },
  { id: 'panel',       label: 'Panel',       icon: '▭' },
  { id: 'behavior',    label: 'Behavior',    icon: '⚙' },
  { id: 'responsive',  label: 'Responsive',  icon: '⊡' },
  { id: 'deploy',      label: 'Deploy',      icon: '⚡' },
];
