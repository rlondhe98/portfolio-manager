// Main App Module
const App = {
    init() {
        this.initTheme();
        this.initTabs();
        this.initModals();
        this.initForms();
        this.initExportImport();
        this.initGoogleAuth();
        MutualFundAPI.initSearchUI();
        this.renderAll();
    },

    // Google Auth
    initGoogleAuth() {
        GoogleAuth.init().then(() => {
            // If already signed in, init the sheets backend
            if (GoogleAuth.isSignedIn()) {
                SheetsBackend.init();
            }
        });

        document.getElementById('googleSignInBtn').addEventListener('click', () => {
            GoogleAuth.signIn();
        });

        document.getElementById('googleSignInBtn2').addEventListener('click', () => {
            GoogleAuth.signIn();
        });

        document.getElementById('googleSignOutBtn').addEventListener('click', () => {
            GoogleAuth.signOut();
        });
    },

    // Theme
    initTheme() {
        const theme = Storage.getTheme();
        document.documentElement.setAttribute('data-theme', theme);

        document.getElementById('themeToggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            Storage.saveTheme(next);
        });
    },

    // Tabs
    initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');

        // Restore active tab from URL hash or localStorage
        const savedTab = window.location.hash.slice(1) || localStorage.getItem('pm_active_tab') || 'summary';
        const savedBtn = document.querySelector(`.tab-btn[data-tab="${savedTab}"]`);
        if (savedBtn) {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            savedBtn.classList.add('active');
            document.getElementById(savedTab).classList.add('active');
        }

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;

                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                document.getElementById(target).classList.add('active');

                // Save active tab
                localStorage.setItem('pm_active_tab', target);
                history.replaceState(null, '', '#' + target);
            });
        });
    },

    // Modals
    initModals() {
        // Open investment modal
        document.getElementById('addInvestmentBtn').addEventListener('click', () => {
            document.getElementById('investmentModalTitle').textContent = 'Add Investment';
            document.getElementById('investmentForm').reset();
            document.getElementById('investmentId').value = '';
            document.getElementById('investmentSchemeCode').value = '';
            // Hide all conditional fields until type is selected
            document.getElementById('investmentFieldsWrapper').style.display = 'none';
            document.getElementById('investmentModal').classList.add('active');
        });

        // Open debt modal
        document.getElementById('addDebtBtn').addEventListener('click', () => {
            document.getElementById('debtModalTitle').textContent = 'Add Debt';
            document.getElementById('debtForm').reset();
            document.getElementById('debtId').value = '';
            document.getElementById('debtModal').classList.add('active');
        });

        // Close modals
        document.querySelectorAll('[data-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.modal;
                document.getElementById(modalId).classList.remove('active');
            });
        });

        // Close on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            });
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            }
        });
    },

    // Forms
    initForms() {
        // Investment form
        document.getElementById('investmentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const type = document.getElementById('investmentType').value;
            const isStock = type === 'stocks';
            const currency = document.getElementById('investmentCurrency').value || 'INR';
            const ticker = document.getElementById('investmentTicker').value.trim().toUpperCase();
            const name = document.getElementById('investmentName').value.trim() || ticker || 'Unnamed';

            // Auto-tag stock subtype based on currency
            let finalType = type;
            if (isStock && currency === 'USD') finalType = 'us_stocks';
            else if (isStock && currency !== 'INR') finalType = 'intl_stocks';

            const data = {
                id: document.getElementById('investmentId').value || null,
                name: name,
                type: finalType,
                currency: currency,
                ticker: ticker,
                shares: parseFloat(document.getElementById('investmentShares').value) || 0,
                avgBuyPrice: parseFloat(document.getElementById('investmentAvgPrice').value) || 0,
                schemeCode: document.getElementById('investmentSchemeCode').value || '',
                units: parseFloat(document.getElementById('investmentUnits').value) || 0,
                initialCorpus: parseFloat(document.getElementById('initialCorpus').value) || 0,
                investmentStartDate: document.getElementById('investmentStartDate').value || new Date().toISOString().split('T')[0],
                monthlySIP: parseFloat(document.getElementById('monthlySIP').value) || 0,
                sipStartDate: document.getElementById('sipStartDate').value || '',
                expectedReturn: parseFloat(document.getElementById('expectedReturn').value) || 12,
                investmentHorizon: parseInt(document.getElementById('investmentHorizon').value) || 10
            };

            // For stocks, calculate initial corpus from shares * avg price
            if (isStock && data.shares > 0 && data.avgBuyPrice > 0) {
                data.initialCorpus = data.shares * data.avgBuyPrice;
                data.currentCorpus = data.initialCorpus; // Will be updated by live price later
            } else {
                data.currentCorpus = Investments.calculateCurrentValue(data);
            }

            Investments.save(data);
            document.getElementById('investmentModal').classList.remove('active');
            showToast(data.id ? 'Investment updated' : 'Investment added');
        });

        // Debt form
        document.getElementById('debtForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const loanAmount = parseFloat(document.getElementById('loanAmount').value);
            const interestRate = parseFloat(document.getElementById('interestRate').value);
            const loanTenure = parseInt(document.getElementById('loanTenure').value);
            const emiInput = document.getElementById('emiAmount').value;

            const data = {
                id: document.getElementById('debtId').value || null,
                name: document.getElementById('debtName').value.trim(),
                type: document.getElementById('debtType').value,
                loanAmount: loanAmount,
                interestRate: interestRate,
                loanTenure: loanTenure,
                startDate: document.getElementById('loanStartDate').value,
                emiAmount: emiInput ? parseFloat(emiInput) : null
            };

            Debts.save(data);
            document.getElementById('debtModal').classList.remove('active');
            showToast(data.id ? 'Debt updated' : 'Debt added');
        });
    },

    // Export/Import
    initExportImport() {
        document.getElementById('exportBtn').addEventListener('click', () => {
            Storage.exportData();
        });

        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        document.getElementById('importFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                await Storage.importData(file);
                this.renderAll();
            } catch (err) {
                // Error already shown via toast
            }
            e.target.value = '';
        });
    },

    // Render all views
    renderAll() {
        Summary.render();
        Investments.render();
        Debts.render();
        if (typeof Calculators !== 'undefined') Calculators.render();
        if (typeof EmergencyFund !== 'undefined') EmergencyFund.render();
        // Refresh live NAVs and exchange rates in background
        CurrencyAPI.fetchRates();
        Investments.refreshAllNAVs();
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
