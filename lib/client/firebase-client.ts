'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

if (!firebaseApiKey) {
  throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY is required to initialize Firebase Authentication.');
}

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'workout.sqnsportfolio.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'personal-project-414620',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'personal-project-414620.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '1039215803832',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:1039215803832:web:00e447a1e38992b6ec634d',
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
