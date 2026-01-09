# GitHub Pages Deployment Guide

## Quick Deployment Steps

Your Kentucky EMS Medication Reference app is ready to deploy! Follow these steps:

### Option 1: Deploy from Current Branch (Recommended)

1. **Go to your GitHub repository**
   - Navigate to https://github.com/djones0143/EMS

2. **Open Settings**
   - Click the "Settings" tab at the top of the repository

3. **Navigate to Pages**
   - In the left sidebar, click "Pages"

4. **Configure Source**
   - Under "Source", select the branch: `claude/ky-ems-medication-app-gsYLW`
   - Keep the folder as: `/ (root)`
   - Click "Save"

5. **Wait for Deployment**
   - GitHub will build and deploy your site (usually takes 1-2 minutes)
   - A green checkmark will appear when ready

6. **Access Your Site**
   - Your site will be available at: `https://djones0143.github.io/EMS/`
   - The URL will be shown at the top of the Pages settings

### Option 2: Create Main Branch (Alternative)

If you prefer to use the main branch:

1. **In your repository on GitHub.com:**
   - Go to the "Code" tab
   - Click the branch dropdown (currently showing your claude branch)
   - Type "main" in the text box
   - Click "Create branch: main from claude/ky-ems-medication-app-gsYLW"

2. **Then enable GitHub Pages:**
   - Go to Settings > Pages
   - Select "main" as the source branch
   - Click "Save"

3. **Access your site:**
   - URL: `https://djones0143.github.io/EMS/`

### Option 3: Use GitHub Actions (Advanced)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Pages
        uses: actions/configure-pages@v3

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: '.'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v2
```

## Verification

Once deployed, your site should:
- ✅ Load on mobile and desktop devices
- ✅ Display all 24 medications
- ✅ Allow searching and filtering
- ✅ Show detailed medication information in modals

## Troubleshooting

**Site shows 404 error:**
- Wait a few minutes for initial deployment
- Check that Pages is enabled in Settings
- Verify the correct branch is selected

**CSS/JS not loading:**
- Ensure all files (index.html, styles.css, app.js, medications.js) are in the root directory
- Check browser console for errors

**Changes not appearing:**
- GitHub Pages can take 1-2 minutes to update
- Clear your browser cache
- Try hard refresh (Ctrl+F5 or Cmd+Shift+R)

## Custom Domain (Optional)

To use a custom domain:

1. Add a CNAME file to your repository with your domain
2. Configure DNS settings with your domain provider
3. Update custom domain in GitHub Pages settings

## Next Steps

After deployment:
1. Test on multiple devices (phone, tablet, desktop)
2. Share the URL with your EMS team
3. Bookmark on mobile devices for quick access
4. Consider adding to home screen on mobile for app-like experience

Your app is now live and accessible to Kentucky EMS providers! 🚑
