import React from 'react';
import { CallState, VoiceWidgetConfig } from '@/config/voiceWidget/types';
import VoiceAgentHeader from './VoiceAgentHeader';
import VoiceAgentStatus from './VoiceAgentStatus';
import VoiceAgentTranscript, { TranscriptMessage } from './VoiceAgentTranscript';
import VoiceAgentControls from './VoiceAgentControls';

interface VoiceAgentPanelProps {
  config: VoiceWidgetConfig;
  isOpen: boolean;
  onClose: () => void;
  callState: CallState;
  activeTab: 'voice' | 'text';
  onTabChange: (tab: 'voice' | 'text') => void;
  isLoading: boolean;
  isActive: boolean;
  errorMessage: string | null;
  duration: number;
  isMuted: boolean;
  agentSpeaking: boolean;
  userSpeaking: boolean;
  onStartCall: () => void;
  onStopCall: () => void;
  onToggleMute: () => void;
  chatMessages: TranscriptMessage[];
  chatInput: string;
  onChatInputChange: (val: string) => void;
  onSendChatMessage: (e: React.FormEvent) => void;
  chatTyping: boolean;
  transcript: TranscriptMessage[];
  transcriptEndRef: React.RefObject<HTMLDivElement | null>;
  parseStatusMessage: (content: string) => { isStatus: boolean; text: string; statusType: string };
  onSelectTemplateMessage?: (message: string) => void;
  onNewChat?: () => void;
}

