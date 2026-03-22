(function() {
  const config = window.omnisyncConfig;
  if (!config || !config.botId) {
    console.error("OmniSync AI: Missing botId in configuration.");
    return;
  }

  const iframe = document.createElement('iframe');
  const iframeUrl = `${config.baseUrl}/widget?id=${config.botId}`;
  
  iframe.src = iframeUrl;
  iframe.style.position = 'fixed';
  iframe.style.border = 'none';
  iframe.style.zIndex = '999999';
  iframe.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
  iframe.style.colorScheme = 'light';
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

  // Set initial position based on widgetPosition config
  const position = config.widgetPosition || 'bottom-right';
  const isMobile = window.innerWidth < 640;
  
  // Set initial size and position
  iframe.style.width = '80px';
  iframe.style.height = '80px';
  
  // Position based on config
  switch (position) {
    case 'bottom-left':
      iframe.style.bottom = '20px';
      iframe.style.left = '20px';
      break;
    case 'top-right':
      iframe.style.top = '20px';
      iframe.style.right = '20px';
      break;
    case 'top-left':
      iframe.style.top = '20px';
      iframe.style.left = '20px';
      break;
    case 'bottom-right':
    default:
      iframe.style.bottom = '20px';
      iframe.style.right = '20px';
      break;
  }

  // Listen for messages from the widget
  window.addEventListener('message', (event) => {
    if (event.data === 'open-chat') {
      const isMobile = window.innerWidth < 640;
      iframe.style.width = isMobile ? '100%' : '440px';
      iframe.style.height = isMobile ? '100%' : '700px';
      
      if (isMobile) {
        // On mobile, always take full screen
        iframe.style.bottom = '0';
        iframe.style.right = '0';
        iframe.style.left = '0';
        iframe.style.top = '0';
      } else {
        // On desktop, adjust position based on widgetPosition
        switch (position) {
          case 'bottom-left':
            iframe.style.bottom = '20px';
            iframe.style.left = '20px';
            iframe.style.right = 'auto';
            iframe.style.top = 'auto';
            break;
          case 'top-right':
            iframe.style.top = '20px';
            iframe.style.right = '20px';
            iframe.style.bottom = 'auto';
            iframe.style.left = 'auto';
            break;
          case 'top-left':
            iframe.style.top = '20px';
            iframe.style.left = '20px';
            iframe.style.bottom = 'auto';
            iframe.style.right = 'auto';
            break;
          case 'bottom-right':
          default:
            iframe.style.bottom = '20px';
            iframe.style.right = '20px';
            iframe.style.left = 'auto';
            iframe.style.top = 'auto';
            break;
        }
      }
    } else if (event.data === 'close-chat') {
      iframe.style.width = '80px';
      iframe.style.height = '80px';
      
      // Reset to original position
      switch (position) {
        case 'bottom-left':
          iframe.style.bottom = '20px';
          iframe.style.left = '20px';
          iframe.style.right = 'auto';
          iframe.style.top = 'auto';
          break;
        case 'top-right':
          iframe.style.top = '20px';
          iframe.style.right = '20px';
          iframe.style.bottom = 'auto';
          iframe.style.left = 'auto';
          break;
        case 'top-left':
          iframe.style.top = '20px';
          iframe.style.left = '20px';
          iframe.style.bottom = 'auto';
          iframe.style.right = 'auto';
          break;
        case 'bottom-right':
        default:
          iframe.style.bottom = '20px';
          iframe.style.right = '20px';
          iframe.style.left = 'auto';
          iframe.style.top = 'auto';
          break;
      }
    }
  });

  document.body.appendChild(iframe);
})();