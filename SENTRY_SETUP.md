# Sentry Setup

1. Create a project at https://sentry.io (free tier)
2. Copy the DSN
3. Add to VPS frontend build env:
   - Set VITE_SENTRY_DSN in the build environment
   - Or add to .env.production: VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
4. For GitHub Actions: add as repository secret VITE_SENTRY_DSN
