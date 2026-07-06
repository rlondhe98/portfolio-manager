// Emergency Fund Planner
const EmergencyFund = {
    STORAGE_KEY: 'pm_emergency_fund',

    getData() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : {
            monthlyExpenses: 0,
            targetMonths: 6,
            currentFund: 0,
            monthlyContribution: 0,
            recurringExpenses: []
        };
    },

    saveData(data) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        // Sync to Google Sheets
        if (typeof SheetsBackend !== 'undefined' && typeof GoogleAuth !== 'undefined' && GoogleAuth.isSignedIn() && SheetsBackend.spreadsheetId) {
            this._syncToSheet(data);
        }
    },

    render() {
        const container = document.getElementById('emergencyContainer');
        if (!container) return;

        const data = this.getData();
        this._renderSummaryWidget(data);
        const targetAmount = data.monthlyExpenses * data.targetMonths;
        const upcomingExpenses = this._getUpcomingExpensesTotal(data.recurringExpenses);
        const effectiveFund = data.currentFund - upcomingExpenses;
        const progress = targetAmount > 0 ? Math.min(100, (data.currentFund / targetAmount) * 100) : 0;
        const effectiveProgress = targetAmount > 0 ? Math.min(100, (effectiveFund / targetAmount) * 100) : 0;

        // Time to reach target
        const gap = Math.max(0, targetAmount - data.currentFund);
        const monthsToTarget = data.monthlyContribution > 0 ? Math.ceil(gap / data.monthlyContribution) : Infinity;

        const hasSetup = data.monthlyExpenses > 0;

        if (!hasSetup) {
            container.innerHTML = this._renderSetup(data);
            return;
        }

        container.innerHTML = `
            <div class="ef-dashboard">
                <!-- Top Row: Progress + Stats -->
                <div class="ef-top-row">
                    <div class="ef-progress-compact">
                        <div class="ef-progress-ring-sm">
                            <svg viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" stroke-width="7"/>
                                <circle cx="50" cy="50" r="44" fill="none" stroke="${progress >= 100 ? 'var(--success)' : 'var(--accent)'}" stroke-width="7"
                                    stroke-dasharray="${2 * Math.PI * 44}"
                                    stroke-dashoffset="${2 * Math.PI * 44 * (1 - progress / 100)}"
                                    stroke-linecap="round" transform="rotate(-90 50 50)"/>
                            </svg>
                            <div class="ef-progress-center">
                                <div class="ef-progress-percent">${progress.toFixed(0)}%</div>
                            </div>
                        </div>
                    </div>
                    <div class="ef-stats-compact">
                        <div class="ef-stat-row"><span>Target</span><span>${formatCurrency(targetAmount)}</span></div>
                        <div class="ef-stat-row"><span>Current</span><span>${formatCurrency(data.currentFund)}</span></div>
                        <div class="ef-stat-row"><span>Gap</span><span class="${gap > 0 ? 'negative' : 'positive'}">${gap > 0 ? formatCurrency(gap) : 'Funded \u2705'}</span></div>
                        <div class="ef-stat-row"><span>Saving</span><span>${formatCurrency(data.monthlyContribution)}/mo</span></div>
                        <div class="ef-stat-row"><span>ETA</span><span>${monthsToTarget === Infinity ? '\u2014' : monthsToTarget <= 0 ? 'Done!' : monthsToTarget + ' mo'}</span></div>
                        <div class="ef-stat-row"><span>Expenses</span><span>${formatCurrency(data.monthlyExpenses)}/mo</span></div>
                    </div>
                    <div class="ef-top-actions">
                        <button class="btn-sm btn-primary" onclick="EmergencyFund._showUpdateModal()">Update Balance</button>
                        <button class="btn-sm btn-edit" onclick="EmergencyFund._showSettings()">Settings</button>
                    </div>
                </div>

                <!-- Bottom Row: Expenses + Timeline side by side -->
                <div class="ef-bottom-row">
                    <div class="ef-expenses-section">
                        <div class="ef-section-header">
                            <h3>Recurring Expenses</h3>
                            <button class="btn-sm btn-primary" onclick="EmergencyFund._showAddExpense()">+</button>
                        </div>
                        ${upcomingExpenses > 0 ? `<div class="ef-upcoming-compact">Reserved: <strong>${formatCurrency(upcomingExpenses)}</strong> · Net: <span class="${effectiveFund >= 0 ? 'positive' : 'negative'}">${formatCurrency(effectiveFund)}</span></div>` : ''}
                        <div class="ef-expenses-list">
                            ${data.recurringExpenses.length === 0 ? '<p class="sip-empty">No expenses added yet</p>' : ''}
                            ${this._renderExpenseTimeline(data.recurringExpenses)}
                        </div>
                    </div>
                    <div class="ef-timeline-section">
                        <h3>12-Month Forecast</h3>
                        ${this._renderCashflowTimeline(data)}
                    </div>
                </div>
            </div>
        `;
    },

    _renderSetup(data) {
        return `
            <div class="ef-setup">
                <div class="ef-setup-header">
                    <h2>\uD83D\uDEE1\uFE0F Emergency Fund Planner</h2>
                    <p>Set up your emergency fund by entering your monthly mandatory expenses.</p>
                </div>
                <div class="ef-setup-form">
                    <div class="form-group">
                        <label>Monthly Mandatory Expenses (₹)</label>
                        <p class="ef-help">Rent + EMIs + Utilities + Insurance + Groceries + Transport</p>
                        <input type="number" id="efMonthlyExp" placeholder="e.g., 50000" step="any">
                    </div>
                    <div class="form-group">
                        <label>How many months to cover?</label>
                        <select id="efTargetMonths">
                            <option value="3">3 months (minimum)</option>
                            <option value="6" selected>6 months (recommended)</option>
                            <option value="9">9 months (comfortable)</option>
                            <option value="12">12 months (very safe)</option>
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Current Emergency Fund (₹)</label>
                            <input type="number" id="efCurrentFund" placeholder="Amount saved so far" step="any">
                        </div>
                        <div class="form-group">
                            <label>Monthly Contribution (₹)</label>
                            <input type="number" id="efMonthlyContrib" placeholder="How much you save monthly" step="any">
                        </div>
                    </div>
                    <button class="btn-primary" onclick="EmergencyFund._saveSetup()">Set Up Emergency Fund</button>
                </div>
            </div>
        `;
    },

    _saveSetup() {
        const data = {
            monthlyExpenses: parseFloat(document.getElementById('efMonthlyExp').value) || 0,
            targetMonths: parseInt(document.getElementById('efTargetMonths').value) || 6,
            currentFund: parseFloat(document.getElementById('efCurrentFund').value) || 0,
            monthlyContribution: parseFloat(document.getElementById('efMonthlyContrib').value) || 0,
            recurringExpenses: []
        };

        if (data.monthlyExpenses <= 0) { showToast('Enter your monthly expenses'); return; }

        this.saveData(data);
        this.render();
        showToast('Emergency fund set up!');
    },

    _showSettings() {
        const data = this.getData();
        document.getElementById('detailModalTitle').textContent = 'Emergency Fund Settings';
        document.getElementById('detailModalContent').innerHTML = `
            <div class="calc-form">
                <div class="form-group">
                    <label>Monthly Mandatory Expenses (₹)</label>
                    <input type="number" id="efSettingsExp" value="${data.monthlyExpenses}" step="any">
                </div>
                <div class="form-group">
                    <label>Target Coverage (months)</label>
                    <select id="efSettingsMonths">
                        <option value="3" ${data.targetMonths === 3 ? 'selected' : ''}>3 months</option>
                        <option value="6" ${data.targetMonths === 6 ? 'selected' : ''}>6 months</option>
                        <option value="9" ${data.targetMonths === 9 ? 'selected' : ''}>9 months</option>
                        <option value="12" ${data.targetMonths === 12 ? 'selected' : ''}>12 months</option>
                    </select>
                </div>
                <button class="btn-primary" onclick="EmergencyFund._saveSettings()">Save</button>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    _saveSettings() {
        const data = this.getData();
        data.monthlyExpenses = parseFloat(document.getElementById('efSettingsExp').value) || data.monthlyExpenses;
        data.targetMonths = parseInt(document.getElementById('efSettingsMonths').value) || data.targetMonths;
        this.saveData(data);
        document.getElementById('detailModal').classList.remove('active');
        this.render();
        showToast('Settings updated');
    },

    _updateBalance() {
        const data = this.getData();
        data.currentFund = parseFloat(document.getElementById('efUpdateBalance').value) || 0;
        data.monthlyContribution = parseFloat(document.getElementById('efUpdateContribution').value) || 0;
        this.saveData(data);
        document.getElementById('detailModal').classList.remove('active');
        this.render();
        showToast('Balance updated');
    },

    _showUpdateModal() {
        const data = this.getData();
        document.getElementById('detailModalTitle').textContent = 'Update Emergency Fund';
        document.getElementById('detailModalContent').innerHTML = `
            <div class="calc-form">
                <div class="form-group">
                    <label>Current Balance (₹)</label>
                    <input type="number" id="efUpdateBalance" value="${data.currentFund}" step="any">
                </div>
                <div class="form-group">
                    <label>Monthly Contribution (₹)</label>
                    <input type="number" id="efUpdateContribution" value="${data.monthlyContribution}" step="any">
                </div>
                <button class="btn-primary" onclick="EmergencyFund._updateBalance()">Save</button>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    _showAddExpense() {
        document.getElementById('detailModalTitle').textContent = 'Add Recurring Expense';
        document.getElementById('detailModalContent').innerHTML = `
            <div class="calc-form">
                <p class="calc-desc-text">Add yearly recurring expenses (insurance, subscriptions, school fees, etc.) that you pay from your emergency fund.</p>
                <div class="form-group">
                    <label>Expense Name</label>
                    <input type="text" id="efExpName" placeholder="e.g., Car Insurance">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Amount (₹)</label>
                        <input type="number" id="efExpAmount" placeholder="22000" step="any">
                    </div>
                    <div class="form-group">
                        <label>Due Month</label>
                        <select id="efExpMonth">
                            <option value="1">January</option><option value="2">February</option>
                            <option value="3">March</option><option value="4">April</option>
                            <option value="5">May</option><option value="6">June</option>
                            <option value="7">July</option><option value="8">August</option>
                            <option value="9">September</option><option value="10">October</option>
                            <option value="11">November</option><option value="12">December</option>
                        </select>
                    </div>
                </div>
                <button class="btn-primary" onclick="EmergencyFund._addExpense()">Add Expense</button>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    _addExpense() {
        const name = document.getElementById('efExpName').value.trim();
        const amount = parseFloat(document.getElementById('efExpAmount').value) || 0;
        const month = parseInt(document.getElementById('efExpMonth').value);

        if (!name) { showToast('Enter expense name'); return; }
        if (amount <= 0) { showToast('Enter amount'); return; }

        const data = this.getData();
        data.recurringExpenses.push({ id: Date.now().toString(36), name, amount, month });
        this.saveData(data);
        document.getElementById('detailModal').classList.remove('active');
        this.render();
        showToast('Expense added');
    },

    _deleteExpense(id) {
        const data = this.getData();
        data.recurringExpenses = data.recurringExpenses.filter(e => e.id !== id);
        this.saveData(data);
        this.render();
        showToast('Expense removed');
    },

    _getUpcomingExpensesTotal(expenses) {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        let total = 0;
        expenses.forEach(exp => {
            // Count expenses from now until 12 months ahead
            if (exp.month >= currentMonth) {
                total += exp.amount;
            }
        });
        return total;
    },

    _renderExpenseTimeline(expenses) {
        if (expenses.length === 0) return '';
        const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const currentMonth = now.getMonth() + 1;

        const sorted = [...expenses].sort((a, b) => {
            const aNext = a.month >= currentMonth ? a.month : a.month + 12;
            const bNext = b.month >= currentMonth ? b.month : b.month + 12;
            return aNext - bNext;
        });

        return sorted.map(exp => {
            const isPast = exp.month < currentMonth;
            const isThisMonth = exp.month === currentMonth;
            return `
                <div class="ef-expense-item ${isPast ? 'ef-expense-past' : ''} ${isThisMonth ? 'ef-expense-current' : ''}">
                    <div class="ef-expense-month">${months[exp.month]}</div>
                    <div class="ef-expense-info">
                        <div class="ef-expense-name">${exp.name}</div>
                        <div class="ef-expense-amount">${formatCurrency(exp.amount)}</div>
                    </div>
                    <button class="btn-sm btn-danger" onclick="EmergencyFund._deleteExpense('${exp.id}')">×</button>
                </div>
            `;
        }).join('');
    },

    _renderCashflowTimeline(data) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const currentMonth = now.getMonth();
        const targetAmount = data.monthlyExpenses * data.targetMonths;

        let balance = data.currentFund;
        let rows = '';
        let maxBalance = balance;

        // Generate 12 months
        const timeline = [];
        for (let i = 0; i < 12; i++) {
            const monthIdx = (currentMonth + i) % 12;
            const monthName = months[monthIdx];
            const isCurrentMonth = i === 0;

            // Contributions
            const added = isCurrentMonth ? 0 : data.monthlyContribution;

            // Expenses this month
            const monthExpenses = data.recurringExpenses
                .filter(exp => exp.month === monthIdx + 1)
                .reduce((sum, exp) => sum + exp.amount, 0);

            const opening = balance;
            balance = balance + added - monthExpenses;
            const closing = balance;

            if (closing > maxBalance) maxBalance = closing;

            timeline.push({ monthName, monthIdx, isCurrentMonth, added, monthExpenses, opening, closing });
        }

        // Render as visual bars + table
        const barMax = Math.max(maxBalance, targetAmount);

        rows = timeline.map(t => {
            const barWidth = barMax > 0 ? (Math.max(0, t.closing) / barMax * 100) : 0;
            const targetWidth = barMax > 0 ? (targetAmount / barMax * 100) : 0;
            const isNegative = t.closing < 0;
            const barColor = isNegative ? 'var(--danger)' : (t.closing >= targetAmount ? 'var(--success)' : 'var(--accent)');

            return `
                <div class="ef-tl-row ${t.isCurrentMonth ? 'ef-tl-current' : ''}">
                    <div class="ef-tl-month">${t.monthName}</div>
                    <div class="ef-tl-bar-wrap">
                        <div class="ef-tl-bar" style="width:${barWidth}%;background:${barColor}"></div>
                        <div class="ef-tl-target-line" style="left:${targetWidth}%" title="Target: ${formatCurrency(targetAmount)}"></div>
                    </div>
                    <div class="ef-tl-amounts">
                        ${t.added > 0 ? `<span class="positive">+${formatCurrency(t.added)}</span>` : ''}
                        ${t.monthExpenses > 0 ? `<span class="negative">-${formatCurrency(t.monthExpenses)}</span>` : ''}
                    </div>
                    <div class="ef-tl-balance ${isNegative ? 'negative' : ''}">${formatCurrency(t.closing)}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="ef-timeline">
                <div class="ef-tl-header">
                    <span>Month</span>
                    <span>Balance</span>
                    <span>In / Out</span>
                    <span>Closing</span>
                </div>
                ${rows}
                <div class="ef-tl-legend">
                    <span><span class="ef-tl-legend-bar" style="background:var(--accent)"></span> Balance</span>
                    <span><span class="ef-tl-legend-line"></span> Target (${formatCurrency(targetAmount)})</span>
                </div>
            </div>
        `;
    },

    async _syncToSheet(data) {
        try {
            const token = GoogleAuth.getToken();
            const spreadsheetId = SheetsBackend.spreadsheetId;

            // Ensure EmergencyFund sheet exists
            const metaResp = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const meta = await metaResp.json();
            const sheetExists = meta.sheets && meta.sheets.some(s => s.properties.title === 'EmergencyFund');

            if (!sheetExists) {
                try {
                    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'EmergencyFund' } } }] })
                    });
                } catch (e) { /* sheet might already exist */ }
            }

            // Write data as key-value rows
            const rows = [
                ['key', 'value'],
                ['monthlyExpenses', String(data.monthlyExpenses)],
                ['targetMonths', String(data.targetMonths)],
                ['currentFund', String(data.currentFund)],
                ['monthlyContribution', String(data.monthlyContribution)],
                ['recurringExpenses', JSON.stringify(data.recurringExpenses)]
            ];

            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/EmergencyFund!A1:B${rows.length}?valueInputOption=RAW`,
                {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ range: `EmergencyFund!A1:B${rows.length}`, majorDimension: 'ROWS', values: rows })
                }
            );
        } catch (e) {
            console.warn('Emergency fund sync failed:', e);
        }
    },

    // Pull emergency fund data from Google Sheets
    async pullFromSheet() {
        if (!GoogleAuth.isSignedIn() || !SheetsBackend.spreadsheetId) return;

        try {
            const token = GoogleAuth.getToken();
            const spreadsheetId = SheetsBackend.spreadsheetId;

            const resp = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/EmergencyFund!A:B`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (!resp.ok) return; // Sheet doesn't exist yet — that's fine

            const result = await resp.json();
            const rows = result.values || [];

            if (rows.length <= 1) return; // Only header or empty

            const dataMap = {};
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0]) dataMap[rows[i][0]] = rows[i][1];
            }

            const data = {
                monthlyExpenses: parseFloat(dataMap.monthlyExpenses) || 0,
                targetMonths: parseInt(dataMap.targetMonths) || 6,
                currentFund: parseFloat(dataMap.currentFund) || 0,
                monthlyContribution: parseFloat(dataMap.monthlyContribution) || 0,
                recurringExpenses: dataMap.recurringExpenses ? JSON.parse(dataMap.recurringExpenses) : []
            };

            // Only update if sheet has data
            if (data.monthlyExpenses > 0) {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
                this.render();
            }
        } catch (e) {
            console.warn('Emergency fund pull failed:', e);
        }
    },

    _renderSummaryWidget(data) {
        const section = document.getElementById('efSummarySection');
        const content = document.getElementById('efSummaryContent');
        if (!section || !content) return;

        if (!data || data.monthlyExpenses <= 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        const targetAmount = data.monthlyExpenses * data.targetMonths;
        const progress = targetAmount > 0 ? Math.min(100, (data.currentFund / targetAmount) * 100) : 0;
        const gap = Math.max(0, targetAmount - data.currentFund);
        const monthsToTarget = data.monthlyContribution > 0 ? Math.ceil(gap / data.monthlyContribution) : 0;

        content.innerHTML = `
            <div class="ef-summary-widget" onclick="document.querySelector('[data-tab=emergency]').click()">
                <div class="ef-widget-progress">
                    <div class="detail-progress-bar" style="height:8px">
                        <div class="detail-progress-fill" style="width:${progress}%;background:${progress >= 100 ? 'var(--success)' : 'var(--accent)'}"></div>
                    </div>
                    <div class="ef-widget-labels">
                        <span>${formatCurrency(data.currentFund)} of ${formatCurrency(targetAmount)}</span>
                        <span class="${progress >= 100 ? 'positive' : ''}">${progress.toFixed(0)}%</span>
                    </div>
                </div>
                <div class="ef-widget-stats">
                    <span>${data.targetMonths} months coverage</span>
                    <span>Saving ${formatCurrency(data.monthlyContribution)}/mo</span>
                    ${gap > 0 && monthsToTarget > 0 ? `<span>${monthsToTarget} months to target</span>` : ''}
                    ${progress >= 100 ? '<span class="positive">Fully funded \u2705</span>' : ''}
                </div>
            </div>
        `;
    }
};
