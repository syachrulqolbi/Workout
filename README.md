# Workout

A production full-stack workout and nutrition application built with Next.js App Router, TypeScript, Firebase Authentication, Google Cloud Firestore, Cloud Vision, and Cloud Run.

## Architecture

The project follows the feature-first App Router structure recommended by Next.js. Routing files remain small; feature UI, browser integrations, server infrastructure, and business logic have explicit boundaries.

```text
app/
  api/                    # Thin HTTP route adapters
  privacy/                # Public privacy route
  layout.tsx              # Root server layout
  page.tsx                # Server entry point
features/
  workout/
    components/           # Workout feature UI
    hooks/                # Feature-specific browser hooks
    workout-application.tsx
lib/
  client/                 # Browser-only Firebase and authenticated fetch
  server/
    api/                  # API use cases and request orchestration
    auth.ts               # Firebase Admin token verification
    firestore.ts          # Firestore connection and collection config
    workout-repository.ts # Persistence and transactions
  workout-*.ts            # Shared domain models and pure business logic
public/                    # PWA assets and service worker
scripts/                   # GCP provisioning and controlled data migrations
tests/                     # Unit, integration, and browser tests
```

The dependency direction is:

```text
app routes → feature or server API modules → domain/repository modules
feature UI → client adapters + shared domain modules
server modules ✕ client modules
```

## API

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Firestore readiness check |
| `GET` | `/api/data` | Firebase ID token | Load the authenticated workout workspace |
| `PUT` | `/api/data` | Firebase ID token | Save scoped, revision-checked changes |
| `DELETE` | `/api/data` | Firebase ID token | Reset the current account |
| `GET` | `/api/data/history` | Firebase ID token | Load an older history page |
| `POST` | `/api/nutrition/detect` | Firebase ID token | Read a nutrition label with Cloud Vision |
| `GET` | `/api/admin/users` | Admin Firebase account | Load privacy-safe user summaries |
| `POST` | `/api/admin/users` | Admin Firebase account | Run confirmed history cleanup actions |
| `POST` | `/api/maintenance/cleanup` | Google Scheduler OIDC | Delete accounts inactive for 30 days |

Private API responses are uncached. Workout writes use optimistic revisions, scoped validation, and conflict-safe merging.

## Local development

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env.local` and provide the Firebase web values.
3. Authenticate Application Default Credentials when server routes need Firestore locally.
4. Start the app:

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

Run the complete CI-equivalent sequence with:

```bash
npm run check
```

## Deployment

The multi-stage Docker image runs all checks before producing a non-root standalone Next.js image. `cloudbuild.yaml` builds, pushes, and deploys the image to the existing Cloud Run service. See `DEPLOYMENT_WORKFLOW.md` for the operational workflow.
