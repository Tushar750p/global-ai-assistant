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

Never commit `.env` or expose your OpenAI API key in frontend code.

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
- OpenAI secrets as Render-managed environment variables (`sync: false`)

To deploy it, connect the repository to Render and create a **Blueprint** from `render.yaml`. Render will prompt for the secret `OPENAI_API_KEY` instead of storing it in Git.

The Blueprint uses the Singapore region and a small paid PostgreSQL plan for a persistent deployment. Review Render pricing and plans before creating production resources.

## Production environment variables

Required:

- `OPENAI_API_KEY`
- `DATABASE_URL` (automatically supplied by the Render Blueprint, or set manually)

Optional:

- `OPENAI_MODEL` (default: `gpt-5.6-luna`)
- `OPENAI_TRANSCRIBE_MODEL` (default: `gpt-4o-transcribe`)
- `OPENAI_TTS_MODEL` (default: `gpt-4o-mini-tts`)
- `OPENAI_TTS_VOICE` (default: `coral`)
- `NODE_ENV=production`

## Security notes

- API credentials stay server-side.
- Passwords are stored using scrypt-derived hashes.
- Session tokens are stored as SHA-256 hashes in PostgreSQL.
- Production session cookies use `HttpOnly`, `SameSite=Lax`, and `Secure`.
- Uploaded files and request payloads have size/type validation.
- The application applies rate limiting and common security headers.

## Important deployment limitation

CI validates the application and its regression suite, but a successful CI run does not prove that an external OpenAI account or Render deployment is working. After the final code audit, configure the production secrets and deploy the Blueprint before the public production launch.

## Roadmap

1. Production security hardening
2. Database integration tests
3. Usage metering and quotas
4. Payments/subscriptions
5. Observability and error tracking
6. Tool/agent system
7. Team/workspace features
8. Scalable production architecture
