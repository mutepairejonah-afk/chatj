# ChatApp — Render Deployment Guide

**Prepared by Manus AI**

## Deployment status

The uploaded project has been cleaned and prepared as a **Vite React single-page application** for deployment to a Render Static Site. The original Blueprint described a `backend` service that is not present in the uploaded archive, and the original Dockerfile started the Vite development server. Those mismatches have been removed from the deployment path.

| Area | Prepared state |
|---|---|
| Render service | Static Site defined in `render.yaml` |
| Build command | `npm ci && npm run build:spa` |
| Publish directory | `dist` |
| SPA routing | Render rewrite from `/*` to `/index.html` |
| Dependency installation | Reproducible `package-lock.json` regenerated and verified with `npm ci` |
| Production fallback | Multi-stage `Dockerfile` with Nginx and SPA routing |
| Local secrets | Removed from the project package; `.env.example` retained |
| Validation | Production build passes; ESLint passes with warnings only |

Render Blueprints use a `render.yaml` file to define services, and static services require a build command plus a published static-file directory.[1] Render recommends a rewrite to `/index.html` for applications that use client-side routing.[2]

## 1. Push the prepared project to GitHub

Create a new private or public GitHub repository, then commit the prepared project from the project directory:

```bash
git init
git add .
git commit -m "Prepare ChatApp for Render deployment"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Before pushing, verify that no local environment file contains real credentials:

```bash
find . -maxdepth 2 -type f \( -name '.env' -o -name '.env.production' \) -print
git status --short
```

Only `.env.example` should be retained as a deployment reference. The `.gitignore` file now ignores `.env.*` while explicitly allowing `.env.example`.

## 2. Create the Render service

In the [Render Dashboard](https://dashboard.render.com/), select **New → Blueprint**, connect the GitHub repository, and choose the branch containing `render.yaml`. Render should detect the Blueprint and propose a static service named `chatapp`.

If you create the service manually instead, use the following values.

| Render field | Value |
|---|---|
| Service type | Static Site |
| Repository | The GitHub repository containing this project |
| Branch | `main` |
| Build command | `npm ci && npm run build:spa` |
| Publish directory | `dist` |
| Auto-deploy | On commit, recommended |

Do not configure the uploaded project as the old `chatapp-backend` service. There is no `backend/` directory in the archive, so a backend-root build would fail. The frontend can still call an independently deployed API through `VITE_API_URL` when one is available.

## 3. Configure environment variables

The variables below are read by the browser bundle at build time. In Render, add them under the service's **Environment** settings before the first deploy. Variables prefixed with `VITE_` are intentionally exposed to the browser; never place service-role keys, private API keys, or session secrets in them.

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_SUPABASE_URL` | Yes | Public Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser-safe Supabase publishable/anon key |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Browser-safe Clerk publishable key |
| `VITE_API_URL` | If using an API | Public URL of the separately deployed backend, without a trailing slash |
| `VITE_APP_URL` | Recommended | Public Render URL or custom-domain URL |
| `VITE_TURN_URL` | Optional | TURN server URL for WebRTC calls |
| `VITE_TURN_USERNAME` | Optional | TURN username |
| `VITE_TURN_CREDENTIAL` | Optional | TURN credential |

For a first deployment, set `VITE_APP_URL` to the Render URL assigned after the initial service creation, then trigger a second deploy if the value was not known during the first build. A typical value is:

```text
https://chatapp.onrender.com
```

The exact service subdomain is assigned by Render and may differ from this example.

## 4. Configure Clerk and Supabase

In Clerk, add the Render URL to the application's allowed origins and redirect URLs. Use the publishable key in `VITE_CLERK_PUBLISHABLE_KEY`; do not add `CLERK_SECRET_KEY` to this static service because the uploaded project does not contain a server runtime for safely consuming it.

In Supabase, confirm that the deployed origin is allowed by the project's authentication and storage policies. Apply the SQL migrations under `supabase/migrations/` using the Supabase CLI or the Supabase SQL Editor before testing data-backed features. The `/setup` route is retained as a reference screen, but schema administration should be performed through controlled migrations rather than a browser-exposed service-role connection.

## 5. Deploy and verify

Click **Create Static Site** or apply the detected Blueprint. After the build completes, open the deployed URL and verify the following checks.

```bash
curl -I https://YOUR_RENDER_DOMAIN.onrender.com/
curl -I https://YOUR_RENDER_DOMAIN.onrender.com/login
curl -s https://YOUR_RENDER_DOMAIN.onrender.com/manifest.json
```

The `/login` request should return the SPA entry rather than a Render 404 because of the rewrite rule. In the browser, confirm that Clerk loads, Supabase requests use the configured project, and the browser console does not report missing `VITE_` variables.

For subsequent changes, push to the connected branch. Render will rerun the build command and publish the new contents of `dist` automatically.

## 6. Local verification before each deploy

Use Node.js 22 or a compatible current Node.js release locally, then run:

```bash
npm ci
npm run build:spa
npm run lint
```

The current project produces a successful production build. ESLint completes with warnings only; the warnings are existing React Hooks and Fast Refresh advisories and do not block the build. Preview the generated files locally with:

```bash
npm run preview -- --host 0.0.0.0 --port 4173
```

Then open `http://localhost:4173` and test direct navigation to `/`, `/login`, `/contacts`, `/settings`, and `/me`.

## 7. Optional Docker deployment

The repository also contains a production Docker fallback. It builds the SPA in a Node stage and serves `dist` with Nginx. This is not required when using the Static Site Blueprint, but it can be used if the project is later moved to a Render Docker Web Service.

```bash
docker build -t chatapp .
docker run --rm -p 10000:10000 -e PORT=10000 chatapp
```

The Docker image includes a `/health` response and an Nginx `try_files` fallback for client-side routes. If you use a Docker Web Service on Render, configure the service to use the repository `Dockerfile` and keep the application listening on the port provided by the `PORT` environment variable.

## 8. Important architecture note

This archive contains the frontend and Supabase migrations, but it does **not** contain the backend referenced by some legacy development comments and the old Blueprint. The prepared Render deployment therefore publishes the frontend only. Features that call `/api/*` or Socket.IO require a separately deployed compatible backend, and `VITE_API_URL` must point to that public backend URL. If the backend is added later, it should be deployed as a separate Render Web Service with its own private environment variables and CORS configuration.

## References

[1]: https://render.com/docs/blueprint-spec "Render Blueprint YAML Reference"

[2]: https://render.com/docs/redirects-rewrites "Render Static Site Redirects and Rewrites"
