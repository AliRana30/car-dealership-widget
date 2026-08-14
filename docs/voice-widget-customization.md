# Voice Agent Widget Customization Guide

This guide explains how to customize, style, and deploy the branded voice/text AI receptionist widget for different clients and websites.

The entire white-label system is driven by visual and behavioral configurations. A developer can create a custom-branded experience in minutes without modifying the underlying Retell Web SDK logic or the React component internals.

---

## Architecture Overview

The system keeps visual branding separate from the secure call controller:

```
                 Client Configuration (clients/clinicA.ts)
                         │
                         ▼
                Config Validation (default.ts)
                         │
                         ▼
                 Config Merge (deepMerge)
                         │
              ┌──────────┴─────────┐
              ▼                    ▼
        CSS Variables         Widget Props
              │                    │
              └──────────┬─────────┘
                         ▼
                 VoiceAgentWidget
                         │
                  Call Controller
                         │
                         ▼
                  Retell Web SDK (Client Side)
                         │
                         ▼
                  Our Backend API (Secure Token Service)
                         │
                         ▼
                       Retell (Agent Engine)
```

---

## 1. Basic Usage

To load a branded configuration for a client, import the loader and mount the widget component:

```tsx
import VoiceAgentWidget from '@/components/voice-agent/VoiceAgentWidget';
import { getVoiceWidgetConfig } from '@/config/voiceWidget/default';

export default function ClientPage() {
  // Load and validate CarePoint Clinic configuration
  const config = getVoiceWidgetConfig('clinic-a');

  return (
    <main>
      {/* Content here */}
      <VoiceAgentWidget config={config} />
    </main>
  );
}
```

### Dynamic Page Overrides

You can pass an optional `overrides` prop to override settings directly on a specific page:

```tsx
{/* Force the widget to display inline instead of floating */}
<VoiceAgentWidget config={config} overrides={{ mode: 'inline' }} />
```

---

## 2. Configuration Structure

Each configuration file exports a `ClientVoiceWidgetConfig` object (a deep partial of the root configuration), which allows overriding only the values that differ from the system default.

```typescript
export interface VoiceWidgetConfig {
  mode?: 'floating' | 'inline';
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
```

---

## 3. Customization Details

### Branding
Controls text labels, titles, and assistant identity strings.

| Property | Type | Description |
|---|---|---|
| `companyName` | `string` | Brand owner name |
| `assistantName` | `string` | Renders in panel header |
| `title` | `string` | Bold welcome panel title |
| `subtitle` | `string` | Explanatory text in panel |
| `welcomeMessage` | `string` | First text message in chat tab |
| `startLabel` | `string` | Call starting button text |
| `connectingLabel` | `string` | Handshake status message |
| `connectedLabel` | `string` | Active session label |

### Avatar
Displays an assistant avatar image/logo in the header panel.

```typescript
avatar: {
  enabled: true,
  src: '/images/assistants/nova.png',
  fallbackText: 'N', // initials rendered if image fails or is omitted
  size: 38,
  shape: 'circle' // 'circle' | 'rounded' | 'square'
}
```

### Theme
Supports complete color theme specification. All layout dimensions utilize HSL or hex color mappings mapped directly to scoped CSS custom properties.

```typescript
theme: {
  primaryColor: '#6366F1',        // Main accent (buttons, icons)
  primaryHoverColor: '#4F46E5',   // Hover background state
  panelBackground: '#0F172A',     // Panel background surface
  headerBackground: '#1E293B',    // Top header background
  primaryTextColor: '#F1F5F9',    // Primary typography
  secondaryTextColor: '#94A3B8',  // Secondary labels
  radius: '2xl',                  // Border-radius preset ('sm', 'md', 'lg', 'xl', '2xl', 'full')
  shadow: '2xl',                  // Box shadow preset ('sm', 'md', 'lg', 'xl', '2xl')
}
```

### Typography
Controls font scaling and families. Applied strictly to the scoped root to prevent styles from leaking into the host page.

```typescript
typography: {
  fontFamily: "'Inter', sans-serif",
  headingWeight: 700,
  bodyWeight: 400,
  fontSizeScale: 'md', // 'sm' | 'md' | 'lg'
}
```

### Launcher
Supports three layout variants for the floating action button:

- `variant: 'icon'` — Compact circular or rounded button with an icon.
- `variant: 'icon-label'` — Horizontal pill with both icon and text (e.g. `[ 📞 Call Agent ]`).
- `variant: 'pill'` — Dynamic text-only button.

```typescript
launcher: {
  variant: 'icon-label',
  icon: 'headset',          // 'phone' | 'microphone' | 'headset' | 'sparkles' | 'custom'
  logoSrc: '/brand-logo.svg', // Renders custom brand logo inside launcher (gracefully falls back on error)
  size: 'medium',            // 'small' | 'medium' | 'large' or custom px number
  position: 'bottom-right',  // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  zIndex: 2000,              // High z-index configuration to override host app banners
  label: {
    show: true,
    text: 'Talk to Support'
  }
}
```

### Behavior
Toggles UI components and connection thresholds.

```typescript
behavior: {
  showTranscript: true,    // Shows/hides call transcription
  allowTextChat: true,      // Enables/disables chat tab
  allowVoiceChat: true,     // Enables/disables voice tab
  defaultTab: 'voice',      // Startup active tab
  connectionTimeout: 15000, // ms before showing connection error
  telemetryEnabled: true    // Logs session events to server API
}
```

---

## 4. Security Restrictions (CRITICAL)

**Never add credentials, access tokens, API keys, or private identifiers to client configurations.**

Client configs are bundleable assets transmitted directly to the client browser. 
All Retell agent authorization must flow through our secure server token route:

1. Widget requests credentials from `POST /api/retell/create-web-call`.
2. Secure API calls Retell server using environment variables (`RETELL_API_KEY`).
3. Secure API returns short-lived ephemeral token to browser.
4. Widget initiates call via Retell Web Client SDK.

---

## 5. Host Website Safety

To prevent widget styles from breaking or overlapping the parent site:
1. **No global styles**: The widget components use absolute inline positioning or scoped classes.
2. **Font Scoping**: Typography settings are bound to `--voice-widget-font-family` inside a container wrapper to avoid mutating global `body` or `html` styles.
3. **Flexible z-index**: Modifiable via `launcher.zIndex` configuration to resolve overlay layout conflicts on parent sites.

---

## 6. How to Onboard a New Client

To deploy the widget on a new website under a new brand:

1. **Copy the client template**:
   Duplicate `src/config/voiceWidget/clients/_template.ts` and rename it to match your client (e.g. `acmeCorp.ts`).

2. **Customize configurations**:
   Edit parameters in the file (colors, branding titles, welcome messages, icon, etc.).

3. **Register in client registry**:
   Add the new configuration to `src/config/voiceWidget/registry.ts`:
   ```typescript
   import acmeCorp from './clients/acmeCorp';

   export const clientRegistry: Record<string, ClientVoiceWidgetConfig> = {
     // ...
     'acme': acmeCorp,
   };
   ```

4. **Mount on client landing page**:
   Load using the registered ID:
   ```tsx
   const config = getVoiceWidgetConfig('acme');
   return <VoiceAgentWidget config={config} />;
   ```
