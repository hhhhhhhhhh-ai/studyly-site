# Studyly: setup guide (all free, for Netlify)

You will set up 4 free things. About 15 minutes total. Do them in this order.

| What | Service | Why |
|---|---|---|
| Put the files online | GitHub + Netlify | Hosting, and it makes the AI function work |
| Real AI | Google AI Studio (Gemini) | Answers, photo reading, link reading |
| Real database + accounts + photo storage | Supabase | Accounts that work on every device |
| Connect them | `config.js` | 3 lines to fill in |

## Step 1. Put the site online (GitHub + Netlify)
Use Git, not drag-and-drop. Netlify Drop only publishes static files, so the AI function would not run.
This zip has **no folders**, so you can upload everything at once.
1. Make a free account on github.com. Click **New repository**, name it (for example `studyly-site`), click **Create repository**.
2. Click **uploading an existing file**. Unzip `studyly.zip` on your computer, select **all the files** inside and drag them into the page. Click **Commit changes**.
3. **Add the AI file (one file needs a folder).** In your repo click **Add file > Create new file**. In the name box type exactly `netlify/functions/ai.js` (when you type each `/`, GitHub turns it into a folder). Open `ai-function.js` from the zip in any text editor, copy everything, paste it into the big box, click **Commit changes**. You can then delete `ai-function.js` from the repo, it is only there for copying.
4. Make a free account on netlify.com. Click **Add new project > Import an existing project > GitHub**, choose your repo.
5. Leave Build command empty. Publish directory: `.` (already set in `netlify.toml`). Click **Deploy**.
6. You get a `something.netlify.app` address. The landing page is there and the app is at `/app` (or `/app.html`).

## Step 2. Free AI key (Google Gemini)
1. Go to https://aistudio.google.com/apikey and sign in with Google.
2. Click **Create API key** and copy it.
3. In Netlify: **Project configuration > Environment variables > Add a variable**.
   - Key `GEMINI_API_KEY`, value = your key. Save.
The key stays on Netlify's server. Nobody can see it in the site's code.

## Step 3. Free database (Supabase)
1. Go to https://supabase.com, sign up, click **New project**. Pick a name, a password (save it) and the region closest to your users. Wait ~2 minutes.
2. Left menu **SQL Editor > New query**. Open `supabase-setup.sql` from this project, paste everything, click **Run**. This creates the private data table and the private photo storage.
3. Left menu **Authentication**, then the email sign-in settings (Sign In / Providers > Email). Turn **Confirm email** OFF. This lets people sign up and start right away, without an email step.
4. Left menu **Project Settings > API** (or API Keys). Copy the **Project URL** and the **anon / publishable key**. These two are made to be public, and the database rules keep each user's data private to them.
5. Back in Netlify environment variables, add two more: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same values). With these set, only logged-in users can use your AI quota.

## Step 4. Connect everything (`config.js`)
On GitHub open `config.js`, click the pencil, fill in:
```js
AI_ENDPOINT: "/.netlify/functions/ai",
SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
SUPABASE_ANON_KEY: "YOUR-ANON-OR-PUBLISHABLE-KEY",
```
Click **Commit changes**. Netlify redeploys by itself in about a minute.

## Test it
Open `your-site.netlify.app/app`, create an account, ask a question in Homework help, save a note with a photo. In Supabase, **Table Editor > user_data** should show your row.

## Good to know
- **Free limits:** Netlify's free plan is measured in monthly credits and pauses the site if you run out. Gemini's free tier has per-minute and per-day limits, so a busy site may see "try again in a minute". Supabase free projects can pause after about a week with no activity (restart from the dashboard), and include 500 MB database and 1 GB file storage.
- **Privacy:** Google's free Gemini tier may allow your students' prompts and photos to be used to improve Google products. Check Google's current terms, and tell your users.
- **AI timeout:** Netlify functions on the free plan stop after about 10 seconds by default. Very long answers or several photos plus links may time out. Shorter questions are fine.
- **Deleting accounts:** "Delete account" in Settings removes the user's data and photos. To remove the login itself, delete the user in Supabase > Authentication > Users.
- **No Supabase / no AI keys?** Leave those lines empty and the site still runs: accounts stay in each visitor's browser and the AI is in demo mode.

## Things you can change in `config.js`
`APP_NAME`, `INSTALLER_URL` (the Windows installer the Download button gives), `SOURCE_URL` (set it when the code is public; the "Source code" button says "coming soon" until then).

## Files
`index.html` landing · `app.html` + `app.js` + `app.css` web app · `ai-function.js` copy this into `netlify/functions/ai.js` on GitHub · `supabase-setup.sql` database · `config.js` settings
