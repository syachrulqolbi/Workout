'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="load-error"><AlertTriangle size={30} /><span className="eyebrow">WORKOUT RECOVERY</span><h1>Something interrupted the app.</h1><p>Your saved account data is safe. Try rebuilding this screen.</p><button onClick={retry}><RotateCcw size={16} /> Try again</button></main>;
}
