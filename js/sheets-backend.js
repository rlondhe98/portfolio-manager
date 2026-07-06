// Google Sheets Backend - syncs data with user's Google Sheet
const SheetsBackend = {
    SPREADSHEET_NAME: 'Portfolio Manager Data',
    spreadsheetId: null,
    isSyncing: false,
    _writingInProgress: false,

    // Initialize - find or create the spreadsheet
    async init() {
        if (!GoogleAuth.isSignedIn()) return;

        this.spreadsheetId = localStorage.getItem('pm_spreadsheet_id');

        try {
            if (this.spreadsheetId) {
                // Verify the spreadsheet still exists
                const valid = await this._verifySpreadsheet();
                if (!valid) {
                    this.spreadsheetId = null;
                    localStorage.removeItem('pm_spreadsheet_id');
                }
            }

            if (!this.spreadsheetId) {
                // Search for existing spreadsheet or create new one
                this.spreadsheetId = await this._findSpreadsheet();
                if (!this.spreadsheetId) {
                    this.spreadsheetId = await this._createSpreadsheet();
                    // Push local data to newly created sheet
                    await this._pushLocalDataToSheet();
                } else {
                    // Found existing sheet, pull data from it
                    await this.pullFromSheet();
                }
                localStorage.setItem('pm_spreadsheet_id', this.spreadsheetId);
            } else {
                // Pull latest data from sheet
                await this.pullFromSheet();
            }

            this._updateSyncStatus('synced');
            this._updateSheetLink();
            // Pull emergency fund data (silently - may not exist yet)
            if (typeof EmergencyFund !== 'undefined') {
                try { await EmergencyFund.pullFromSheet(); } catch(e) { /* sheet may not exist */ }
            }
            showToast('Connected to Google Sheets');
        } catch (err) {
            console.error('Sheets init error:', err);
            if (err.status === 401) {
                GoogleAuth.signOut();
                showToast('Session expired. Please sign in again.');
            } else {
                this._updateSyncStatus('error');
                showToast('Failed to connect: ' + (err.message || JSON.stringify(err)));
            }
        }
    },

    // Sync investments to Google Sheet
    async syncInvestments(investments) {
        if (!GoogleAuth.isSignedIn() || !this.spreadsheetId) return;
        this._writingInProgress = true;
        this._updateSyncStatus('syncing');

        try {
            await this._writeSheet('Investments', investments, [
                'id', 'name', 'type', 'schemeCode', 'units', 'initialCorpus', 'currentCorpus', 'investmentStartDate', 'monthlySIP', 'sipStartDate', 'expectedReturn', 'investmentHorizon', 'currency', 'ticker', 'shares', 'avgBuyPrice', 'sips', 'transactions'
            ]);
            this._updateSyncStatus('synced');
        } catch (err) {
            console.error('Sync investments error:', err);
            this._updateSyncStatus('error');
        } finally {
            this._writingInProgress = false;
        }
    },

    // Sync debts to Google Sheet
    async syncDebts(debts) {
        if (!GoogleAuth.isSignedIn() || !this.spreadsheetId) {
            console.warn('syncDebts skipped: signedIn=', GoogleAuth.isSignedIn(), 'sheetId=', this.spreadsheetId);
            return;
        }
        this._updateSyncStatus('syncing');

        try {
            await this._writeSheet('Debts', debts, [
                'id', 'name', 'type', 'loanAmount', 'interestRate', 'loanTenure', 'startDate', 'emiAmount'
            ]);
            this._updateSyncStatus('synced');
        } catch (err) {
            console.error('Sync debts error:', err);
            this._updateSyncStatus('error');
            showToast('Sync failed: ' + (err.message || JSON.stringify(err)));
        }
    },

    // Pull all data from Google Sheet
    async pullFromSheet() {
        if (!GoogleAuth.isSignedIn() || !this.spreadsheetId) return;
        // Don't overwrite local data while a write is in progress
        if (this._writingInProgress) return;

        try {
            const investments = await this._readSheet('Investments', [
                'id', 'name', 'type', 'schemeCode', 'units', 'initialCorpus', 'currentCorpus', 'investmentStartDate', 'monthlySIP', 'sipStartDate', 'expectedReturn', 'investmentHorizon', 'currency', 'ticker', 'shares', 'avgBuyPrice', 'sips', 'transactions'
            ]);
            const debts = await this._readSheet('Debts', [
                'id', 'name', 'type', 'loanAmount', 'interestRate', 'loanTenure', 'startDate', 'emiAmount'
            ]);

            // Parse numeric fields for investments
            const parsedInvestments = investments.map(inv => {
                const parsed = {
                    ...inv,
                    units: parseFloat(inv.units) || 0,
                    initialCorpus: parseFloat(inv.initialCorpus) || 0,
                    currentCorpus: parseFloat(inv.currentCorpus) || 0,
                    monthlySIP: parseFloat(inv.monthlySIP) || 0,
                    expectedReturn: parseFloat(inv.expectedReturn) || 0,
                    investmentHorizon: parseInt(inv.investmentHorizon) || 0
                };

                // Parse sips from JSON string
                if (inv.sips && typeof inv.sips === 'string' && inv.sips.startsWith('[')) {
                    try { parsed.sips = JSON.parse(inv.sips); } catch (e) { parsed.sips = []; }
                } else {
                    parsed.sips = [];
                }

                // Auto-create SIP entry from monthlySIP if sips array is empty
                if (parsed.sips.length === 0 && parsed.monthlySIP > 0) {
                    parsed.sips = [{
                        id: parsed.id + '_sip',
                        amount: parsed.monthlySIP,
                        startDate: parsed.sipStartDate || parsed.investmentStartDate || new Date().toISOString().split('T')[0],
                        endDate: '',
                        active: true,
                        installments: []
                    }];
                }

                return parsed;
            });

            // Parse numeric fields for debts
            const parsedDebts = debts.map(debt => ({
                ...debt,
                loanAmount: parseFloat(debt.loanAmount) || 0,
                interestRate: parseFloat(debt.interestRate) || 0,
                loanTenure: parseInt(debt.loanTenure) || 0,
                emiAmount: debt.emiAmount ? parseFloat(debt.emiAmount) : null
            }));

            // Update localStorage
            Storage.saveInvestments(parsedInvestments);
            Storage.saveDebts(parsedDebts);

            // Re-render
            if (typeof App !== 'undefined' && App.renderAll) {
                App.renderAll();
            }
        } catch (err) {
            console.error('Pull from sheet error:', err);
        }
    },

    // Push current localStorage data to sheet
    async _pushLocalDataToSheet() {
        const investments = Storage.getInvestments();
        const debts = Storage.getDebts();

        if (investments.length > 0) {
            await this.syncInvestments(investments);
        }
        if (debts.length > 0) {
            await this.syncDebts(debts);
        }
    },

    // API: Verify spreadsheet exists and is accessible
    async _verifySpreadsheet() {
        try {
            const response = await this._apiCall(
                `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?fields=spreadsheetId`
            );
            return response.ok;
        } catch {
            return false;
        }
    },

    // API: Find existing spreadsheet by name
    async _findSpreadsheet() {
        const query = encodeURIComponent(`name='${this.SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
        const response = await this._apiCall(
            `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`
        );

        if (!response.ok) return null;
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    },

    // API: Create new spreadsheet with proper structure
    async _createSpreadsheet() {
        const response = await this._apiCall(
            'https://sheets.googleapis.com/v4/spreadsheets',
            'POST',
            {
                properties: { title: this.SPREADSHEET_NAME },
                sheets: [
                    {
                        properties: { title: 'Investments', index: 0 },
                        data: [{
                            startRow: 0, startColumn: 0,
                            rowData: [{
                                values: ['id', 'name', 'type', 'currentCorpus', 'monthlySIP', 'expectedReturn', 'investmentHorizon']
                                    .map(h => ({ userEnteredValue: { stringValue: h } }))
                            }]
                        }]
                    },
                    {
                        properties: { title: 'Debts', index: 1 },
                        data: [{
                            startRow: 0, startColumn: 0,
                            rowData: [{
                                values: ['id', 'name', 'type', 'loanAmount', 'interestRate', 'loanTenure', 'startDate', 'emiAmount']
                                    .map(h => ({ userEnteredValue: { stringValue: h } }))
                            }]
                        }]
                    }
                ]
            }
        );

        if (!response.ok) {
            const err = await response.json();
            throw { status: response.status, message: err.error?.message || 'Failed to create spreadsheet' };
        }

        const data = await response.json();
        return data.spreadsheetId;
    },

    // API: Write data to a sheet tab
    async _writeSheet(sheetName, items, columns) {
        // Build rows: header + data
        const rows = [columns];
        items.forEach(item => {
            rows.push(columns.map(col => {
                const val = item[col];
                if (val === null || val === undefined) return '';
                if (Array.isArray(val) || typeof val === 'object') return JSON.stringify(val);
                return String(val);
            }));
        });

        const range = `${sheetName}!A1:${String.fromCharCode(64 + columns.length)}${rows.length}`;

        // Clear existing data first
        const clearResp = await this._apiCall(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}:clear`,
            'POST'
        );
        if (!clearResp.ok) {
            const clearErr = await clearResp.json();
            console.error('Clear failed:', clearErr);
            throw { status: clearResp.status, message: clearErr.error?.message || 'Clear failed' };
        }

        // Write new data
        const response = await this._apiCall(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}?valueInputOption=RAW`,
            'PUT',
            { range, majorDimension: 'ROWS', values: rows }
        );

        if (!response.ok) {
            const err = await response.json();
            console.error('Write failed:', err);
            throw { status: response.status, message: err.error?.message || 'Write failed' };
        }
    },

    // API: Read data from a sheet tab
    async _readSheet(sheetName, columns) {
        const response = await this._apiCall(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:Z`
        );

        if (!response.ok) {
            if (response.status === 400) return []; // Sheet might not exist yet
            const err = await response.json();
            throw { status: response.status, message: err.error?.message || 'Read failed' };
        }

        const data = await response.json();
        const rows = data.values || [];

        if (rows.length <= 1) return []; // Only header or empty

        const headers = rows[0];
        const items = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const item = {};
            headers.forEach((header, idx) => {
                item[header] = row[idx] || '';
            });
            // Only include rows that have an id
            if (item.id) {
                items.push(item);
            }
        }

        return items;
    },

    // Make authenticated API call
    async _apiCall(url, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${GoogleAuth.getToken()}`,
                'Content-Type': 'application/json'
            }
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        return fetch(url, options);
    },

    // Update sync status indicator
    _updateSyncStatus(status) {
        const el = document.getElementById('syncStatus');
        if (!el) return;

        el.className = 'sync-status ' + status;
        const label = el.querySelector('.sync-label');
        if (label) {
            switch (status) {
                case 'syncing': label.textContent = 'Syncing...'; break;
                case 'synced': label.textContent = 'Synced'; break;
                case 'error': label.textContent = 'Sync error'; break;
            }
        }
    },

    // Show link to open the spreadsheet
    _updateSheetLink() {
        const link = document.getElementById('openSheetLink');
        if (!link) return;

        if (this.spreadsheetId) {
            link.href = `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`;
            link.style.display = 'inline-flex';
        } else {
            link.style.display = 'none';
        }
    }
};
