'use client';

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en"><body style={{ margin: 0, background: '#fafafa', color: '#333', fontFamily: 'Arial, sans-serif' }}>
      <main style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
        <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 13, background: '#333', color: '#fff', fontWeight: 700 }}>W</div>
        <h1 style={{ margin: 0, fontSize: 28 }}>Workout needs a fresh start.</h1>
        <p style={{ maxWidth: 420, margin: 0, color: '#777', lineHeight: 1.7 }}>Your stored training data has not been removed. Reload the application to continue.</p>
        <button onClick={retry} style={{ marginTop: 8, padding: '12px 18px', border: 0, borderRadius: 11, background: '#333', color: '#fff', cursor: 'pointer' }}>Reload Workout</button>
      </main>
    </body></html>
  );
}
