# On Track

A local-first focus timer built around staying with one thing. Progress, parked thoughts, and completed sessions are saved in your browser.

Run the private version with:

```bash
python3 -m http.server 4173 --directory on-track
```

Then open http://localhost:4173.

## Shared study-circle version

```bash
cd on-track
npm start
```

Open http://localhost:4174 — accounts do not work through the static `4173` preview. Create a circle, copy its invite link, and friends on the same deployed server can join it. The app shares only display name, current focus status/task, daily minutes, completed-session count, and streak.

## Free online deployment

1. Create a free Supabase project.
2. Open **SQL Editor**, paste in `supabase-setup.sql`, and press **Run**.
3. In **Project Settings → API**, copy the Project URL and the `service_role` secret. Never put that secret in browser code or commit it to GitHub.
4. Put this `on-track` folder in a GitHub repository.
5. In Render, choose **New → Blueprint**, connect the repository, and select `render.yaml`.
6. When Render asks for environment variables, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the two values from step 3.
7. Deploy and share the resulting `https://…onrender.com` address.

The Render blueprint uses its free web-service plan. Supabase stores accounts, profile photos, learning history, and rooms so Render restarts do not erase them. The app continues to use local JSON files when those two environment variables are absent.

Accounts use salted password hashing and the Supabase service key stays server-side. For a larger public launch, add password-reset/email verification and move profile images from database records to Supabase Storage.
