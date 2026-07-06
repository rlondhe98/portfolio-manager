// Google Auth Module - handles OAuth2 sign-in/sign-out
const GoogleAuth = {
    CLIENT_ID: '1053905145110-6b8osbnt2is4fbiv36v8282ohv3tk5m9.apps.googleusercontent.com',
    SCOPES: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
    tokenClient: null,
    accessToken: null,
    user: null,

    // Initialize Google Identity Services
    init() {
        return new Promise((resolve) => {
            // Wait for Google Identity Services to load
            if (typeof google === 'undefined' || !google.accounts) {
                window.addEventListener('load', () => this._initTokenClient(resolve));
            } else {
                this._initTokenClient(resolve);
            }
        });
    },

    _initTokenClient(resolve) {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.CLIENT_ID,
            scope: this.SCOPES,
            callback: (response) => {
                if (response.error) {
                    console.error('Auth error:', response.error);
                    showToast('Sign-in failed. Please try again.');
                    return;
                }
                this.accessToken = response.access_token;
                this._fetchUserInfo().then(() => {
                    this._saveSession();
                    this._updateUI();
                    // Trigger sync after sign-in
                    if (typeof SheetsBackend !== 'undefined') {
                        SheetsBackend.init();
                    }
                });
            }
        });

        // Check for existing session, then update UI
        this._restoreSession().then(() => {
            this._updateUI();
            resolve();
        });
    },

    // Sign in
    signIn() {
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken();
        }
    },

    // Sign out
    signOut() {
        // Just clear local session, don't revoke permissions on Google's side
        // so user won't be asked for permissions again on next login
        this.accessToken = null;
        this.user = null;
        localStorage.removeItem('pm_google_token');
        localStorage.removeItem('pm_google_user');
        // Clear local data so dashboard is empty
        localStorage.removeItem('pm_investments');
        localStorage.removeItem('pm_debts');
        // Keep pm_spreadsheet_id so re-login finds the same sheet
        this._updateUI();
        showToast('Signed out successfully');
    },

    // Check if signed in
    isSignedIn() {
        return !!this.accessToken;
    },

    // Get access token for API calls
    getToken() {
        return this.accessToken;
    },

    // Fetch user info from Google
    async _fetchUserInfo() {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            if (response.ok) {
                this.user = await response.json();
            }
        } catch (e) {
            console.error('Failed to fetch user info:', e);
        }
    },

    // Save session to localStorage
    _saveSession() {
        if (this.accessToken) {
            localStorage.setItem('pm_google_token', this.accessToken);
        }
        if (this.user) {
            localStorage.setItem('pm_google_user', JSON.stringify(this.user));
        }
    },

    // Restore session from localStorage
    async _restoreSession() {
        const token = localStorage.getItem('pm_google_token');
        const user = localStorage.getItem('pm_google_user');
        if (token) {
            this.accessToken = token;
        }
        if (user) {
            try { this.user = JSON.parse(user); } catch (e) { /* ignore */ }
        }
        // Validate token if we have one
        if (this.accessToken) {
            await this._validateToken();
        }
    },

    // Validate stored token
    async _validateToken() {
        try {
            const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${this.accessToken}`);
            if (!response.ok) {
                // Token expired, clear it
                this.accessToken = null;
                this.user = null;
                localStorage.removeItem('pm_google_token');
                localStorage.removeItem('pm_google_user');
            }
        } catch (e) {
            // Network error, keep token for now
        }
    },

    // Update UI based on auth state
    _updateUI() {
        const signInBtn = document.getElementById('googleSignInBtn');
        const userInfo = document.getElementById('googleUserInfo');
        const syncStatus = document.getElementById('syncStatus');
        const sheetLink = document.getElementById('openSheetLink');
        const linkSheetBtn = document.getElementById('linkSheetBtn'); // NEW
        const signinGate = document.getElementById('signinGate');
        const appNav = document.getElementById('appNav');
        const appContent = document.getElementById('appContent');

        if (!signInBtn) return;

        if (this.isSignedIn()) {
            signInBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            userInfo.querySelector('.user-name').textContent = (this.user && (this.user.name || this.user.email)) || 'Connected';
            userInfo.querySelector('.user-avatar').src = (this.user && this.user.picture) || '';
            userInfo.querySelector('.user-avatar').style.display = (this.user && this.user.picture) ? 'block' : 'none';
            if (syncStatus) syncStatus.style.display = 'inline-flex';
            if (linkSheetBtn) linkSheetBtn.style.display = 'inline-flex'; // NEW
            
            // Show sheet link if we have a stored spreadsheet ID
            const sheetId = localStorage.getItem('pm_spreadsheet_id');
            if (sheetLink && sheetId) {
                sheetLink.href = `https://docs.google.com/spreadsheets/d/${sheetId}`;
                sheetLink.style.display = 'inline-flex';
            }
            // Show dashboard, hide gate
            if (signinGate) signinGate.style.display = 'none';
            if (appNav) appNav.style.display = '';
            if (appContent) appContent.style.display = '';
        } else {
            signInBtn.style.display = 'inline-flex';
            userInfo.style.display = 'none';
            if (syncStatus) syncStatus.style.display = 'none';
            if (sheetLink) sheetLink.style.display = 'none';
            if (linkSheetBtn) linkSheetBtn.style.display = 'none'; // NEW
            
            // Hide dashboard, show gate
            if (signinGate) signinGate.style.display = '';
            if (appNav) appNav.style.display = 'none';
            if (appContent) appContent.style.display = 'none';
        }
    }
};