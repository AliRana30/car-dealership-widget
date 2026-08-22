import React from 'react';
import { CallState, VoiceWidgetConfig } from '@/config/voiceWidget/types';
import VoiceAgentHeader from './VoiceAgentHeader';
import VoiceAgentStatus from './VoiceAgentStatus';
import VoiceAgentTranscript, { TranscriptMessage } from './VoiceAgentTranscript';
import VoiceAgentControls from './VoiceAgentControls';
import IntelligenceResultCard, { WebsiteDataResult } from './IntelligenceResultCard';

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
  cards?: WebsiteDataResult[];
  onDismissCards?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onMinimize?: () => void;
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
  cards = [],
  onDismissCards,
  isExpanded = false,
  onToggleExpand,
  onMinimize,
}: VoiceAgentPanelProps) {
  const { panel, animation } = config;
  const hasCards = Boolean(cards && cards.length > 0);

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

    style.transition = `opacity ${animation.duration}ms ease, transform ${animation.duration}ms cubic-bezier(0.16, 1, 0.3, 1), visibility ${animation.duration}ms, width 280ms cubic-bezier(0.16, 1, 0.3, 1)`;
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
    const baseWidth = typeof panel.width === 'number' ? panel.width : 360;
    const calculatedWidth = (hasCards || isExpanded) ? 700 : baseWidth;

    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: (launcher.zIndex ?? 1000) - 1,
      width: (hasCards || isExpanded) ? `min(${calculatedWidth}px, calc(100vw - 24px))` : (typeof panel.width === 'number' ? `${panel.width}px` : panel.width),
      height: panel.height !== undefined ? (typeof panel.height === 'number' ? `${panel.height}px` : panel.height) : 'auto',
      maxWidth: (hasCards || isExpanded) ? 'calc(100vw - 20px)' : (panel.maxWidth !== undefined ? (typeof panel.maxWidth === 'number' ? `${panel.maxWidth}px` : panel.maxWidth) : '100vw'),
      maxHeight: (() => {
        const verticalOffset = targetPos.startsWith('bottom') ? (offset.bottom || 0) : (offset.top || 0);
        const topGap = 24;
        const maxHp = `calc(100% - ${verticalOffset + topGap}px)`;
        const calculatedMaxHeight = panel.maxHeight !== undefined ? panel.maxHeight : 490;
        return typeof calculatedMaxHeight === 'number'
          ? `min(${calculatedMaxHeight}px, ${maxHp})`
          : `min(${calculatedMaxHeight}, ${maxHp})`;
      })(),
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--voice-widget-bg-panel, var(--voice-widget-bg, rgba(255, 255, 255, 0.98)))',
      border: panel.border !== undefined ? panel.border : '1px solid var(--voice-widget-border, #E2E8F0)',
      borderRadius: panel.borderRadius !== undefined ? (typeof panel.borderRadius === 'number' ? `${panel.borderRadius}px` : panel.borderRadius) : 'var(--voice-widget-radius-panel)',
      boxShadow: panel.shadow !== undefined ? panel.shadow : 'var(--voice-widget-shadow)',
      overflow: 'hidden',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxSizing: 'border-box',
      fontFamily: config.typography.fontFamily,
      transition: 'width 260ms cubic-bezier(0.16, 1, 0.3, 1), height 260ms ease',
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

  const bodyPadding = panel.padding !== undefined ? (typeof panel.padding === 'number' ? `${panel.padding}px` : panel.padding) : '12px';

  const handleNavigate = (url: string) => {
    if (typeof window !== 'undefined') {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'voice-agent-navigate', url }, '*');
      } else {
        window.location.href = url;
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`${config.branding.assistantName} panel`}
      className="voice-widget-panel-container"
      style={{
        ...getLayoutStyles(),
        ...getAnimationStyles(),
      }}
    >
      {/* Header */}
      <VoiceAgentHeader
        config={config}
        isActive={isActive}
        isLoading={isLoading}
        onClose={onClose}
        showClose={config.mode === 'floating'}
        onNewChat={onNewChat}
        cardCount={cards.length}
        isCardsOpen={hasCards}
        onToggleCards={undefined}
        isMuted={isMuted}
        onToggleMute={onToggleMute}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        onMinimize={onMinimize || onClose}
      />

      <style jsx>{`
        @media (max-width: 680px) {
          .voice-widget-panel-body {
            flex-direction: column-reverse !important;
            overflow-y: auto !important;
          }
          .voice-widget-main-col {
            min-width: 100% !important;
            width: 100% !important;
            flex: none !important;
          }
          .voice-widget-cards-pane {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            border-left: none !important;
            border-bottom: 1px solid var(--voice-widget-border, #E2E8F0) !important;
            max-height: 260px !important;
            flex: none !important;
          }
        }
      `}</style>
      <div className="voice-widget-panel-body" style={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%', minHeight: 0 }}>
        {/* Main Conversation Column */}
        <div
          className="voice-widget-main-col"
          style={{
            padding: bodyPadding,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            flex: '1 1 auto',
            minWidth: hasCards ? 'min(320px, 100%)' : '100%',
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
            chatTyping={chatTyping}
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
            onStartCall={onStartCall}
            onStopCall={onStopCall}
            chatInput={chatInput}
            onChatInputChange={onChatInputChange}
            onSendChatMessage={onSendChatMessage}
            chatTyping={chatTyping}
            onSwitchToVoice={() => onTabChange('voice')}
          />
        </div>

        {/* Separate Dedicated "Discovered & Recommended" Cards Section */}
        {hasCards && (
          <div
            className="voice-widget-cards-pane"
            style={{
              width: '320px',
              minWidth: '300px',
              maxWidth: '330px',
              borderLeft: '1px solid var(--voice-widget-border, #E2E8F0)',
              background: '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              padding: '12px 14px',
              boxSizing: 'border-box',
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            {/* Header: Discovered & Recommended */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#059669', fontSize: '13px' }}>🧭</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
                  Discovered & Recommended
                </span>
              </div>
              <span style={{
                background: '#ECFDF5', color: '#059669',
                padding: '2px 8px', borderRadius: '12px',
                fontSize: '10px', fontWeight: 700,
              }}>
                {cards.length} {cards.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Cards Scroll List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              {cards.map((card, idx) => (
                <IntelligenceResultCard key={card.id || idx} result={card} primaryColor="var(--voice-widget-primary, #2F8FE0)" />
              ))}
            </div>

            {/* Footer Navigation Links */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              paddingTop: '10px', marginTop: '8px', borderTop: '1px solid #E2E8F0',
              fontSize: '11px', flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => handleNavigate('/courses')}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--voice-widget-primary, #2F8FE0)',
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                View All Courses →
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('/policy')}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: '#64748B', cursor: 'pointer',
                }}
              >
                Policies
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
