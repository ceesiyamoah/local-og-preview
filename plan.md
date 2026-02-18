# OG Link Preview — Chrome Extension

## What it does
Click the extension icon on any page to see:
- OG tag preview card (image, title, description, URL)
- Twitter/X card tags alongside OG tags
- Social preview mockups (Facebook, Twitter/X, LinkedIn, Slack)
- Validation warnings for missing or misconfigured tags

## File Structure
```
og-preview-extension/
├── manifest.json
├── popup.html
├── popup.js
├── icon16.png
├── icon48.png
└── icon128.png
```

---

## Publishing to Chrome Web Store

### 1. Create a Developer Account
- Go to https://chrome.google.com/webstore/devconsole
- Sign in with your Google account
- Pay the **$5 one-time registration fee**
- Verify your email address

### 2. Prepare Store Assets
You need the following before uploading:

| Asset | Requirement |
|-------|-------------|
| Icon | 128x128 PNG (already have) |
| Screenshots | At least 1, size 1280x800 or 640x400 |
| Description | Short summary + detailed description |
| Category | Developer Tools |
| Privacy policy | Required for `<all_urls>` and `scripting` permissions |

#### Privacy Policy
Since the extension uses `<all_urls>` and `scripting`, Chrome requires a privacy policy URL. Create a simple one (GitHub Gist, Notion page, or hosted page) that states:
- The extension reads meta tags from the current page only
- No data is collected, stored, or transmitted to any server
- All processing happens locally in the browser

#### Store Description (draft)
> **OG Link Preview** lets you instantly inspect Open Graph and Twitter Card meta tags on any webpage. See how your links will appear when shared on Facebook, Twitter/X, LinkedIn, and Slack — with built-in validation to catch missing or misconfigured tags.
>
> Features:
> - View all OG and Twitter Card meta tags at a glance
> - Social preview mockups for Facebook, Twitter/X, LinkedIn, and Slack
> - Validation warnings for missing required tags, long descriptions, and more
> - Works on any URL — localhost, staging, or production

### 3. Create the ZIP
Zip only the contents of the extension folder (not the folder itself):
```bash
cd og-preview-extension
zip -r ../og-link-preview.zip .
```

### 4. Upload & Submit
1. Go to the Developer Dashboard → Items → **Add new item**
2. Upload `og-link-preview.zip`
3. Fill in the listing:
   - Name: **OG Link Preview**
   - Description: use draft above
   - Category: **Developer Tools**
   - Language: English
4. Upload at least 1 screenshot
5. Add your privacy policy URL
6. Click **Submit for review**

### 5. Review Timeline
- Typically **1–3 business days**
- If rejected, you'll get an email with reasons — fix and resubmit
- Once approved, the extension goes live on the Chrome Web Store
