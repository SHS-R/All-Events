# Events Available

A public events board for flyers. Visitors see this month first, with Upcoming and Past tabs, and can open each flyer's PDF. No login is needed to view.

- `index.html` is the public page.
- `admin.html` is your editor. It only works on a device you have unlocked with your GitHub access key.
- `data/flyers.json` is the list of flyers, dates and times.
- `flyers/` holds the PDFs and their preview images.

## One-time setup (about 10 minutes)

### 1. Create the repository
1. Go to https://github.com/new while signed in.
2. Repository name: `events-available` (or any name you like).
3. Choose **Public**. Free GitHub Pages needs a public repository.
4. Tick **Add a README file**, then click **Create repository**.

### 2. Upload the site
1. Unzip `events-available-site.zip` on your computer.
2. In your new repository, click **Add file**, then **Upload files**.
3. Open the unzipped folder and drag everything inside it (the `assets`, `data` and `flyers` folders, `index.html`, `admin.html` and this `README.md`) into the upload area. Drag the contents, not the folder itself.
4. Click **Commit changes**.

### 3. Turn on GitHub Pages
1. In the repository, open **Settings**, then **Pages** in the left menu.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, then click **Save**.
3. After a minute or two the page shows your address, for example `https://YOUR-USERNAME.github.io/events-available/`. That is the public link to share.

### 4. Make your access key
1. Go to https://github.com/settings/personal-access-tokens/new (Settings, Developer settings, Personal access tokens, Fine-grained tokens).
2. Name it `Events Available editor` and pick an expiration (for example, one year).
3. Under **Repository access**, choose **Only select repositories** and pick `events-available`.
4. Under **Permissions**, open **Repository permissions** and set **Contents** to **Read and write**. Leave everything else as is.
5. Click **Generate token** and copy it. GitHub shows it only once.

### 5. Unlock your editor
1. Open `https://YOUR-USERNAME.github.io/events-available/admin.html`.
2. Your username and repository name are usually filled in already. Paste the key and click **Unlock editing**.
3. Bookmark this page. You will not need the key again on this device unless you click **Lock this device** or the key expires.

## Day to day
- **Add flyers:** on the admin page, click **Add PDFs** or drag PDFs onto the page. Dates, times and In person / Online sessions are read automatically.
- **Fix a date or time:** click the card, edit, **Save**.
- **Remove a flyer:** click the card, **Remove flyer**, then click again to confirm.
- Changes appear on the public page about a minute after you save.

## Keeping it safe
- Anyone can open `admin.html`, but without your key GitHub refuses every change, so nobody else can edit.
- The key lives only in the browser where you unlocked it. Never send it to anyone or paste it anywhere else.
- If you think the key leaked, delete it at https://github.com/settings/personal-access-tokens and make a new one.
- When the key expires, the admin page will say so. Make a new key and unlock again.
- Everything in this repository is public, including the PDFs. Only add flyers meant for the public.
