(function() {
  // Prevent duplicate script execution
  if (window.__myFrontDeskWidgetLoaded) return;
  window.__myFrontDeskWidgetLoaded = true;

  // 1. Get the current script tag and its parameters
  const currentScript = document.currentScript || (function() {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const widgetId = currentScript.getAttribute('data-widget-id');
  if (!widgetId) {
    console.error('[MyFrontDesk] Error: Missing data-widget-id attribute on the script tag.');
    return;
  }

  // Determine the base URL from the script source
  const scriptUrl = new URL(currentScript.src);
  const baseUrl = scriptUrl.origin;

  // 2. Create the container element for the widget iframe
  const container = document.createElement('div');
  container.id = 'myfrontdesk-widget-container';
  
  // Default styling for the container (matches floating button size)
  const defaultStyles = {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '90px',
    height: '90px',
    zIndex: '999999',
    border: 'none',
    overflow: 'hidden',
    background: 'transparent',
    transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1), height 0.2s cubic-bezier(0.16, 1, 0.3, 1), bottom 0.2s, left 0.2s, right 0.2s, top 0.2s',
  };

  Object.assign(container.style, defaultStyles);

  // 3. Create the iframe with optional session resumption
  const hostUrlParams = new URLSearchParams(window.location.search);
  const resumeToken = hostUrlParams.get('widget_resume');
  let shouldReopen = false;
  let isPanelExpanded = false;
  try {
    if (
      sessionStorage.getItem('myfrontdesk_open_' + widgetId) === '1' ||
      sessionStorage.getItem('myfrontdesk_reopen_' + widgetId) === 'true'
    ) {
      shouldReopen = true;
    }
    if (sessionStorage.getItem('myfrontdesk_expanded_' + widgetId) === '1') {
      isPanelExpanded = true;
    }
  } catch (_) {}

  const embedUrl = new URL(`${baseUrl}/embed/${widgetId}`);
  if (resumeToken) {
    embedUrl.searchParams.set('widget_resume', resumeToken);
  }
  if (shouldReopen) {
    embedUrl.searchParams.set('open', '1');
  }

  const iframe = document.createElement('iframe');
  iframe.src = embedUrl.toString();
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  iframe.style.background = 'transparent';
  iframe.style.colorScheme = 'light';
  iframe.setAttribute('allow', 'microphone'); // Crucial for voice WebRTC!

  container.appendChild(iframe);
  document.body.appendChild(container);

  // If reopening from a previous page navigation, expand the container immediately
  if (shouldReopen) {
    setTimeout(function() {
      resizeWidget(true, isPanelExpanded);
    }, 10);
  }

  // 4. Setup postMessage event listener to communicate with the iframe widget
  let widgetConfig = null;

  window.addEventListener('message', function(event) {
    // Only accept messages from our widget domain
    if (event.origin !== baseUrl) return;

    const data = event.data;
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'widget-ready':
        widgetConfig = data.config;
        applyPosition(widgetConfig);
        if (shouldReopen) {
          resizeWidget(true, isPanelExpanded);
        }
        break;

      case 'widget-open':
        try {
          sessionStorage.setItem('myfrontdesk_open_' + widgetId, '1');
        } catch (_) {}
        resizeWidget(true, isPanelExpanded);
        break;

      case 'widget-resize':
        isPanelExpanded = Boolean(data.expanded);
        try {
          sessionStorage.setItem('myfrontdesk_expanded_' + widgetId, isPanelExpanded ? '1' : '0');
        } catch (_) {}
        resizeWidget(true, isPanelExpanded);
        break;

      case 'widget-close':
      case 'widget-new-chat':
        try {
          sessionStorage.setItem('myfrontdesk_open_' + widgetId, '0');
          sessionStorage.setItem('myfrontdesk_expanded_' + widgetId, '0');
          sessionStorage.removeItem('myfrontdesk_reopen_' + widgetId);
        } catch (_) {}
        if (data.type === 'widget-close') {
          isPanelExpanded = false;
          resizeWidget(false);
        }
        break;

      case 'voice-agent-navigate':
      case 'WIDGET_NAVIGATE':
      case 'widget-navigate':
      case 'navigate':
        // Top-level host navigation bridge
        if (data.url && typeof data.url === 'string') {
          console.log('[Widgetized] Agent requested host page navigation to:', data.url);
          try {
            sessionStorage.setItem('myfrontdesk_open_' + widgetId, '1');
            sessionStorage.setItem('myfrontdesk_reopen_' + widgetId, 'true');
            if (isPanelExpanded) {
              sessionStorage.setItem('myfrontdesk_expanded_' + widgetId, '1');
            }
          } catch (_) {}
          let target = data.url;
          if (target.startsWith('/')) {
            target = window.location.origin + target;
          }
          window.location.href = target;
        }
        break;

      default:
        break;
    }
  });

  // Apply custom alignment positions from the widget configuration
  function applyPosition(config) {
    if (!config) return;
    
    const launcher = config.launcher || {};
    const position = launcher.position || 'bottom-right';
    
    // Reset positions
    container.style.bottom = 'auto';
    container.style.top = 'auto';
    container.style.right = 'auto';
    container.style.left = 'auto';

    const offsetBottom = launcher.offset?.bottom !== undefined ? `${launcher.offset.bottom}px` : '20px';
    const offsetRight = launcher.offset?.right !== undefined ? `${launcher.offset.right}px` : '20px';

    if (position.includes('bottom')) {
      container.style.bottom = offsetBottom;
    } else {
      container.style.top = offsetBottom;
    }

    if (position.includes('right')) {
      container.style.right = offsetRight;
    } else {
      container.style.left = offsetRight;
    }

    if (config.mode === 'inline') {
      // In inline mode, the widget is not floating. We can adjust the container size.
      container.style.position = 'relative';
      container.style.bottom = 'auto';
      container.style.right = 'auto';
      container.style.left = 'auto';
      container.style.top = 'auto';
      container.style.width = '100%';
      container.style.height = `${config.panel?.maxHeight || 480}px`;
    }
  }

  // Adjust container size on open/close and dynamic expansion
  function resizeWidget(isOpen, isExpanded = isPanelExpanded) {
    if (widgetConfig && widgetConfig.mode === 'inline') return;

    const isMobile = window.innerWidth <= (widgetConfig?.responsive?.mobileBreakpoint || 860);

    if (isOpen) {
      if (isMobile && widgetConfig?.responsive?.fullscreenOnMobile) {
        // Fullscreen layout on mobile devices
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.bottom = '0';
        container.style.top = '0';
        container.style.right = '0';
        container.style.left = '0';
      } else if (isMobile) {
        // Floating layout on mobile devices (e.g. bottom card) - shouldn't cover whole screen
        const mobileMaxHeight = widgetConfig?.responsive?.mobile?.panelMaxHeight || '72vh';
        container.style.width = '100%';
        container.style.height = typeof mobileMaxHeight === 'number' ? `${mobileMaxHeight}px` : mobileMaxHeight;
        container.style.bottom = '0';
        container.style.top = 'auto';
        container.style.right = '0';
        container.style.left = '0';
      } else {
        // Desktop panel size (dynamically expanded if intelligence cards are present)
        const baseWidth = widgetConfig?.panel?.width || 360;
        const panelWidth = isExpanded ? Math.min(710, window.innerWidth - 32) : baseWidth;
        const panelHeight = widgetConfig?.panel?.maxHeight || 490;
        
        // Add safety margins for shadows and launcher overlap
        container.style.width = `${panelWidth + 30}px`;
        container.style.height = `${panelHeight + 80}px`;
      }
    } else {
      // Restore default launcher sizing
      const sizeStr = widgetConfig?.launcher?.size || 'medium';
      let sizeVal = 90; // Default sizing including spacing
      if (sizeStr === 'small') sizeVal = 70;
      if (sizeStr === 'large') sizeVal = 110;

      let width = sizeVal;
      let height = sizeVal;

      // If launcher has text (pill or icon-label) or shows a label, adjust container dimensions
      const isPill = widgetConfig?.launcher?.variant === 'pill';
      const isIconLabel = widgetConfig?.launcher?.variant === 'icon-label';
      const hasLabelText = widgetConfig?.launcher?.label?.text;
      
      if ((isPill || isIconLabel) && hasLabelText) {
        width = sizeVal + 120; // Give it extra width for text
      } else if (widgetConfig?.launcher?.variant === 'icon' && widgetConfig?.launcher?.label?.show && hasLabelText) {
        // External label on the side
        const labelPos = widgetConfig?.launcher?.label?.position || 'left';
        if (labelPos === 'left' || labelPos === 'right') {
          width = sizeVal + 140; // External label next to the icon
        } else {
          height = sizeVal + 40; // External label above or below the icon
        }
      }

      container.style.width = `${width}px`;
      container.style.height = `${height}px`;
      
      // Re-apply original positions
      applyPosition(widgetConfig);
    }
  }

  // Listen to window resizes to adapt mobile layouts
  window.addEventListener('resize', function() {
    // If the widget container is active/open, recalculate layout boundaries
    const isExpanded = parseInt(container.style.width) > 120;
    if (isExpanded) {
      resizeWidget(true);
    }
  });

})();
