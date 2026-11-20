# Communication360 Campaign Portal

## Database-backed templates

The campaign type and template selectors are populated from active rows in
`master."TemplateCatalog"`. Each active row provides the template ID, file,
campaign type, display name, email subject, and optional PDF attachment path.
The API looks the selected template up again before submitting email, so client
requests cannot select inactive or unregistered template files.

The database must have the `master."TemplateCatalog"` table and the fields
`"TemplateId"`, `"TemplateFile"`, `"CampaignType"`, `"DisplayName"`, `"Subject"`,
`"PdfPath"`, and `"IsActive"`. Database access uses the settings below.

## Configuration

Create a portal-local `.env` file by copying `.env.example`, then fill in the
PostgreSQL password and SMTP credentials:

```powershell
Copy-Item .env.example .env
```

The API and dashboard stats service load `.env` from the Communication360
project directory. Existing process environment variables take precedence.
Alternatively, set `PORTAL_ENV_FILE` to an absolute path for a different `.env`
before launching the startup script. For example, to use the EmailReader file:

```powershell
$env:PORTAL_ENV_FILE = 'C:\path\to\Study_2026\01. EmailReader\.env'
```

The `.env` file is ignored by Git; do not commit it.

The EmailReader project has its own `.env`. Copy the relevant `DB_*` values into
this portal's `.env`; use `SENDER_EMAIL` and `SENDER_PASSWORD` for SMTP rather
than assuming the EmailReader's `EMAIL` and `PASSWORD` are SMTP credentials.

`ALLOW_SQLITE_FALLBACK` defaults to `false` so a PostgreSQL failure is not hidden
by switching to an unrelated local database. Set it to `true` only when that
fallback is intentional. SQLite mode is available explicitly with `DB_TYPE=sqlite`.

Never put database or SMTP credentials in source files or commit them to version
control. For Gmail SMTP, use an application password and store it in
`SENDER_PASSWORD`.

Email templates use local assets from `assets/images/` in browser previews. For
sent email, images are embedded as inline MIME parts by default, so recipients do
not need access to the project or a local server. If the images are hosted
publicly, set `EMAIL_ASSETS_BASE_URL` to the HTTPS URL of the public images
folder (for example, `https://cdn.example.com/communication365/images`). The
sender then uses those public URLs instead of inline attachments.

## Start the portal

The startup script installs the packages listed in `requirements.txt`. Start
the portal with the environment variables configured in `.env`:

1. A static server in the project root (for example, `python -m http.server 3000`).
2. The campaign API in `Wrapper` (`python campaign_api.py`).
3. The dashboard stats API in `Wrapper` (`python dashboard_stats_api.py`).

Open `http://127.0.0.1:3000/app/index.html#create-campaign`. The campaign API listens on port 8001;
the catalog is unavailable until it can connect to PostgreSQL.

The workspace includes a read-only template preview at
`GET /preview?template_id=<id>`. It reads the active template selected from the
catalog and returns its subject and HTML without changing sending behavior.

## Tests

From the `Wrapper` directory, run:

```powershell
python -m unittest test_portal_env.py test_campaign_catalog.py test_email_assets.py
```
