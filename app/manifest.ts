import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Workout — Training & Nutrition',
    short_name: 'Workout',
    description: 'Private strength, cardio, meal and progress tracking.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#333333',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/workout-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/workout-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/workout-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
