// ============================================================
// VoiceWidget — Type Definitions
// ============================================================
// Provider config (provider + agentId) is safe to store here.
// API keys are STRICTLY server-side — never in this type.
// ============================================================

export type WidgetMode = 'inline' | 'floating';

export type WidgetPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left';

export type LauncherIcon =
  | 'phone'
  | 'microphone'
  | 'headset'
  | 'message'
  | 'chat'
  | 'sparkles'
  | 'custom';

export type LauncherShape = 'circle' | 'rounded' | 'square' | 'pill';

export type LauncherShadow = 'none' | 'subtle' | 'medium' | 'strong';

/**
 * Controls the visual layout of the launcher button.
 * - 'icon'        — round/square button with icon only
 * - 'icon-label'  — icon + text label side-by-side
 * - 'pill'        — text-only pill (no explicit icon slot)
 */
export type LauncherVariant = 'icon' | 'icon-label' | 'pill';

export type AnimationType =
  | 'none'
  | 'fade'
  | 'scale'
  | 'slide'
  | 'slide-up'
  | 'slide-down'
  | 'zoom'
  | 'pulse';

export type RadiusVariant =
  | 'none'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | 'full'
  | string;

export type ShadowVariant =
  | 'none'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | string;

export type WidgetDensity = 'compact' | 'comfortable' | 'spacious';

export type AudioVisualizerType =
  | 'none'
  | 'pulse'
  | 'waveform'
  | 'bars'
  | 'orb';

export type AvatarShape = 'circle' | 'rounded' | 'square';

// -------------------------------------------------------
// Provider + Agent — which AI backend powers this widget.
// Agent IDs are public-safe. API keys stay server-side.
// -------------------------------------------------------
export type WidgetProvider = 'retell' | 'vapi';

export interface VoiceWidgetProviderConfig {
  /** Which voice AI provider to use */
  provider: WidgetProvider;
  /**
   * Retell: agent_id from the Retell dashboard.
   * Vapi: assistant_id from the Vapi dashboard.
   * This is a public identifier — NOT an API key.
   */
  agentId: string;
}

// -------------------------------------------------------
// Call lifecycle
// -------------------------------------------------------
export type CallState =
  | 'idle'
  | 'connecting'
  | 'permission_required'
  | 'connected'
  | 'agent_speaking'
  | 'user_listening'
  | 'muted'
  | 'ending'
  | 'ended'
  | 'error';

export interface TranscriptMessage {
  role: 'user' | 'agent';
  content: string;
  /** For streaming providers (e.g. Vapi), marks a transcript entry as partial/interim */
  isPartial?: boolean;
  /** Structured data results from the Website Intelligence system */
  results?: any[];
}

// -------------------------------------------------------
// Branding — labels, names, copy
// -------------------------------------------------------
export interface VoiceWidgetBrandingConfig {
  companyName: string;
  assistantName: string;
  title: string;
  subtitle: string;
  welcomeMessage: string;
  startLabel: string;
  connectingLabel: string;
  connectedLabel: string;
  endLabel: string;
  retryLabel: string;
  muteLabel: string;
  unmuteLabel: string;
  errorMessage: string;
  callEndedMessage: string;
  placeholderText: string;
  agentMessageName: string;
  userMessageName: string;
}

// -------------------------------------------------------
// Avatar — optional assistant identity image
// -------------------------------------------------------
export interface VoiceWidgetAvatarConfig {
  /** Show the avatar in the panel header and status screen */
  enabled: boolean;
  /**
   * URL or path to the avatar image.
   * Use public-facing URLs only — no secrets or signed URLs.
   */
  src?: string;
  /** Shown if src fails to load. Defaults to assistant initials. */
  fallbackText?: string;
  /** Pixel size of the avatar circle/shape. Default: 44 */
  size?: number;
  shape?: AvatarShape;
}

// -------------------------------------------------------
// Theme — colors, radii, shadows
// -------------------------------------------------------
export interface VoiceWidgetThemeConfig {
  primaryColor: string;
  primaryHoverColor: string;
  primaryActiveColor: string;

  // Backgrounds
  launcherBackground: string;
  panelBackground: string;
  headerBackground: string;
  transcriptBackground: string;
  userMessageBackground: string;
  agentMessageBackground: string;

  // Text
  primaryTextColor: string;
  secondaryTextColor: string;
  mutedTextColor: string;

  // Borders
  borderColor: string;
  inputBorderColor: string;

  // Status
  successColor: string;
  errorColor: string;
  warningColor: string;
  connectingColor: string;

  // Audio
  waveformColor: string;
  speakingIndicatorColor: string;

  // Shape
  radius: RadiusVariant;
  shadow: ShadowVariant;
  density: WidgetDensity;
}

// -------------------------------------------------------
// Typography
// -------------------------------------------------------
export interface VoiceWidgetTypographyConfig {
  fontFamily: string;
  headingWeight: string | number;
  bodyWeight: string | number;
  fontSizeScale: 'sm' | 'md' | 'lg' | string;
  lineHeight?: string;
}

