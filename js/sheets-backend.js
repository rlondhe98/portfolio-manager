// Google Sheets Backend - syncs data with user's Google Sheet
const SheetsBackend = {
    SPREADSHEET_NAME: 'Portfolio Manager Data',
    APP_PROPERTY_KEY: 'pmApp',
    APP_PROPERTY_VALUE: 'portfolio-manager',
    spreadsheetId: null,
    isSyncing: false,
    _writingInProgress: false,

    async init() {
        if (!GoogleAuth.isSignedIn()) return;

        this.spreadsheetId = localStorage.getItem('pm_spreadsheet_id');

        try {
            if (this.spreadsheetId) {
                const valid = await this._verifySpreadsheet();
                if (!valid) {
                    this.spreadsheetId = null;
                    localStorage.removeItem('pm_spreadsheet_id');
                }
            }

            if (!this.spreadsheetId) {
                this.spreadsheetId = await this._findSpreadsheet();

                if (!this.spreadsheetId) {
                    this.spreadsheetId = await this._findSpreadsheetByLegacyName();
                    if (this.spreadsheetId) {
                        await this._tagSpreadsheet(this.spreadsheetId);
                    }
                }

                if (!this.spreadsheetId) {
                    this.spreadsheetId = await this._createSpreadsheet();
                    await this._pushLocalDataToSheet();
                } else {
                    await this.pullFromSheet();
                }

                localStorage.setItem('pm_spreadsheet_id', this.spreadsheetId);
            } else {
                await this.pullFromSheet();
            }

            this._updateSyncStatus('synced');
            this._updateSheetLink();
            if (typeof EmergencyFund !== 'undefined') {
                try { await EmergencyFund.pullFromSheet(); } catch (e) {}
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

    async pullFromSheet() {
        if (!GoogleAuth.isSignedIn() || !this.spreadsheetId) return;
        if (this._writingInProgress) return;

        try {
            const investments = await this._readSheet('Investments', [
                'id', 'name', 'type', 'schemeCode', 'units', 'initialCorpus', 'currentCorpus', 'investmentStartDate', 'monthlySIP', 'sipStartDate', 'expectedReturn', 'investmentHorizon', 'currency', 'ticker', 'shares', 'avgBuyPrice', 'sips', 'transactions'
            ]);
            const debts = await this._readSheet('Debts', [
                'id', 'name', 'type', 'loanAmount', 'interestRate', 'loanTenure', 'startDate', 'emiAmount'
            ]);

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

                if (inv.sips && typeof inv.sips === 'string' && inv.sips.startsWith('[')) {
                    try { parsed.sips = JSON.parse(inv.sips); } catch (e) { parsed.sips = []; }
                } else {
                    parsed.sips = [];
                }

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

            const parsedDebts = debts.map(debt => ({
                ...debt,
                loanAmount: parseFloat(debt.loanAmount) || 0,
                interestRate: parseFloat(debt.interestRate) || 0,
                loanTenure: parseInt(debt.loanTenure) || 0,
                emiAmount: debt.emiAmount ? parseFloat(debt.emiAmount) : null
            }));

            Storage.saveInvestments(parsedInvestments);
            Storage.saveDebts(parsedDebts);

            if (typeof App !== 'undefined' && App.renderAll) {
                App.renderAll();
            }
        } catch (err) {
            console.error('Pull from sheet error:', err);
        }
    },

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

    async _verifySpreadsheet() {
        try {
            const response = await this._apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?fields=spreadsheetId`);
            return response.ok;
        } catch {
            return false;
        }
    },

    async _findSpreadsheet() {
        const query = encodeURIComponent(
            `appProperties has { key='${this.APP_PROPERTY_KEY}' and value='${this.APP_PROPERTY_VALUE}' } and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
        );
        const response = await this._apiCall(
            `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=createdTime desc`
        );

        if (!response.ok) return null;
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    },

    async _findSpreadsheetByLegacyName() {
        const query = encodeURIComponent(
            `name='${this.SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
        );

        const response = await this._apiCall(
            `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=createdTime desc`
        );

        if (!response.ok) return null;

        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    },

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
        const spreadsheetId = data.spreadsheetId;
        await this._tagSpreadsheet(spreadsheetId);
        return spreadsheetId;
    },

    async _tagSpreadsheet(spreadsheetId) {
        const response = await this._apiCall(
            `https://www.googleapis.com/drive/v3/files/${spreadsheetId}`,
            'PATCH',
            {
                appProperties: {
                    [this.APP_PROPERTY_KEY]: this.APP_PROPERTY_VALUE
                }
            }
        );

        if (!response.ok) {
            const err = await response.json();
            throw { status: response.status, message: err.error?.message || 'Failed to tag spreadsheet' };
        }
    },

    async openRecoveryModal() {
        const modal = document.getElementById('sheetRecoveryModal');
        const list = document.getElementById('sheetRecoveryList');
        const status = document.getElementById('sheetRecoveryStatus');

        if (!modal || !list || !status) return;

        modal.style.display = 'flex';
        status.textContent = 'Looking for spreadsheets in your Google Drive...';
        list.innerHTML = '';

        try {
            const files = await this._listRecoverableSpreadsheets();

            if (!files.length) {
                status.textContent = '';
                list.innerHTML = '<div class="sheet-recovery-empty">No spreadsheets were found in your Google Drive.</div>';
                return;
            }

            status.textContent = 'Choose the spreadsheet that already contains your portfolio data.';
            list.innerHTML = files.map(file => `
                <div class="sheet-recovery-item">
                    <div class="sheet-recovery-meta">
                        <div class="sheet-recovery-title">${this._escapeHtml(file.name || 'Untitled spreadsheet')}</div>
                        <div class="sheet-recovery-subtitle">Modified: ${new Date(file.modifiedTime).toLocaleString()}<br>ID: ${file.id}</div>
                    </div>
                    <button type="button" class="btn-google" data-sheet-recover-id="${file.id}">Use this sheet</button>
                </div>
            `).join('');

            list.querySelectorAll('[data-sheet-recover-id]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const sheetId = btn.getAttribute('data-sheet-recover-id');
                    await this._recoverSpreadsheet(sheetId, btn);
                });
            });
        } catch (err) {
            console.error('Recovery modal error:', err);
            status.textContent = 'Failed to load spreadsheets: ' + (err.message || 'Unknown error');
        }
    },

    closeRecoveryModal() {
        const modal = document.getElementById('sheetRecoveryModal');
        if (modal) modal.style.display = 'none';
    },

    async _listRecoverableSpreadsheets() {
        const query = encodeURIComponent(`mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
        const response = await this._apiCall(
            `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=50&fields=files(id,name,modifiedTime,appProperties)&orderBy=modifiedTime desc`
        );

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Failed to list spreadsheets');
        }

        const data = await response.json();
        return data.files || [];
    },

    async _recoverSpreadsheet(sheetId, buttonEl) {
        const status = document.getElementById('sheetRecoveryStatus');
        const originalText = buttonEl ? buttonEl.textContent : '';

        try {
            if (buttonEl) {
                buttonEl.disabled = true;
                buttonEl.textContent = 'Checking...';
            }

            const isPortfolioSheet = await this._looksLikePortfolioSheet(sheetId);
            if (!isPortfolioSheet) {
                throw new Error('This spreadsheet does not look like a Portfolio Manager sheet.');
            }

            await this._tagSpreadsheet(sheetId);
            this.spreadsheetId = sheetId;
            localStorage.setItem('pm_spreadsheet_id', sheetId);
            await this.pullFromSheet();
            this._updateSheetLink();
            this._updateSyncStatus('synced');

            if (status) status.textContent = 'Sheet connected successfully.';
            showToast('Existing sheet reconnected');
            this.closeRecoveryModal();
        } catch (err) {
            console.error('Recover spreadsheet error:', err);
            if (status) status.textContent = err.message || 'Failed to reconnect spreadsheet';
            if (buttonEl) {
                buttonEl.disabled = false;
                buttonEl.textContent = originalText;
            }
        }
    },

    async _looksLikePortfolioSheet(sheetId) {
        const [investmentsResp, debtsResp] = await Promise.all([
            this._apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Investments!A1:Z2`),
            this._apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Debts!A1:Z2`)
        ]);

        if (!investmentsResp.ok || !debtsResp.ok) return false;

        const investmentsData = await investmentsResp.json();
        const debtsData = await debtsResp.json();

        const investmentsHeaders = investmentsData.values?.[0] || [];
        const debtsHeaders = debtsData.values?.[0] || [];

        const hasInvestmentHeaders =
            investmentsHeaders.includes('id') &&
            investmentsHeaders.includes('name') &&
            investmentsHeaders.includes('type');

        const hasDebtHeaders =
            debtsHeaders.includes('id') &&
            debtsHeaders.includes('name') &&
            debtsHeaders.includes('type');

        return hasInvestmentHeaders && hasDebtHeaders;
    },

    _escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    async _writeSheet(sheetName, items, columns) {
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

        const clearResp = await this._apiCall(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}:clear`,
            'POST'
        );
        if (!clearResp.ok) {
            const clearErr = await clearResp.json();
            console.error('Clear failed:', clearErr);
            throw { status: clearResp.status, message: clearErr.error?.message || 'Clear failed' };
        }

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

    async _readSheet(sheetName, columns) {
        const response = await this._apiCall(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:Z`
        );

        if (!response.ok) {
            if (response.status === 400) return [];
            const err = await response.json();
            throw { status: response.status, message: err.error?.message || 'Read failed' };
        }

        const data = await response.json();
        const rows = data.values || [];

        if (rows.length <= 1) return [];

        const headers = rows[0];
        const items = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const item = {};
            headers.forEach((header, idx) => {
                item[header] = row[idx] || '';
            });
            if (item.id) {
                items.push(item);
            }
        }

        return items;
    },

    async _apiCall(url, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${GoogleAuth.getToken()}`
            }
        };

        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        return fetch(url, options);
    },

    _updateSyncStatus(status) {
        const el = document.getElementById('syncStatus');
        if (!el) return;

        el.className = `sync-status ${status}`;
        const label = el.querySelector('.sync-label') || el;

        if (status === 'syncing') label.textContent = 'Syncing...';
        else if (status === 'synced') label.textContent = 'Synced';
        else if (status === 'error') label.textContent = 'Sync error';
        else label.textContent = '';
    },

    _updateSheetLink() {
        const link = document.getElementById('openSheetLink');
        if (!link || !this.spreadsheetId) return;

        link.href = `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`;
        link.style.display = 'inline-flex';
    }
};
