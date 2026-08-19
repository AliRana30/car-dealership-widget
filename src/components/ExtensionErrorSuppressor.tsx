'use client';

import { useEffect } from 'react';

/**
 * Suppresses unhandled promise rejections originating from third-party Chrome extensions
 * (such as password managers, coupon finders, or adblockers injecting content scripts).
 */
export default function ExtensionErrorSuppressor() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const stack = String(reason?.stack || '');
      const msg = String(reason?.message || reason || '');

      if (
        stack.includes('chrome-extension://') ||
        msg.includes('M_ID') ||
        stack.includes('eppiocemhmnlbhjplcgkofciiegomcon')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);

  return null;
}
