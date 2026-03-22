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
  iframe.style.bottom = '20px';
  iframe.style.right = '20px';
  iframe.style.width = '80px';
  iframe.style.height = '80px';
  iframe.style.border = 'none';
  iframe.style.zIndex = '999999';
  iframe.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
  iframe.style.colorScheme = 'light';
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

  // Listen for messages from the widget
  window.addEventListener('message', (event) => {
    if (event.data === 'open-chat') {
      const isMobile = window.innerWidth < 640;
      iframe.style.width = isMobile ? '100%' : '440px';
      iframe.style.height = isMobile ? '100%' : '700px';
      if (isMobile) {
        iframe.style.bottom = '0';
        iframe.style.right = '0';
      }
    } else if (event.data === 'close-chat') {
      iframe.style.width = '80px';
      iframe.style.height = '80px';
      iframe.style.bottom = '20px';
      iframe.style.right = '20px';
    }
  });

  document.body.appendChild(iframe);
})();