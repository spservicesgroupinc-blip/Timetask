# Backend Deployment Instructions

The backend for this application runs purely on **Google Apps Script**. The code is located in `backend/Code.gs`. 

## How to update your Google Apps Script

Whenever we make changes to `backend/Code.gs` (for instance, to fix permissions or add new features), the live environment will **not** automatically receive them. You must manually deploy the new code. 

**Follow these exact steps to update your active deployment to the latest version:**

1. Open `backend/Code.gs` in this editor and copy **all** the text.
2. Go to your Google Apps Script project (via Google Sheets > Extensions > Apps Script).
3. Paste the code, replacing all the previous code in `Code.gs`.
4. Click the **Save** icon (disk icon).
5. **CRITICAL STEP**: Do *not* just click "New Deployment". This will give you a different URL and break your app! 
   Instead, click **Deploy** -> **Manage Deployments**.
6. Find your Active deployment and click the **Edit** pencil icon.
7. Under the **Version** dropdown, select **New version**.
8. Click **Deploy**.

This guarantees that your existing `GOOGLE_SCRIPT_URL` keeps working, but now it uses the new unrestricted codebase that allows standard users to save shifts.
