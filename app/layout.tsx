import type { Metadata, Viewport } from 'next';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@/styles/globals.css';
import { ServiceWorkerRegistration } from '@/features/workout/components/service-worker-registration';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://workout.sqnsportfolio.com';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Workout — Training & Nutrition',
  description: 'Your private workout tracker, training history and meal planner.',
  applicationName: 'Workout',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Workout', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icons/workout-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Workout — Training & Nutrition',
    description: 'Private training, progress and nutrition — in one focused place.',
    type: 'website',
    images: [{ url: '/og-workout.png', width: 1731, height: 909, alt: 'Workout training and nutrition app' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Workout — Training & Nutrition',
    description: 'Private training, progress and nutrition — in one focused place.',
    images: ['/og-workout.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<ServiceWorkerRegistration /></body>
    </html>
  );
}
