'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, ArrowRight, ArrowLeft, X, Check } from 'lucide-react';
import { CustomizerSection } from './customizerTypes';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  sidebarSelector?: string;
  section?: CustomizerSection;
  isMobilePreview?: boolean;
  placementHint?: 'bottom' | 'top' | 'right' | 'left';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'branding',
    title: 'Branding & Identity',
    description: "Customize your assistant's identity, avatar, name, company branding and messages.",
    targetSelector: '[data-onboarding="branding"]',
    sidebarSelector: '[data-onboarding="sidebar-branding"]',
    section: 'branding',
    placementHint: 'right',
  },
  {
    id: 'typography',
    title: 'Typography',
    description: 'Choose the widget font and text styling.',
    targetSelector: '[data-onboarding="typography"]',
    sidebarSelector: '[data-onboarding="sidebar-typography"]',
    section: 'typography',
    placementHint: 'right',
  },
  {
    id: 'launcher',
    title: 'Launcher Button',
    description: 'Customize the widget launcher, icon, position and appearance.',
    targetSelector: '[data-onboarding="launcher"]',
    sidebarSelector: '[data-onboarding="sidebar-launcher"]',
    section: 'launcher',
    placementHint: 'right',
  },
  {
    id: 'panel',
    title: 'Panel & Layout',
    description: 'Control the widget panel layout, dimensions and visual appearance.',
    targetSelector: '[data-onboarding="panel"]',
    sidebarSelector: '[data-onboarding="sidebar-panel"]',
    section: 'panel',
    placementHint: 'right',
  },
  {
    id: 'behavior',
    title: 'Behavior & Capabilities',
    description: 'Configure chat, voice, limits and assistant behavior.',
    targetSelector: '[data-onboarding="behavior"]',
    sidebarSelector: '[data-onboarding="sidebar-behavior"]',
    section: 'behavior',
    placementHint: 'right',
  },
  {
    id: 'preview',
    title: 'Live Interactive Preview',
    description: 'See your changes instantly before publishing them.',
    targetSelector: '[data-onboarding="preview"]',
    isMobilePreview: true,
    placementHint: 'bottom',
  },
  {
    id: 'save',
    title: 'Save & Publish',
    description: 'Save your customization so the same configuration appears on your live widget.',
    targetSelector: '[data-onboarding="save"]',
    placementHint: 'bottom',
  },
];