export default function VoiceAgentPanel({
  config,
  isOpen,
  onClose,
  callState,
  activeTab,
  onTabChange,
  isLoading,
  isActive,
  errorMessage,
  duration,
  isMuted,
  agentSpeaking,
  userSpeaking,
  onStartCall,
  onStopCall,
  onToggleMute,
  chatMessages,
  chatInput,
  onChatInputChange,
  onSendChatMessage,
  chatTyping,
  transcript,
  transcriptEndRef,
  parseStatusMessage,
  onSelectTemplateMessage,
  onNewChat,
}: VoiceAgentPanelProps) {
  const { panel, animation } = config;

  const getAnimationStyles = (): React.CSSProperties => {
    if (config.mode === 'inline') return {};

    const style: React.CSSProperties = {};
    if (!isOpen) {
      style.opacity = 0;
      style.pointerEvents = 'none';
      style.visibility = 'hidden';

      if (animation.panel === 'slide' || animation.panel === 'slide-up' || animation.panel === 'slide-down') {
        const isBottom = (panel.position || config.launcher.position).startsWith('bottom');
        style.transform = `translateY(${isBottom ? '16px' : '-16px'})`;
      } else if (animation.panel === 'zoom' || animation.panel === 'scale') {
        style.transform = 'scale(0.92)';
      }
    } else {
      style.opacity = 1;
      style.pointerEvents = 'all';
      style.visibility = 'visible';
      style.transform = 'translateY(0) scale(1)';
    }

    style.transition = `opacity ${animation.duration}ms ease, transform ${animation.duration}ms cubic-bezier(0.16, 1, 0.3, 1), visibility ${animation.duration}ms`;
    return style;
  };

  const getLayoutStyles = (): React.CSSProperties => {
    if (config.mode === 'inline') {
      return {
        width: '100%',
        flex: 1,
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(251, 253, 255, 0.92)',
        border: '1px solid var(--voice-widget-border)',
        borderRadius: 'var(--voice-widget-radius-panel)',
        boxShadow: 'var(--voice-widget-shadow)',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: '24px',
        boxSizing: 'border-box',
      };
    }

    const { launcher } = config;
    const targetPos = panel.position || launcher.position;
    
    const defaultOffset = {
      bottom: targetPos.startsWith('bottom') ? (launcher.offset.bottom !== undefined ? launcher.offset.bottom : 20) : undefined,
      top: targetPos.startsWith('top') ? (launcher.offset.top !== undefined ? launcher.offset.top : 20) : undefined,
      right: targetPos.endsWith('right') ? (launcher.offset.right !== undefined ? launcher.offset.right : 20) : undefined,
      left: targetPos.endsWith('left') ? (launcher.offset.left !== undefined ? launcher.offset.left : 20) : undefined,
    };
    
    const offset = panel.offset || defaultOffset;

    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: (launcher.zIndex ?? 1000) - 1,
      width: typeof panel.width === 'number' ? `${panel.width}px` : panel.width,
      height: panel.height !== undefined ? (typeof panel.height === 'number' ? `${panel.height}px` : panel.height) : 'auto',
      maxWidth: panel.maxWidth !== undefined ? (typeof panel.maxWidth === 'number' ? `${panel.maxWidth}px` : panel.maxWidth) : '100vw',
      maxHeight: (() => {
        const verticalOffset = targetPos.startsWith('bottom') ? (offset.bottom || 0) : (offset.top || 0);
        const topGap = 24; // safe spacing from container edge
        const maxHp = `calc(100% - ${verticalOffset + topGap}px)`;
        const calculatedMaxHeight = panel.maxHeight !== undefined ? panel.maxHeight : 400;
        return typeof calculatedMaxHeight === 'number'
          ? `min(${calculatedMaxHeight}px, ${maxHp})`
          : `min(${calculatedMaxHeight}, ${maxHp})`;
      })(),
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--voice-widget-bg-panel, var(--voice-widget-bg, rgba(255, 255, 255, 0.98)))',
      border: panel.border !== undefined ? panel.border : '1px solid var(--voice-widget-border)',
      borderRadius: panel.borderRadius !== undefined ? (typeof panel.borderRadius === 'number' ? `${panel.borderRadius}px` : panel.borderRadius) : 'var(--voice-widget-radius-panel)',
      boxShadow: panel.shadow !== undefined ? panel.shadow : 'var(--voice-widget-shadow)',
      overflow: 'hidden',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxSizing: 'border-box',
      fontFamily: config.typography.fontFamily,
    };

    if (targetPos.startsWith('bottom') && offset.bottom !== undefined) {
      style.bottom = `${offset.bottom}px`;
    } else if (offset.top !== undefined) {
      style.top = `${offset.top}px`;
    }

    if (targetPos.endsWith('right') && offset.right !== undefined) {
      style.right = `${offset.right}px`;
    } else if (offset.left !== undefined) {
      style.left = `${offset.left}px`;
    }

    return style;
  };

  const bodyPadding = config.mode === 'inline' ? '0' : '20px';

  return (
    <div
      className="voice-widget-panel-container"
      style={{ ...getLayoutStyles(), ...getAnimationStyles() }}
    >
      <VoiceAgentHeader
        config={config}
        isActive={isActive}
        isLoading={isLoading}
        onClose={onClose}
        showClose={config.mode === 'floating'}
        onNewChat={onNewChat}
      />
      <div
        style={{
          padding: bodyPadding,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          flex: 1,
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <VoiceAgentStatus
          config={config}
          callState={callState}
          activeTab={activeTab}
          onTabChange={onTabChange}
          isLoading={isLoading}
          isActive={isActive}
          errorMessage={errorMessage}
          duration={duration}
          isMuted={isMuted}
          agentSpeaking={agentSpeaking}
          userSpeaking={userSpeaking}
          onStartCall={onStartCall}
        />

        <VoiceAgentTranscript
          config={config}
          activeTab={activeTab}
          chatMessages={chatMessages}
          chatTyping={chatTyping}
          transcript={transcript}
          transcriptEndRef={transcriptEndRef}
          parseStatusMessage={parseStatusMessage}
          onSelectTemplateMessage={onSelectTemplateMessage}
        />

        <VoiceAgentControls
          config={config}
          activeTab={activeTab}
          callState={callState}
          isActive={isActive}
          isMuted={isMuted}
          onToggleMute={onToggleMute}
          onStopCall={onStopCall}
          chatInput={chatInput}
          onChatInputChange={onChatInputChange}
          onSendChatMessage={onSendChatMessage}
          chatTyping={chatTyping}
        />
      </div>
    </div>
  );
}
