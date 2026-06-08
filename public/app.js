// WorkersSSH - Main Application Entry Point

// Initialize the application
(function init() {
  // Check if user is authenticated
  const token = sessionStorage.getItem('auth_token');
  
  if (token) {
    // Verify token by checking auth status
    api('/api/auth/check')
      .then(data => {
        if (data.hasPassword) {
          renderDashboard();
        } else {
          // Password was reset, go to auth page
          sessionStorage.removeItem('auth_token');
          renderAuthPage();
        }
      })
      .catch(() => {
        // Connection error or invalid token, go to auth
        sessionStorage.removeItem('auth_token');
        renderAuthPage();
      });
  } else {
    renderAuthPage();
  }
})();

// Handle page unload - cleanup
window.addEventListener('beforeunload', () => {
  if (ws) {
    ws.close();
  }
  if (term) {
    term.dispose();
  }
});