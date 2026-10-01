/* ============================================================
   THE ONLY FILE YOU NEED TO EDIT TO CUSTOMISE THE SITE
   ============================================================ */
window.CONFIG = {
  // Name shown everywhere.
  APP_NAME: "Studyly",

  // The Windows installer that the "Download" buttons give people.
  INSTALLER_URL: "https://github.com/hhhhhhhhhh-ai/keyhosh/raw/refs/heads/main/Studyly%20Installer.exe",

  // --- AI (free Google Gemini, runs safely on Netlify) ---
  // After deploying on Netlify, set this to: "/.netlify/functions/ai"
  // Empty = demo mode (simple built-in helpers, no real AI).
  AI_ENDPOINT: "/.netlify/functions/ai",

  // --- Database + accounts (free Supabase) ---
  // Paste the Project URL and the anon / publishable key from Supabase (Project Settings > API).
  // These two are designed to be public. Empty = accounts are saved in the visitor's browser only.
  SUPABASE_URL: "https://fwuhjuplqlsocsjhdmmt.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_CWjatNc89u1wbLKfF1SzZg_p8yWBuYu",

  // Link to the source code. Leave empty until you want it public:
  // the "Source code" button says "coming soon" while this is empty.
  SOURCE_URL: "",

  // Optional: force the web-app address used by the desktop shortcut.
  APP_URL: ""
};
