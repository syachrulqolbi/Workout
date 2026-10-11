'use client';

import { useEffect, useState } from 'react';

export function ServiceWorkerRegistration() {
  const [offline, setOffline] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    let hadController = Boolean(navigator.serviceWorker?.controller);
    const updateConnection = () => setOffline(!navigator.onLine);
    const updateReady = () => {
      if (hadController && active) setUpdateAvailable(true);
      hadController = true;
    };
    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.addEventListener('controllerchange', updateReady);
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller && active) setUpdateAvailable(true);
        void registration.update();
      });
    }
    return () => {
      active = false;
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      navigator.serviceWorker?.removeEventListener('controllerchange', updateReady);
    };
  }, []);

  if (!offline && !updateAvailable) return null;
  return (
    <div className="system-banner-stack">
      {offline && <div className="offline-banner" role="status">You’re offline. Changes stay on this device and will sync when your connection returns.</div>}
      {updateAvailable && <div className="update-banner" role="status"><span>A newer Workout version is ready.</span><button type="button" onClick={() => window.location.reload()}>Refresh when ready</button></div>}
    </div>
  );
}
