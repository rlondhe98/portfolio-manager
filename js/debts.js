// Debts module
const Debts = {
    typeLabels: {
        home_loan: 'Home Loan',
        car_loan: 'Car Loan',
        personal_loan: 'Personal Loan',
        education_loan: 'Education Loan',
        credit_card: 'Credit Card',
        other: 'Other'
    },

    typeEmojis: {
        home_loan: '🏠',
        car_loan: '🚗',
        personal_loan: '💳',
        education_loan: '🎓',
        credit_card: '💳',
        other: '📋'
    },

    // Calculate EMI
    calculateEMI(principal, annualRate, tenureMonths) {
        const monthlyRate = annualRate / 100 / 12;
        if (monthlyRate === 0) return principal / tenureMonths;
        const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths) /
                    (Math.pow(1 + monthlyRate, tenureMonths) - 1);
        return emi;
    },

    // Calculate remaining balance
    calculateRemainingBalance(principal, annualRate, tenureMonths, monthsPaid) {
        const monthlyRate = annualRate / 100 / 12;
        if (monthlyRate === 0) {
            return principal - (principal / tenureMonths * monthsPaid);
        }
        const balance = principal * (Math.pow(1 + monthlyRate, tenureMonths) - Math.pow(1 + monthlyRate, monthsPaid)) /
                        (Math.pow(1 + monthlyRate, tenureMonths) - 1);
        return Math.max(0, balance);
    },

    // Calculate months paid since start date
    getMonthsPaid(startDate) {
        const start = new Date(startDate);
        const now = new Date();
        const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        return Math.max(0, months);
    },

    // Calculate total interest payable
    calculateTotalInterest(principal, annualRate, tenureMonths) {
        const emi = this.calculateEMI(principal, annualRate, tenureMonths);
        return (emi * tenureMonths) - principal;
    },

    // Render all debt cards
    render() {
        const debts = Storage.getDebts();
        const grid = document.getElementById('debtsGrid');

        if (debts.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    <p>No debts tracked. Add a loan to monitor your progress.</p>
                </div>`;
            return;
        }

        grid.innerHTML = debts.map(debt => this.renderCard(debt)).join('');
    },

    renderCard(debt) {
        const monthsPaid = this.getMonthsPaid(debt.startDate);
        const emi = debt.emiAmount || this.calculateEMI(debt.loanAmount, debt.interestRate, debt.loanTenure);
        const remainingBalance = this.calculateRemainingBalance(
            debt.loanAmount, debt.interestRate, debt.loanTenure, Math.min(monthsPaid, debt.loanTenure)
        );
        const totalInterest = this.calculateTotalInterest(debt.loanAmount, debt.interestRate, debt.loanTenure);
        const progress = Math.min(100, (monthsPaid / debt.loanTenure) * 100);
        const remainingMonths = Math.max(0, debt.loanTenure - monthsPaid);
        const totalPaid = emi * Math.min(monthsPaid, debt.loanTenure);

        return `
            <div class="debt-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">${this.escapeHtml(debt.name)}</div>
                    </div>
                    <span class="card-type-badge">
                        ${this.typeEmojis[debt.type]} ${this.typeLabels[debt.type]}
                    </span>
                </div>
                <div class="debt-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="progress-labels">
                        <span>${progress.toFixed(1)}% complete</span>
                        <span>${remainingMonths} months left</span>
                    </div>
                </div>
                <div class="card-stats">
                    <div class="stat">
                        <div class="stat-label">Loan Amount</div>
                        <div class="stat-value">${formatCurrency(debt.loanAmount)}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">EMI</div>
                        <div class="stat-value">${formatCurrency(emi)}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Remaining</div>
                        <div class="stat-value negative">${formatCurrency(remainingBalance)}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Total Interest</div>
                        <div class="stat-value negative">${formatCurrency(totalInterest)}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Total Paid</div>
                        <div class="stat-value positive">${formatCurrency(totalPaid)}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Interest Rate</div>
                        <div class="stat-value">${debt.interestRate}% p.a.</div>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn-sm btn-edit" onclick="Debts.edit('${debt.id}')">Edit</button>
                    <button class="btn-danger" onclick="Debts.delete('${debt.id}')">Delete</button>
                </div>
            </div>`;
    },

    // Save debt
    save(data) {
        const debts = Storage.getDebts();
        if (data.id) {
            const idx = debts.findIndex(d => d.id === data.id);
            if (idx !== -1) debts[idx] = data;
        } else {
            data.id = Storage.generateId();
            debts.push(data);
        }
        Storage.saveDebts(debts);
        this.render();
        Summary.render();
    },

    // Edit debt
    edit(id) {
        const debts = Storage.getDebts();
        const debt = debts.find(d => d.id === id);
        if (!debt) return;

        document.getElementById('debtModalTitle').textContent = 'Edit Debt';
        document.getElementById('debtId').value = debt.id;
        document.getElementById('debtName').value = debt.name;
        document.getElementById('debtType').value = debt.type;
        document.getElementById('loanAmount').value = debt.loanAmount;
        document.getElementById('interestRate').value = debt.interestRate;
        document.getElementById('loanTenure').value = debt.loanTenure;
        document.getElementById('loanStartDate').value = debt.startDate;
        document.getElementById('emiAmount').value = debt.emiAmount || '';

        document.getElementById('debtModal').classList.add('active');
    },

    // Delete debt
    delete(id) {
        Investments._showConfirmModal('Are you sure you want to delete this debt?', () => {
            const debts = Storage.getDebts().filter(d => d.id !== id);
            Storage.saveDebts(debts);
            this.render();
            Summary.render();
            showToast('Debt deleted');
        });
    },

    // Get total outstanding debt
    getTotalOutstanding() {
        const debts = Storage.getDebts();
        return debts.reduce((total, debt) => {
            const monthsPaid = this.getMonthsPaid(debt.startDate);
            const remaining = this.calculateRemainingBalance(
                debt.loanAmount, debt.interestRate, debt.loanTenure, Math.min(monthsPaid, debt.loanTenure)
            );
            return total + remaining;
        }, 0);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
