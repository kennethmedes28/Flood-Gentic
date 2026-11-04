# Sign-in and fair use

Who needs to sign in, the fair-use limits and how to ask for access. Part of the [Flood-Gentic README](../README.md).

# Sign-in and fair use

The assistant, the photo check and voice make real API calls to the model providers (Muse chat, SAM and speech-to-text), so they need a **Google or Facebook sign-in** (through Supabase). The dashboard, flood level,
evacuation centers, contacts and analytics pages are public, and **an emergency message is always answered without signing in**: the fixed 911 text and
the hotlines of your city, with no model call, so nobody in a flood is turned away. A message that hits a limit still gets the emergency answer if it is one.

Each signed-in account has fair-use limits (the Manila day and month). They are environment variables, so they can be changed without code:

| Limit | Default |
|---|---|
| Assistant messages per account per day | 20 |
| Photo checks per account per day | 3 |
| Voice sessions per account per day | 8 |
| Chat-model tokens per account per month | 150,000 |
| Messages for everyone together, per day (a circuit breaker) | 500 |
| Photo checks for everyone together, per day | 100 |

A used-up limit says what was used and when it starts again, and the page shows "Today: 3 of 20 messages". The counters live in Supabase and are updated atomically.

**Need access?** While the Google and Facebook sign-in apps are limited to approved accounts, or if you need access to the project's Supabase data, write to
**[kennethmedes28@gmail.com](mailto:kennethmedes28@gmail.com?subject=Flood-Gentic%20access%20request)** with the provider and the email on your account.
What is collected and how to have it deleted: the site's `/privacy` and `/data-deletion` pages (`frontend/src/app/privacy`, `frontend/src/app/data-deletion`).
