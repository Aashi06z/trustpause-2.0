# TrustPause 2.0 — The Ambient Human Firewall

TrustPause runs quietly in the background and intervenes only when digital content begins
pushing the user toward a risky action. It detects the dangerous moment — not everything —
and places a moment of safety between manipulation and action.

**Core promise:** *Quiet when you are safe. Present when judgment is under attack.*

## What's inside

A high-fidelity interactive simulator (Next.js + React + TypeScript) with two experiences:

### `/` — Interactive Simulator (home)

A self-contained demo surface for judges and users, in a modern dark-glass cybersecurity theme:

| Feature | What it does |
| --- | --- |
| **Live risk badge** | Real-time Cognitive Risk Score (0–100) that animates as each simulation unfolds (emerald / amber / crimson) |
| **Platform mode toggle** | Flip the same simulation between a Mobile phone frame and a Desktop view with live TrustPause telemetry |
| **Bank KYC link** | Fake SMS → tap “Open Link” → a 10-second countdown pause reveals the domain mismatch and offers the official bank app |
| **UPI money request** | Pay ₹18,000 to a new UPI ID → “NEW RECIPIENT DETECTED” Money Pause requires a physical 3-second hold to override |
| **Digital-arrest call** | Ringing call → live Risk Card (claimed authority + secrecy + unverified VoIP) with End & Report / Verify via 1930 |
| **Deepfake emergency** | Played voice clip → score breakdown (Fear +20 · Urgency +15 · Secrecy +20 · synthetic markers +30 = 85/100) |
| **Architecture drawer** | Collapsible privacy spec: CallScreeningService, link intents, accessibility hooks — no 24/7 background recording |

### `/dashboard` — Full operations dashboard

| Feature | What it does |
| --- | --- |
| **Overview** | Live dashboard with metrics, current status, and recent interventions |
| **Live Protection** | The five guardians, a working Link Guardian URL analyzer, and a QR Guardian that scans real QR codes with your camera |
| **Threat Lab** | Five interactive simulations — Message, Link tap, Call, Payment, Media — each writing to your live Risk Events log |
| **Risk Events** | Filterable audit trail with detail view and CSV export (simulator actions log here too) |
| **Trust Circle** | Full CRUD trusted contacts with hashed verification phrases (local + Firebase sync) |
| **Insights** | Computed from your real event history |
| **Settings** | Seven guardian toggles that actually change behavior in the Threat Lab |
| **AfterTap Rescue** | Step-by-step recovery checklists with official reporting links, copy/download summary |
| **How it works** | The three-layer intervention model explained |

## Run it locally

```bash
npm install
npm run dev
```

Open the printed local URL. No environment variables or backend are required —
everything works in local-first mode with browser storage.

### Check, test, build

```bash
npm run typecheck   # TypeScript, no emit
npm test            # vitest — risk engine, link guardian, trust circle, events, aftertap
npm run build       # production build (static export ready for Vercel)
```

### Firestore rules tests (requires Firebase emulator)

```bash
npm run test:rules
```

## Make it live (deploy)

The app is a standard Next.js project and deploys as-is to Vercel. **npm is the package
manager** (the pnpm lockfile scaffold was removed so Vercel's auto-detection uses npm).
The app runs in local-first mode out of the box — **no environment variables are required**.

### Fastest path — Vercel folder upload (no git needed)

```bash
npx vercel login          # one-time: opens your browser to authenticate
npx vercel                # preview deploy (optional)
npx vercel --prod         # production deploy — uploads this folder as-is
```

### Git path — GitHub import

1. `git init && git add -A && git commit -m "TrustPause 2.0"`
2. Create an empty repo on GitHub, then `git remote add origin <url> && git push -u origin main`
3. In Vercel: **Add New → Project → Import** the repo (framework preset: Next.js; no
   build settings needed).
4. Deploy. You get a URL like `https://<project>.vercel.app` immediately, and every
   future push to `main` auto-deploys.

### Optional: Vercel Web Analytics

Set `NEXT_PUBLIC_VERCEL_ANALYTICS=true` in the Vercel project's environment settings
and enable **Web Analytics** for the project. It is off by default so no 404 occurs on
non-Vercel or local hosts.

### Optional backend sync

Copy `.env.example` to `.env.local` and enable one backend to sync risk events,
settings, and Trust Circle contacts across devices.

**Supabase**

1. Create a project and run the migrations in `supabase/migrations/`.
2. Enable **anonymous sign-ins** in Auth settings.
3. Set:
   - `NEXT_PUBLIC_SUPABASE_ENABLED=true`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Firebase**

1. Create a project and enable **Anonymous** auth provider and **Cloud Firestore**.
2. Deploy the security rules: `npx firebase deploy --only firestore:rules`.
3. Set `NEXT_PUBLIC_FIREBASE_ENABLED=true` plus the config values from
   Project settings → General → Your apps.

> TrustPause is a prototype: it models approved integration points (link
> interception, consent-based message analysis, caller identification, payment
> hooks, media checks). It does not monitor devices or record conversations.