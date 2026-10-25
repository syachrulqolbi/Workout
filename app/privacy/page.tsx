import { Dumbbell } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Workout',
  description: 'How Workout uses and protects account, training and nutrition data.',
};

export default function PrivacyPage() {
  return <main className="policy-page"><header><Link href="/" className="brand"><span className="brand-mark"><Dumbbell size={16} /></span><span>WORKOUT</span></Link><Link href="/">Back to Workout</Link></header><article><span className="eyebrow">PRIVACY POLICY · 26 OCTOBER 2026</span><h1>Your training data stays personal.</h1><p>Workout uses Google Sign-In to identify your account and keep each person’s training and meal records separate. We receive your Google account identifier, name, email address and profile image when available.</p><h2>What we store</h2><p>We store the exercise plans you create, active and completed workouts, strength and cardio progress, meals and nutrition values. If you enable phone reminders, we also store that device’s push endpoint, reminder times and time zone. Nutrition-label images are processed only to detect text and are not stored.</p><h2>How we use it</h2><p>Your information is used only to provide the Workout app, synchronize your data between devices, show progress, deliver reminders you request and maintain account security. We do not sell your information or use it for advertising.</p><h2>Retention and deletion</h2><p>You can disable reminders or remove their device subscription from Settings. You can also reset your Workout data from Settings. To limit unnecessary retention, an automated job removes a user’s stored Workout record and device subscriptions after 30 days without account activity.</p><h2>Service providers</h2><p>Workout runs on Google Cloud. Firebase Authentication verifies sign-in, Firestore stores account-scoped app data, Cloud Vision processes nutrition-label images when you choose that feature, and your device’s standards-based push service delivers enabled notifications.</p><h2>Contact</h2><p>For privacy or account questions, contact <a href="mailto:syachrulqolbinursepti@gmail.com">syachrulqolbinursepti@gmail.com</a>.</p></article></main>;
}
