# Global AI Assistant

A production-oriented, multilingual AI assistant built with Node.js, Express, PostgreSQL, and OpenAI APIs.

## Current features

- Multilingual chat with automatic language matching
- Persistent authenticated conversations
- Register, login, logout, and HttpOnly session cookies
- Conversation create, open, rename, and delete
- PDF, TXT, CSV, DOCX, and XLSX document input
- Image input and vision analysis
- Browser voice input with transcription
- Optional text-to-speech responses
- Optional web search with source extraction
- Local conversation cache plus cloud persistence for signed-in users
- Free/Pro plans with monthly usage quotas
- Stripe Checkout subscription architecture and signed webhooks
- Request rate limiting and security headers
- Automated smoke/security regression tests
- GitHub Actions CI
- Render Blueprint for Node.js + managed PostgreSQL deployment

## Run locally

1. Install Node.js 20+.
2. Clone this repository.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Add `OPENAI_API_KEY` to `.env`.
6. Add `DATABASE_URL` if you want authentication and cloud conversations.
7. Run `npm start`.
8. Open `http://localhost:3000`.

Never commit `.env` or expose your OpenAI or Stripe secret keys in frontend code.

## Tests

```bash
npm test
```

The GitHub Actions workflow also checks JavaScript syntax and runs the smoke/security suite on pushes and pull requests to `main`.

## Render deployment

The repository contains `render.yaml`, a Render Blueprint that defines:

- a Node.js web service
- a managed PostgreSQL database
- `DATABASE_URL` wired from the database connection string
- production `NODE_ENV`
- `/api/health` as the health-check endpoint
- OpenAI and Stripe secrets as Render-managed environment variables (`sync: false`)

To deploy it, connect the repository to Render and create a **Blueprint** from `render.yaml`. Render will prompt for the secret values instead of storing them in Git.

The Blueprint uses the Singapore region and a small paid PostgreSQL plan for a persistent deployment. Review Render pricing and plans before creating production resources.

## Production environment variables

Required for the core AI app:

- `OPENAI_API_KEY`
- `DATABASE_URL` (automatically supplied by the Render Blueprint, or set manually)

Required for live Stripe billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

Optional billing redirects:

- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

Other optional variables:

- `OPENAI_MODEL` (default: `gpt-5.6-luna`)
- `OPENAI_TRANSCRIBE_MODEL` (default: `gpt-4o-transcribe`)
- `OPENAI_TTS_MODEL` (default: `gpt-4o-mini-tts`)
- `OPENAI_TTS_VOICE` (default: `coral`)
- `NODE_ENV=production`

## Stripe billing setup

The application uses Stripe Checkout in subscription mode. Stripe sends subscription lifecycle events to `/api/billing/webhook`; the server verifies the webhook signature and updates the user's Pro/Free plan in PostgreSQL. The webhook middleware is registered before the global JSON parser so Stripe's raw request body remains available for signature verification.

Configure billing in Stripe test mode first:

1. Create a **Pro** product and recurring Price in Stripe.
2. Copy the Price ID into `STRIPE_PRO_PRICE_ID`.
3. Copy the Stripe secret key into `STRIPE_SECRET_KEY`.
4. Create a webhook endpoint at `https://YOUR-DOMAIN/api/billing/webhook`.
5. Subscribe the endpoint to: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, and `customer.subscription.resumed`.
6. Copy the endpoint signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
7. Set `STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL` if you want custom post-Checkout redirects.
8. Run a test subscription and confirm that the account changes to Pro only after the signed Stripe subscription event is processed.

Stripe recommends testing webhook handlers with the Stripe CLI before going live.

Do not put Stripe secret keys or webhook signing secrets in GitHub source, frontend JavaScript, or committed `.env` files.

## Security notes

- API credentials stay server-side.
- Passwords are stored using scrypt-derived hashes.
- Session tokens are stored as SHA-256 hashes in PostgreSQL.
- Production session cookies use `HttpOnly`, `SameSite=Lax`, and `Secure`.
- Uploaded files and request payloads have size/type validation.
- The application applies rate limiting and common security headers.
- Stripe webhook signatures are verified against the raw request body.
- Billing events are recorded idempotently to prevent duplicate webhook processing.

## Important deployment limitation

CI validates the application and its regression suite, but a successful CI run does not prove that an external OpenAI account, Stripe account, or Render deployment is working. Configure the production secrets, deploy the Blueprint, and complete a Stripe test-mode payment/webhook flow before the public production launch.

## Roadmap

1. Production security hardening
2. Observability and error tracking
3. Tool/agent system
4. Team/workspace features
5. Scalable production architecture
