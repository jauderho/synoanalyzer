# SynoAnalyzer

A single-file web app for uploading, analyzing, and visualizing [Synology Hyper Backup](https://www.synology.com/en-global/dsm/feature/hyper_backup) configuration files (`synobackup.conf`). Gives you an at-a-glance view of your backup coverage, integrity check configuration, and actionable recommendations — without logging into DSM.

![Dark mode screenshot](docs/screenshot-dark.png)

---

## Features

- **📂 Config upload** — drag-and-drop or click-to-browse; supports Hyper Backup 4.x native `.conf` format as well as JSON
- **🗂 Task overview** — per-task cards showing source folders, destination type (S3 cloud vs. local USB), encryption, compression, version retention, and notification status
- **🔄 3-2-1 coverage matrix** — hierarchical path analysis that correctly accounts for parent/child relationships between backup paths and explicit exclusion filters; surfaces gaps where a path lacks a cloud or local copy
- **🔍 Integrity check status** — shows whether integrity checking is enabled per task, when it was first configured, any time limits, and the DSM scheduler reference ID
- **📁 Directory browser** — all source paths with auto-detected type labels (Home, Media, VM, Backup, Data), backed-up DSM applications, and configured exclusion filters
- **💡 Recommendations engine** — severity-ranked suggestions (HIGH / MEDIUM / LOW / GOOD) based on backup best practices, covering:
  - Missing or insufficient encryption
  - VM backups without integrity checks
  - Too few version retention copies for VMs
  - Missing transport encryption on cloud (S3) tasks
  - Disabled failure notifications
  - No compression on non-media tasks
  - Incomplete 3-2-1 coverage gaps
- **🌙 Dark / light mode** — toggle persisted via `localStorage`

---

## Supported Format

SynoAnalyzer parses the native **Synology Hyper Backup 4.x** `synobackup.conf` format — a hybrid INI/JSON file with `[global]`, `[repo_N]`, and `[task_N]` sections where values may be bare booleans, integers, unquoted JSON arrays/objects, or outer-quoted strings containing escaped inner JSON (e.g. `incheck_info`).

Example structure:

```ini
[global]
version="4.1.2-4045"

[repo_1]
trans_type="image_local"
remote_share="usbshare2-2"
target_type="image"

[task_1]
name="Local Home Backup"
repo_id=1
backup_folders=["/homes","/u001"]
backup_apps=["HyperBackup","LogCenter"]
enable_data_encrypt=true
data_compress_type=1
enable_notify=true
rotate_condition="[1,256]"
incheck_info="{\"data_enable\":true,\"date\":\"2023/11/20\",\"time_limit\":30}\n"
incheck_sched_id=5
sched_id=4
```

> **Note on schedules:** Backup schedules (`sched_id`) and integrity check schedules (`incheck_sched_id`) reference entries in the DSM task scheduler database, which is not stored in `synobackup.conf`. SynoAnalyzer displays the IDs for reference; actual schedule times are only visible in DSM.

> **Note on `incheck_info.date`:** This field records when integrity checking was *first enabled* on the task, not the date of the last integrity check run. Last-run history is only available in DSM → Hyper Backup → select task → Backup Explorer.

---

## Usage

SynoAnalyzer is a zero-dependency, zero-build single HTML file. No Node.js, no npm, no server required.

### Local

```bash
# Clone the repo
git clone https://github.com/jauderho/synoanalyzer.git
cd synoanalyzer

# Open directly in your browser
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

Then click **Upload** and select your `synobackup.conf`, or click **Load sample config** to explore with demo data.

### Where to find synobackup.conf on your Synology NAS

The config file lives at:

```
/usr/syno/etc/packages/HyperBackup/synobackup.conf
```

Access it via SSH:

```bash
ssh admin@your-nas-ip
sudo cp /usr/syno/etc/packages/HyperBackup/synobackup.conf ~/synobackup.conf
```

Or copy it to a shared folder and download it via File Station.

---

## Deployment

### Cloudflare Pages (recommended)

The fastest way to host SynoAnalyzer on a public or private URL with a global CDN.

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name synoanalyzer
```

This produces a URL like `https://synoanalyzer.pages.dev`. Add a custom domain in the Cloudflare Dashboard → Pages → your project → Custom domains.

### Cloudflare Workers

Useful if you want to add server-side logic later (authentication, R2 storage for saved configs, etc.).

**`wrangler.toml`**
```toml
name = "synoanalyzer"
main = "src/worker.js"
compatibility_date = "2024-11-01"

rules = [
  { type = "Text", globs = ["**/*.html"] }
]
```

**`src/worker.js`**
```javascript
import html from './synoanalyzer.html';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'unsafe-inline'",
            "style-src 'unsafe-inline' https://fonts.googleapis.com",
            "font-src https://fonts.gstatic.com",
            "connect-src 'none'",
          ].join('; '),
        },
      });
    }
    return new Response('Not found', { status: 404 });
  },
};
```

```bash
cp index.html src/synoanalyzer.html
npx wrangler deploy
```

### Any static host

Because SynoAnalyzer is a single HTML file it can be served from any static hosting provider — GitHub Pages, Netlify, Vercel, an S3 bucket with static website hosting, or a plain nginx/Caddy server.

```nginx
# Minimal nginx config
server {
    listen 80;
    server_name synoanalyzer.example.com;
    root /var/www/synoanalyzer;
    index index.html;
}
```

---

## Privacy

All processing happens entirely in the browser. No config data, file contents, or analysis results are ever uploaded to any server. The app makes no outbound network requests (only Google Fonts are loaded from an external CDN at page load).

---

## Limitations

- **Schedule times are not shown.** Hyper Backup stores backup and integrity check schedules in the DSM task scheduler database (`/etc/synoscheduler/`), not in `synobackup.conf`. Only the scheduler reference IDs (`sched_id`, `incheck_sched_id`) are available in the config file.
- **Last-run dates are not shown.** Run history is stored in per-task SQLite databases on the NAS, not in the config file.
- **Volume-level backup tasks** (`backup_volumes`) are parsed but not yet visualized — only folder-level tasks are fully represented.
- Tested against Hyper Backup **4.x** config format. Older DSM 6.x backup task configs use a different schema and are not supported.

---

## License

MIT