interface Props {
  isOpen: boolean;
  onClose: (completed: boolean) => void;
  activeSection: CustomizerSection;
  onSelectSection: (s: CustomizerSection) => void;
  mobileTab: 'editor' | 'preview';
  setMobileTab: (tab: 'editor' | 'preview') => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
}

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function CustomizerOnboardingTour({
  isOpen,
  onClose,
  activeSection,
  onSelectSection,
  mobileTab,
  setMobileTab,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
}: Props) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const currentStep = TOUR_STEPS[currentStepIndex];
  const totalSteps = TOUR_STEPS.length;
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Measure and position spotlight for the active step
  const updatePositions = useCallback(() => {
    if (!isOpen || !currentStep) return;

    const targetEl = document.querySelector(currentStep.targetSelector) as HTMLElement | null;

    if (!targetEl) {
      // Fallback: place spotlight in center if target element is temporarily rendering
      const centerX = window.innerWidth / 2 - 160;
      const centerY = window.innerHeight / 2 - 100;
      setSpotlight(null);
      setTooltipPos({
        top: Math.max(20, centerY),
        left: Math.max(20, Math.min(centerX, window.innerWidth - 360)),
      });
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const padding = 6;
    const spotX = Math.max(0, rect.left - padding);
    const spotY = Math.max(0, rect.top - padding);
    const spotW = Math.min(window.innerWidth - spotX, rect.width + padding * 2);
    const spotH = Math.min(window.innerHeight - spotY, rect.height + padding * 2);

    setSpotlight({
      x: spotX,
      y: spotY,
      width: spotW,
      height: spotH,
    });

    // Calculate tooltip placement
    const tooltipWidth = Math.min(350, window.innerWidth - 32);
    const tooltipHeight = 220; // approximate
    const margin = 14;

    let top = 0;
    let left = 0;

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      // On mobile, position near bottom or top of viewport with safe clearance
      if (spotY + spotH + tooltipHeight + margin < window.innerHeight) {
        top = spotY + spotH + margin;
      } else if (spotY - tooltipHeight - margin > 0) {
        top = spotY - tooltipHeight - margin;
      } else {
        top = window.innerHeight - tooltipHeight - 20;
      }
      left = (window.innerWidth - tooltipWidth) / 2;
    } else {
      // Desktop positioning based on placement hint or available clearance
      const spaceRight = window.innerWidth - (spotX + spotW);
      const spaceLeft = spotX;
      const spaceBelow = window.innerHeight - (spotY + spotH);
      const spaceAbove = spotY;

      if (currentStep.placementHint === 'right' && spaceRight >= tooltipWidth + margin) {
        left = spotX + spotW + margin;
        top = Math.max(margin, Math.min(spotY, window.innerHeight - tooltipHeight - margin));
      } else if (currentStep.placementHint === 'bottom' && spaceBelow >= tooltipHeight + margin) {
        top = spotY + spotH + margin;
        left = Math.max(margin, Math.min(spotX + spotW / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - margin));
      } else if (spaceBelow >= tooltipHeight + margin) {
        top = spotY + spotH + margin;
        left = Math.max(margin, Math.min(spotX, window.innerWidth - tooltipWidth - margin));
      } else if (spaceAbove >= tooltipHeight + margin) {
        top = spotY - tooltipHeight - margin;
        left = Math.max(margin, Math.min(spotX, window.innerWidth - tooltipWidth - margin));
      } else if (spaceRight >= tooltipWidth + margin) {
        left = spotX + spotW + margin;
        top = Math.max(margin, spotY);
      } else if (spaceLeft >= tooltipWidth + margin) {
        left = spotX - tooltipWidth - margin;
        top = Math.max(margin, spotY);
      } else {
        // Center fallback
        left = (window.innerWidth - tooltipWidth) / 2;
        top = (window.innerHeight - tooltipHeight) / 2;
      }
    }

    // Strict boundary clamping
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - tooltipHeight - 12));

    setTooltipPos({ top, left });
  }, [isOpen, currentStep]);

  // Navigate to step & prepare UI context
  const goToStep = useCallback((stepIdx: number) => {
    if (stepIdx < 0 || stepIdx >= TOUR_STEPS.length) return;

    setIsTransitioning(true);
    setCurrentStepIndex(stepIdx);

    const step = TOUR_STEPS[stepIdx];

    // Responsive / Section setup for the step
    if (step.isMobilePreview) {
      setMobileTab('preview');
    } else {
      setMobileTab('editor');
    }

    if (step.section) {
      onSelectSection(step.section);
    }

    // Scroll into view safely after state update
    setTimeout(() => {
      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      if (el) {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        } catch (_) {}
      }

      // Re-measure after scroll animation
      setTimeout(() => {
        updatePositions();
        setIsTransitioning(false);
      }, 150);
    }, 80);
  }, [onSelectSection, setMobileTab, updatePositions]);

  // Handle open / reset
  useEffect(() => {
    if (isOpen) {
      goToStep(0);
    } else {
      setSpotlight(null);
      setTooltipPos(null);
      setCurrentStepIndex(0);
    }
  }, [isOpen]);

  // Resize and scroll listeners to keep spotlight locked to DOM
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePositions();
    };

    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });

    // Polling retry for dynamic UI loading
    const interval = setInterval(updatePositions, 400);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      clearInterval(interval);
    };
  }, [isOpen, updatePositions]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(false);
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStepIndex < totalSteps - 1) {
          e.preventDefault();
          goToStep(currentStepIndex + 1);
        } else {
          e.preventDefault();
          onClose(true);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentStepIndex > 0) {
          e.preventDefault();
          goToStep(currentStepIndex - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStepIndex, totalSteps, goToStep, onClose]);

  if (!isOpen || !currentStep) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
      aria-label="Widget Customizer Guided Tour"
      role="dialog"
      aria-modal="true"
    >
      {/* ── Dark Overlay with Cutout ── */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <defs>
          <mask id="customizer-tour-mask">
            {/* White background reveals the dark overlay */}
            <rect x="0" y="0" width="100%" height="100%" fill="#FFFFFF" />
            {/* Black cutout creates the transparent spotlight window */}
            {spotlight && (
              <rect
                x={spotlight.x}
                y={spotlight.y}
                width={spotlight.width}
                height={spotlight.height}
                rx="10"
                ry="10"
                fill="#000000"
              />
            )}
          </mask>
        </defs>

        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.72)"
          mask="url(#customizer-tour-mask)"
        />
      </svg>

      {/* ── Glowing Spotlight Border ── */}
      {spotlight && (
        <div
          style={{
            position: 'absolute',
            left: `${spotlight.x}px`,
            top: `${spotlight.y}px`,
            width: `${spotlight.width}px`,
            height: `${spotlight.height}px`,
            borderRadius: '10px',
            border: '2px solid #3B82F6',
            boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3), 0 0 25px rgba(59, 130, 246, 0.45)',
            pointerEvents: 'none',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 100000,
          }}
        />
      )}

      {/* ── Interactive Floating Tooltip Card ── */}
      {tooltipPos && (
        <div
          style={{
            position: 'absolute',
            left: `${tooltipPos.left}px`,
            top: `${tooltipPos.top}px`,
            width: 'min(350px, calc(100vw - 24px))',
            background: '#FFFFFF',
            borderRadius: '14px',
            boxShadow: '0 20px 40px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.9)',
            border: '1px solid #E2E8F0',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 100001,
            pointerEvents: 'auto',
            animation: 'custTourFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {/* Header row with step badge and close button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 9px',
                  borderRadius: '999px',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                }}
              >
                <Sparkles size={12} strokeWidth={2.5} />
                Step {currentStepIndex + 1} of {totalSteps}
              </span>
            </div>

            <button
              onClick={() => onClose(false)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                border: 'none',
                background: '#F1F5F9',
                color: '#64748B',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Skip Tour"
              aria-label="Close tour"
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>

          {/* Title and description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '15.5px',
                fontWeight: 700,
                color: '#0F172A',
                letterSpacing: '-0.01em',
              }}
            >
              {currentStep.title}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                lineHeight: 1.5,
                color: '#475569',
              }}
            >
              {currentStep.description}
            </p>
          </div>

          {/* Progress dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: '2px 0' }}>
            {TOUR_STEPS.map((step, idx) => (
              <button
                key={step.id}
                onClick={() => goToStep(idx)}
                style={{
                  width: idx === currentStepIndex ? '20px' : '6px',
                  height: '6px',
                  borderRadius: '999px',
                  border: 'none',
                  padding: 0,
                  background: idx === currentStepIndex ? '#2563EB' : '#E2E8F0',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title={`Go to step ${idx + 1}: ${step.title}`}
                aria-label={`Step ${idx + 1}`}
              />
            ))}
          </div>

          {/* Footer actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '6px',
              borderTop: '1px solid #F1F5F9',
            }}
          >
            <button
              onClick={() => onClose(false)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748B',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '6px 4px',
                transition: 'color 0.15s',
              }}
            >
              Skip Tour
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isFirstStep && (
                <button
                  onClick={() => goToStep(currentStepIndex - 1)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ArrowLeft size={13} />
                  Back
                </button>
              )}

              <button
                onClick={() => {
                  if (isLastStep) {
                    onClose(true);
                  } else {
                    goToStep(currentStepIndex + 1);
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isLastStep ? '#16A34A' : '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: isLastStep
                    ? '0 2px 8px rgba(22, 163, 74, 0.3)'
                    : '0 2px 8px rgba(37, 99, 235, 0.3)',
                  transition: 'all 0.15s ease',
                }}
              >
                {isLastStep ? (
                  <>
                    <Check size={14} strokeWidth={2.5} />
                    Finish
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes custTourFadeIn {
              from { opacity: 0; transform: translateY(6px) scale(0.98); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `,
        }}
      />
    </div>
  );
}
