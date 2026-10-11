# Workout GCP deployment workflow

## Production architecture

```mermaid
flowchart LR
  User[Browser] -->|HTTPS| Domain[workout.sqnsportfolio.com]
  Domain --> Run[Cloud Run: workout]
  User -->|Google sign-in| Auth[Firebase Authentication]
  Run -->|Verify Firebase ID token| Auth
  Run -->|UID-scoped server access| Firestore[(Firestore: form-workout)]
  Run -->|On-demand OCR, image not retained| Vision[Cloud Vision API]
  Scheduler[Cloud Scheduler: daily 03:00] -->|OIDC-authenticated POST| Cleanup[/api/maintenance/cleanup]
  Cleanup -->|Delete users inactive 30 days| Firestore
  Source[Source] --> Build[Cloud Build]
  Build --> Registry[Artifact Registry]
  Registry --> Run
```

## Data and security model

- The public homepage is available without an account. App data requires Google sign-in.
- Every API request sends a fresh Firebase ID token. The Cloud Run server verifies it and derives the Firestore document ID from the verified Google UID; the browser cannot select another user document.
- Each user has one compact `workout-users/{uid}` document for plans, dated schedule overrides and active-workout state. Completed sessions, exercise history and meals are stored in UID-scoped subcollections so history growth cannot exceed Firestore's single-document limit. Existing embedded records migrate automatically on first read.
- Saves use a server revision and Firestore update precondition. Concurrent edits from another tab or device are merged by data area (plan, schedule, active workout, history or meals) instead of silently overwriting the whole account.
- The admin email is checked from the verified server-side token. Admin table reads and personal/global history deletions are recorded in `workout-audit`; client-side UI state is never trusted for authorization.
- Nutrition-label images are sent only to the authenticated Cloud Run endpoint, size/type validated, rate limited per account, forwarded to Cloud Vision OCR, and discarded after the response. The parser distinguishes kcal from kJ and flags ambiguous/per-100-unit results for review. Only user-confirmed calorie, protein, carbohydrate, fat, and sugar values are saved.
- The `expiresAt` field in `workout-rate-limits` has a Firestore TTL policy. Expired OCR throttling documents are removed automatically instead of accumulating indefinitely.
- Cloud Scheduler calls the cleanup endpoint with an OIDC token from `workout-cleanup@personal-project-414620.iam.gserviceaccount.com`. The endpoint verifies both its audience and service-account email, then removes user documents whose `lastActivityAt` is more than 30 days old.

## Release workflow

1. Run `npm ci`, `npm run lint`, `npm run test`, and `npm run build` locally.
2. Run the idempotent infrastructure script to verify APIs, service accounts, IAM, Firestore, Artifact Registry, and the daily cleanup job:

   ```powershell
   .\scripts\provision-gcp.ps1
   ```

3. Submit the production build:

   ```powershell
   gcloud builds submit --project=personal-project-414620 --config=cloudbuild.yaml .
   ```

4. Cloud Build repeats lint/build checks, creates an immutable container, pushes it to `portfolio-apps`, and deploys Cloud Run using the least-privilege `workout-runtime` identity.
5. Verify:

   ```powershell
   Invoke-RestMethod https://workout.sqnsportfolio.com/api/health
   gcloud scheduler jobs describe workout-inactive-user-cleanup --location=asia-southeast1 --project=personal-project-414620
   gcloud firestore fields ttls list --collection-group=workout-rate-limits --database=form-workout --project=personal-project-414620
   ```

6. Browser acceptance test: public homepage/privacy page, branded Google login, manifest/icons, per-user data round trip and conflict merge, strength/cardio start/resume/retake, delete set/interval, persistent editable rest countdown with skip/+15 seconds and sound/vibration completion cue, previous-performance/progression guidance, weekday library, recurring and date-specific meal add/edit/delete, nutrition-label confirmation, date-specific eaten status, Calendar workout/exercise/meal/completion markers, adaptive fixed-axis history charts, personal reset, admin summary/deletion controls, and the six-item mobile navigation without a floating workout button.

## One-time authentication configuration

The existing project ID stays `personal-project-414620`; its human-readable Google Cloud project name is `Workout App`. Firebase Authentication and the Google provider remain attached to the existing users and database. Authorized domains include:

- `workout.sqnsportfolio.com`
- `localhost`
- `personal-project-414620.firebaseapp.com`

The Firebase SDK uses `workout.sqnsportfolio.com` as `authDomain`. Next.js transparently proxies `/__/auth/*` to the original Firebase hosting helper, so the sign-in flow stays first-party while preserving the same Firebase project. The OAuth web client must keep both existing Finance URLs and add:

- JavaScript origin: `https://workout.sqnsportfolio.com`
- Redirect URI: `https://workout.sqnsportfolio.com/__/auth/handler`

Google Auth Platform branding should use app name `Workout`, support/developer email `syachrulqolbinursepti@gmail.com`, home page `https://workout.sqnsportfolio.com/`, privacy policy `https://workout.sqnsportfolio.com/privacy`, authorized domain `sqnsportfolio.com`, and the square dumbbell asset in `public/icons/workout-192.png`. Because the app is currently in Testing status, Google reports that verification is not required; publish/verification rules can change when the audience is moved to Production.

The Firebase browser configuration is public by design. No service-account keys or private OAuth credentials are stored in the repository; server credentials come from Cloud Run Application Default Credentials.

## Production resources

| Resource | Value |
| --- | --- |
| Region | `asia-southeast1` |
| Cloud Run service | `workout` |
| Custom domain | `workout.sqnsportfolio.com` |
| Firestore database | `form-workout` |
| User collection | `workout-users` |
| Audit collection | `workout-audit` |
| Scan limit collection | `workout-rate-limits` |
| Artifact Registry | `portfolio-apps` |
| Runtime identity | `workout-runtime@personal-project-414620.iam.gserviceaccount.com` |
| OCR | Cloud Vision `DOCUMENT_TEXT_DETECTION` |
| Cleanup identity | `workout-cleanup@personal-project-414620.iam.gserviceaccount.com` |
| Cleanup schedule | Daily at 03:00 Australia/Sydney |
| Admin | `syachrulqolbinursepti@gmail.com` |
