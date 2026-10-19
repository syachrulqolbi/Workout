'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        cancel_on_tap_outside?: boolean;
      }) => void;
      renderButton: (element: HTMLElement, options: {
        type: 'standard';
        theme: 'filled_black';
        size: 'large';
        text: 'continue_with';
        shape: 'rectangular';
        logo_alignment: 'left';
        width: number;
      }) => void;
      disableAutoSelect: () => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

export function disableGoogleAutoSelect() {
  window.google?.accounts.id.disableAutoSelect();
}

export function GoogleSignInButton({ onCredential, onError, signingIn }: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  signingIn: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const renderButton = useCallback(() => {
    if (!scriptReady || !clientId || !container.current || !window.google) return;
    const target = container.current;
    target.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: clientId,
      cancel_on_tap_outside: false,
      callback: (response) => {
        if (response.credential) onCredential(response.credential);
        else onError('Google did not return a sign-in credential. Please try again.');
      },
    });
    window.google.accounts.id.renderButton(target, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: Math.min(400, Math.max(250, Math.round(target.getBoundingClientRect().width || 320))),
    });
  }, [clientId, onCredential, onError, scriptReady]);

  useEffect(() => {
    renderButton();
  }, [renderButton]);

  useEffect(() => {
    if (!scriptReady) return;
    const handleResize = () => renderButton();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderButton, scriptReady]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => onError('Google sign-in could not load. Check your connection and try again.')}
      />
      <div
        id="google-sign-in"
        className={`google-sign-in ${signingIn ? 'busy' : ''}`}
        ref={container}
        aria-busy={signingIn}
        aria-label="Continue with Google"
      >
        {!clientId ? <span>Google sign-in is not configured.</span> : !scriptReady ? <span>Loading Google sign-in…</span> : null}
      </div>
    </>
  );
}