// -------------------------------------------------------
// Launcher button
// -------------------------------------------------------
export interface VoiceWidgetLauncherConfig {
  /**
   * Visual layout variant.
   * 'icon' = icon button only (default)
   * 'icon-label' = icon + text label
   * 'pill' = text-only pill
   */
  variant: LauncherVariant;
  icon: LauncherIcon;
  iconSize: number;
  iconColor: string;
  /** SVG path data when icon === 'custom' */
  customIconPath?: string[];
  /** URL/path to a logo image. Renders instead of SVG icon when set. */
  logoSrc?: string;
  position: WidgetPosition;
  offset: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  size: 'small' | 'medium' | 'large' | number;
  shape: LauncherShape;
  shadow: LauncherShadow;
  border: {
    enabled: boolean;
    width: number;
    color: string;
  };
  label: {
    show: boolean;
    text: string;
    position: 'left' | 'right' | 'above' | 'below';
  };
  /**
   * CSS z-index for the launcher and panel.
   * Override when host page has sticky nav, modals, or other floats.
   * Default: 1000
   */
  zIndex: number;
  pulseAnimation: boolean;
  tooltip: string;
  ariaLabel: string;
}

// -------------------------------------------------------
// Panel
// -------------------------------------------------------
export interface VoiceWidgetPanelConfig {
  width: number | string;
  maxWidth?: number | string;
  height?: number | string;
  maxHeight: number | string;
  borderRadius?: number;
  padding?: string | number;
  border?: string;
  shadow?: string;
  position?: WidgetPosition;
  offset?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  showHeader?: boolean;
  showCloseButton?: boolean;
  showTabs?: boolean;
}

// -------------------------------------------------------
// Audio Visualizer
// -------------------------------------------------------
export interface VoiceWidgetAudioVisualizerConfig {
  type: AudioVisualizerType;
  enabled: boolean;
  color: string;
  intensity: number;
  size: number;
  animationSpeed: number;
}

// -------------------------------------------------------
// Behavior toggles
// -------------------------------------------------------
export interface VoiceWidgetBehaviorConfig {
  showTranscript: boolean;
  showMuteButton: boolean;
  showEndButton: boolean;
  showAgentStatus: boolean;
  showDuration: boolean;
  showWaveform: boolean;
  allowTextChat: boolean;
  allowVoiceChat: boolean;
  allowAgentNavigation?: boolean;
  defaultTab: 'voice' | 'text';
  /** ms before auto-resetting ended state to idle */
  autoResetEndedTimeout: number;
  /** ms before marking connection as failed */
  connectionTimeout: number;
  telemetryEnabled: boolean;
  installationType?: string;
  /** Hard server-side maximum call duration in minutes (default: 10) */
  maxCallDurationMinutes?: number;
  /** Hard server-side maximum chat turns per session (default: 30) */
  maxChatTurns?: number;
}

// -------------------------------------------------------
// Animation
// -------------------------------------------------------
export interface VoiceWidgetAnimationConfig {
  launcher: AnimationType;
  panel: AnimationType;
  speaking: AnimationType;
  /** Transition duration in milliseconds */
  duration: number;
}

// -------------------------------------------------------
// Responsive overrides
// -------------------------------------------------------
export interface VoiceWidgetMobileOverride {
  launcherSize?: number | 'small' | 'medium' | 'large';
  bottomOffset?: number;
  horizontalOffset?: number;
  panelWidth?: number | string;
  panelMaxHeight?: number | string;
}

export interface VoiceWidgetResponsiveConfig {
  mobileBreakpoint: number;
  fullscreenOnMobile: boolean;
  mobile?: VoiceWidgetMobileOverride;
}

// -------------------------------------------------------
// Root configuration
// -------------------------------------------------------
export interface VoiceWidgetConfig {
  /** 'floating' = FAB + panel overlay | 'inline' = embedded in page */
  mode?: WidgetMode;
  /** Provider + agent identity (public IDs, no secrets) */
  provider: VoiceWidgetProviderConfig;
  branding: VoiceWidgetBrandingConfig;
  avatar?: VoiceWidgetAvatarConfig;
  theme: VoiceWidgetThemeConfig;
  typography: VoiceWidgetTypographyConfig;
  launcher: VoiceWidgetLauncherConfig;
  panel: VoiceWidgetPanelConfig;
  audioVisualizer: VoiceWidgetAudioVisualizerConfig;
  behavior: VoiceWidgetBehaviorConfig;
  animation: VoiceWidgetAnimationConfig;
  responsive: VoiceWidgetResponsiveConfig;
}

// -------------------------------------------------------
// Client config type — used for client-specific files.
// Deliberately a deep partial so clients only specify
// what they want to override from the default.
// -------------------------------------------------------
export type ClientVoiceWidgetConfig = {
  mode?: WidgetMode;
  provider?: Partial<VoiceWidgetProviderConfig>;
  branding?: Partial<VoiceWidgetBrandingConfig>;
  avatar?: Partial<VoiceWidgetAvatarConfig>;
  theme?: Partial<VoiceWidgetThemeConfig>;
  typography?: Partial<VoiceWidgetTypographyConfig>;
  launcher?: Partial<VoiceWidgetLauncherConfig> & {
    offset?: Partial<VoiceWidgetLauncherConfig['offset']>;
    border?: Partial<VoiceWidgetLauncherConfig['border']>;
    label?: Partial<VoiceWidgetLauncherConfig['label']>;
  };
  panel?: Partial<VoiceWidgetPanelConfig> & {
    offset?: Partial<NonNullable<VoiceWidgetPanelConfig['offset']>>;
  };
  audioVisualizer?: Partial<VoiceWidgetAudioVisualizerConfig>;
  behavior?: Partial<VoiceWidgetBehaviorConfig>;
  animation?: Partial<VoiceWidgetAnimationConfig>;
  responsive?: Partial<VoiceWidgetResponsiveConfig> & {
    mobile?: Partial<VoiceWidgetMobileOverride>;
  };
};
