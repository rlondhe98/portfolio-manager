// Storage module - handles localStorage and export/import
const Storage = {
    KEYS: {
        INVESTMENTS: 'pm_investments',
        DEBTS: 'pm_debts',
        THEME: 'pm_theme'
    },

    // Get all investments
    getInvestments() {
        const data = localStorage.getItem(this.KEYS.INVESTMENTS);
        if (!data) return [];
        const investments = JSON.parse(data);
        // Ensure sips array exists - migrate from old monthlySIP field only if never migrated
        investments.forEach(inv => {
            // Parse sips if it's a JSON string (from sheets sync)
            if (typeof inv.sips === 'string') {
                try { inv.sips = JSON.parse(inv.sips); } catch (e) { inv.sips = []; }
            }
            // Only create from monthlySIP if sips has never been set (not even as empty array)
            if (!Array.isArray(inv.sips)) {
                if (inv.monthlySIP > 0) {
                    inv.sips = [{
                        id: (inv.id || '') + '_sip',
                        amount: inv.monthlySIP,
                        startDate: inv.sipStartDate || inv.investmentStartDate || new Date().toISOString().split('T')[0],
                        endDate: '',
                        active: true,
                        installments: []
                    }];
                    inv._sipsMigrated = true;
                } else {
                    inv.sips = [];
                }
            }
            // Set casImportDate if not present (for funds imported from CAS that already have units)
            if (!inv.casImportDate && inv.units > 0 && inv.type === 'mutual_fund') {
                inv.casImportDate = inv.investmentStartDate || new Date().toISOString().split('T')[0];
            }
        });
        return investments;
    },

    // Save investments
    async saveInvestments(investments) {
        localStorage.setItem(this.KEYS.INVESTMENTS, JSON.stringify(investments));
        // Sync to Google Sheets if connected — wait for completion
        if (typeof SheetsBackend !== 'undefined' && typeof GoogleAuth !== 'undefined' && GoogleAuth.isSignedIn() && SheetsBackend.spreadsheetId) {
            await SheetsBackend.syncInvestments(investments);
        }
    },

    // Get all debts
    getDebts() {
        const data = localStorage.getItem(this.KEYS.DEBTS);
        return data ? JSON.parse(data) : [];
    },

    // Save debts
    async saveDebts(debts) {
        localStorage.setItem(this.KEYS.DEBTS, JSON.stringify(debts));
        // Sync to Google Sheets if connected
        if (typeof SheetsBackend !== 'undefined' && typeof GoogleAuth !== 'undefined' && GoogleAuth.isSignedIn() && SheetsBackend.spreadsheetId) {
            await SheetsBackend.syncDebts(debts);
        }
    },

    // Get theme
    getTheme() {
        return localStorage.getItem(this.KEYS.THEME) || 'light';
    },

    // Save theme
    saveTheme(theme) {
        localStorage.setItem(this.KEYS.THEME, theme);
    },

    // Export all data as JSON
    exportData() {
        const data = {
            version: 1,
            exportDate: new Date().toISOString(),
            investments: this.getInvestments(),
            debts: this.getDebts()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `portfolio-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Data exported successfully');
    },

    // Import data from JSON file
    importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.investments && !data.debts) {
                        throw new Error('Invalid file format');
                    }
                    if (data.investments) this.saveInvestments(data.investments);
                    if (data.debts) this.saveDebts(data.debts);
                    showToast('Data imported successfully');
                    resolve(data);
                } catch (err) {
                    showToast('Invalid file format');
                    reject(err);
                }
            };
            reader.readAsText(file);
        });
    },

    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
};

// Toast notification
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
