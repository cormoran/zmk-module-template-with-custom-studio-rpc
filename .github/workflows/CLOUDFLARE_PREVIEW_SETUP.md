# Cloudflare Pages Preview Deployment Setup

This document explains how to set up and use the Cloudflare Pages preview deployment workflow for the web UI.

## Overview

The `cloudflare-preview.yml` workflow allows you to manually deploy web UI previews to Cloudflare Pages from pull requests. This helps reduce the number of deployments to stay within Cloudflare's free tier while still allowing preview deployments when needed.

## Features

- **Manual Trigger**: Deploy only when needed from pull request
- **Automatic Change Detection**: Checks if web UI files have changed before deploying
- **PR Comments**: Automatically posts deployment URL as a comment on the pull request
- **Concurrent Deployment Control**: Prevents multiple deployments for the same PR

## Setup Instructions

### 1. Create a Cloudflare Pages Project

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Pages**
3. Click **Create a project**
4. Choose **Direct Upload** (we'll deploy via GitHub Actions)
5. Name your project (e.g., `zmk-module-web-ui`)
6. Complete the setup

### 2. Get Cloudflare API Token

1. In Cloudflare Dashboard, go to **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template or create a custom token with:
   - Permissions:
     - **Account** → **Cloudflare Pages** → **Edit**
   - Account Resources:
     - Include → **Your Account**
4. Click **Continue to summary** → **Create Token**
5. **Copy the token** (you won't be able to see it again)

### 3. Get Cloudflare Account ID

1. In Cloudflare Dashboard, go to **Pages** → **Your Project**
2. On the right sidebar, find **Account ID**
3. Copy the Account ID

### 4. Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add the following repository secrets:
   - `CLOUDFLARE_API_TOKEN`: Your API token from step 2
   - `CLOUDFLARE_ACCOUNT_ID`: Your Account ID from step 3

### 5. Update Project Name (if needed)

If you named your Cloudflare Pages project something other than `zmk-module-web-ui`, update the workflow file:

```yaml
# In .github/workflows/cloudflare-preview.yml
projectName: your-project-name  # Change this line
```

## Usage

### Deploying a Preview

1. Create a pull request with changes to the `web/` or `proto/` directories
2. Go to the **Actions** tab in your repository
3. Select the **Deploy Web UI Preview to Cloudflare Pages** workflow
4. Click **Run workflow**
5. Enter the PR number (or leave empty if the workflow is run from the PR branch)
6. Click **Run workflow**

The workflow will:
1. Check if the PR has web UI changes
2. If changes exist, build and deploy the web UI
3. Post a comment on the PR with the preview URL

### Preview URL

After deployment, you'll get two URLs in the PR comment:

- **Preview URL**: A unique URL for this deployment (e.g., `https://abc123.zmk-module-web-ui.pages.dev`)
- **Alias URL**: A branch-based URL (e.g., `https://feature-branch.zmk-module-web-ui.pages.dev`)

### Updating a Preview

To update an existing preview:
1. Push new changes to the PR branch
2. Manually trigger the workflow again from the Actions tab

The workflow will update the existing PR comment with the new deployment information.

## Workflow Behavior

### When Changes Are Detected

The workflow compares the PR branch with the `main` branch and checks for changes in:
- `web/` directory
- `proto/` directory (since proto changes affect generated TypeScript types)

### Skipping Deployment

The workflow will skip deployment if:
- No PR number is provided and the current branch is not associated with a PR
- No changes are detected in `web/` or `proto/` directories

## Troubleshooting

### "No PR number provided or found"

- Make sure to provide the PR number when triggering the workflow
- Or trigger the workflow from the PR branch

### "No web UI changes detected"

- The PR doesn't have changes in `web/` or `proto/` directories
- This is normal behavior to save deployment quota

### Deployment Failed

- Check that Cloudflare secrets are correctly set
- Verify the project name matches your Cloudflare Pages project
- Check Cloudflare API token permissions

## Cost Optimization

This workflow is designed to minimize Cloudflare Pages deployments:

- **Manual trigger only**: No automatic deployments on every push
- **Change detection**: Skips deployment if web UI hasn't changed
- **Single deployment per PR**: Concurrency controls prevent duplicate deployments

Cloudflare Pages free tier includes:
- 500 builds per month
- Unlimited requests
- Unlimited bandwidth

By using manual triggers, you can easily stay within the free tier limits.

## Further Customization

### Change Base Branch

To compare against a different branch (not `main`):

```yaml
# In .github/workflows/cloudflare-preview.yml
BASE_BRANCH="main"  # Change this to your base branch
```

### Add More File Patterns

To deploy when other files change:

```yaml
# In .github/workflows/cloudflare-preview.yml
CHANGED_FILES=$(git diff --name-only origin/$BASE_BRANCH...HEAD -- web/ proto/ other-directory/ || true)
```

## See Also

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [cloudflare/pages-action](https://github.com/cloudflare/pages-action)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
