// ============================================================
// VoiceWidget — Client Configuration: MyFrontDesk (Default)
// ============================================================
// This is the configuration used for the main MyFrontDesk
// landing page. It inherits from the system default.
// ============================================================
// SECURITY: Never include API keys or server secrets here.
// ============================================================

import { ClientVoiceWidgetConfig } from '../types';

const myFrontDeskConfig: ClientVoiceWidgetConfig = {
  provider: {
    provider: 'retell',
    agentId: 'agent_3150b4da2eaf98174c827f061d',
  },
  branding: {
    companyName: 'MyFrontDesk',
    assistantName: 'AI Front Desk Agent',
    title: 'Talk to our AI Agent',
    subtitle: 'Experience the virtual front desk receptionist live in your browser.',
    welcomeMessage: "Hi! I'm your AI front desk receptionist. How can I help you today?",
    startLabel: 'Start Conversation',
    ariaLabel: 'Open AI front desk assistant',
  } as any,

  theme: {
    primaryColor: '#2F8FE0',
    primaryHoverColor: '#1d7ccf',
    launcherBackground: '#2F8FE0',
    radius: 'lg',
    shadow: 'xl',
    density: 'comfortable',
  },

  launcher: {
    variant: 'icon',
    icon: 'phone',
    position: 'bottom-right',
    size: 'medium',
    shape: 'circle',
    pulseAnimation: true,
    tooltip: 'Talk to Agent',
    zIndex: 1000,
  },

  behavior: {
    allowTextChat: true,
    allowVoiceChat: true,
    showTranscript: true,
    showMuteButton: true,
    showEndButton: true,
    showWaveform: true,
  },

  animation: {
    panel: 'slide-up',
    launcher: 'pulse',
    duration: 250,
  },
};

export default myFrontDeskConfig;
