// Summary module
const Summary = {
    render() {
        const investments = Storage.getInvestments();
        const debts = Storage.getDebts();
        const rates = CurrencyAPI.rates || {};

        // Calculate totals in INR
        const totalAssets = investments.reduce((sum, inv) => {
            const cur = inv.currency || 'INR';
            const rateToINR = cur === 'INR' ? 1 : (rates[cur] ? (1 / rates[cur]) : 1);
            let value;
            if (inv.currentPrice && inv.shares > 0) {
                value = inv.shares * inv.currentPrice;
            } else if (inv.liveNAV && inv.units > 0) {
                value = inv.units * inv.liveNAV;
            } else if (inv.shares > 0 && inv.avgBuyPrice > 0) {
                value = inv.shares * parseFloat(inv.avgBuyPrice);
            } else {
                value = inv.initialCorpus ? Investments.calculateCurrentValue(inv) : inv.currentCorpus;
            }
            return sum + (value * rateToINR);
        }, 0);

        // Calculate total invested
        const totalInvested = investments.reduce((sum, inv) => {
            const cur = inv.currency || 'INR';
            const rateToINR = cur === 'INR' ? 1 : (rates[cur] ? (1 / rates[cur]) : 1);
            return sum + (Investments.calculateTotalInvested(inv) * rateToINR);
        }, 0);

        const totalDebts = Debts.getTotalOutstanding();
        const netWorth = totalAssets - totalDebts;
        const totalGains = totalAssets - totalInvested;
        const gainsPercent = totalInvested > 0 ? ((totalGains / totalInvested) * 100).toFixed(1) : 0;

        // Update summary cards
        document.getElementById('totalAssets').textContent = formatCurrency(totalAssets);
        document.getElementById('totalDebts').textContent = formatCurrency(totalDebts);
        document.getElementById('netWorth').textContent = formatCurrency(netWorth);
        document.getElementById('assetsCount').textContent = `${investments.length} instrument${investments.length !== 1 ? 's' : ''} · Invested: ${formatCurrency(totalInvested)}`;
        document.getElementById('debtsCount').textContent = `${debts.length} loan${debts.length !== 1 ? 's' : ''}`;

        // Show gains under net worth
        const networthChange = document.getElementById('networthChange');
        if (networthChange) {
            networthChange.innerHTML = `<span class="${totalGains >= 0 ? 'positive' : 'negative'}">P&L: ${totalGains >= 0 ? '+' : ''}${gainsPercent}% (${formatCurrency(totalGains)})</span>`;
        }

        // Render allocation bar
        this.renderAllocation(investments, totalAssets);

        // Render overviews
        this.renderInvestmentOverview(investments);
        this.renderDebtOverview(debts);
    },

    renderAllocation(investments, total) {
        const bar = document.getElementById('allocationBar');
        const legend = document.getElementById('allocationLegend');

        if (investments.length === 0 || total === 0) {
            bar.innerHTML = '';
            legend.innerHTML = '<span class="legend-item" style="color:var(--text-muted)">No investments to show</span>';
            return;
        }

        const rates = CurrencyAPI.rates || {};

        // Group by type, convert to INR
        const groups = {};
        investments.forEach(inv => {
            if (!groups[inv.type]) groups[inv.type] = 0;
            const cur = inv.currency || 'INR';
            const rateToINR = cur === 'INR' ? 1 : (rates[cur] ? (1 / rates[cur]) : 1);

            let value;
            if (inv.currentPrice && inv.shares > 0) {
                value = inv.shares * inv.currentPrice;
            } else if (inv.liveNAV && inv.units > 0) {
                value = inv.units * inv.liveNAV;
            } else if (inv.shares > 0 && inv.avgBuyPrice > 0) {
                value = inv.shares * parseFloat(inv.avgBuyPrice);
            } else {
                value = inv.initialCorpus ? Investments.calculateCurrentValue(inv) : inv.currentCorpus;
            }

            groups[inv.type] += value * rateToINR;
        });

        // Sort by value
        const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);

        bar.innerHTML = sorted.map(([type, value]) => {
            const percent = (value / total) * 100;
            return `<div class="allocation-segment" style="width:${percent}%;background:${Investments.typeColors[type]}" title="${Investments.typeLabels[type]}: ${percent.toFixed(1)}%"></div>`;
        }).join('');

        legend.innerHTML = sorted.map(([type, value]) => {
            const percent = (value / total) * 100;
            return `
                <span class="legend-item">
                    <span class="legend-dot" style="background:${Investments.typeColors[type]}"></span>
                    ${Investments.typeLabels[type]} (${percent.toFixed(1)}%)
                </span>`;
        }).join('');
    },

    renderInvestmentOverview(investments) {
        const container = document.getElementById('investmentOverview');
        if (investments.length === 0) {
            container.innerHTML = '<div class="empty-state">No investments added yet</div>';
            return;
        }

        const rates = CurrencyAPI.rates || {};

        // Group by type and show summary per category
        const groups = {};
        investments.forEach(inv => {
            const type = inv.type || 'other';
            if (!groups[type]) groups[type] = { count: 0, valueINR: 0 };
            groups[type].count++;

            const cur = inv.currency || 'INR';
            const rateToINR = cur === 'INR' ? 1 : (rates[cur] ? (1 / rates[cur]) : 1);
            let value;
            if (inv.currentPrice && inv.shares > 0) value = inv.shares * inv.currentPrice;
            else if (inv.liveNAV && inv.units > 0) value = inv.units * inv.liveNAV;
            else if (inv.shares > 0 && inv.avgBuyPrice > 0) value = inv.shares * parseFloat(inv.avgBuyPrice);
            else value = inv.initialCorpus ? Investments.calculateCurrentValue(inv) : inv.currentCorpus;
            groups[type].valueINR += value * rateToINR;
        });

        const sorted = Object.entries(groups).sort((a, b) => b[1].valueINR - a[1].valueINR);
        const total = sorted.reduce((s, [, g]) => s + g.valueINR, 0);

        container.innerHTML = sorted.map(([type, g]) => {
            const pct = total > 0 ? ((g.valueINR / total) * 100).toFixed(1) : 0;
            return `
                <div class="overview-item" onclick="document.querySelector('[data-tab=investments]').click(); setTimeout(() => Investments.expandCategory('${type}'), 100)">
                    <div class="overview-item-left">
                        <div class="overview-item-icon" style="background:${Investments.typeColors[type]}22;color:${Investments.typeColors[type]}">
                            ${Investments.typeEmojis[type] || ''}
                        </div>
                        <div>
                            <div class="overview-item-name">${Investments.typeLabels[type] || type}</div>
                            <div class="overview-item-type">${g.count} holding${g.count > 1 ? 's' : ''} · ${pct}%</div>
                        </div>
                    </div>
                    <div class="overview-item-value">${formatCurrency(g.valueINR)}</div>
                </div>
            `;
        }).join('');
    },

    showInvestmentDetail(id) {
        const investments = Storage.getInvestments();
        const inv = investments.find(i => i.id === id);
        if (!inv) return;

        const currentValue = inv.initialCorpus ? Investments.calculateCurrentValue(inv) : inv.currentCorpus;
        const futureValue = Investments.calculateFutureValue(
            currentValue, inv.monthlySIP || 0, inv.expectedReturn, inv.investmentHorizon
        );
        const totalInvested = Investments.calculateTotalInvested(inv);
        const gains = currentValue - totalInvested;
        const gainsPercent = totalInvested > 0 ? ((gains / totalInvested) * 100).toFixed(0) : 0;
        const sipMonths = Investments.getSIPMonths(inv.sipStartDate);

        const tip = inv.monthlySIP > 0
            ? `Increasing your SIP by just ${formatCurrency(inv.monthlySIP * 0.1)} could add ~${formatCurrency(Investments.calculateFutureValue(0, inv.monthlySIP * 0.1, inv.expectedReturn, inv.investmentHorizon))} to your corpus.`
            : `Starting a monthly SIP of even ₹5,000 at ${inv.expectedReturn}% for ${inv.investmentHorizon} years would grow to ${formatCurrency(Investments.calculateFutureValue(0, 5000, inv.expectedReturn, inv.investmentHorizon))}.`;

        document.getElementById('detailModalTitle').textContent = inv.name;
        document.getElementById('detailModalContent').innerHTML = `
            <div class="detail-badge" style="background:${Investments.typeColors[inv.type]}22;color:${Investments.typeColors[inv.type]}">
                ${Investments.typeEmojis[inv.type]} ${Investments.typeLabels[inv.type]}
            </div>
            <div class="detail-grid">
                <div class="detail-stat">
                    <div class="detail-stat-label">Initial Investment</div>
                    <div class="detail-stat-value">${formatCurrency(inv.initialCorpus || inv.currentCorpus)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Current Value</div>
                    <div class="detail-stat-value">${formatCurrency(currentValue)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Invested</div>
                    <div class="detail-stat-value">${formatCurrency(totalInvested)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Gains</div>
                    <div class="detail-stat-value" style="color:${gains >= 0 ? 'var(--success)' : 'var(--danger)'}">${gains >= 0 ? '+' : ''}${gainsPercent}% (${formatCurrency(gains)})</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Monthly SIP</div>
                    <div class="detail-stat-value">${inv.monthlySIP ? formatCurrency(inv.monthlySIP) : 'None'}${sipMonths > 0 ? ` (${sipMonths} months)` : ''}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Expected Return</div>
                    <div class="detail-stat-value">${inv.expectedReturn}% p.a.</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Projected Value</div>
                    <div class="detail-stat-value" style="color:var(--success)">${formatCurrency(futureValue)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Horizon</div>
                    <div class="detail-stat-value">${inv.investmentHorizon} years</div>
                </div>
            </div>
            <div class="detail-tip">
                <strong>💡 Tip:</strong> ${tip}
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    renderDebtOverview(debts) {
        const container = document.getElementById('debtOverview');
        if (debts.length === 0) {
            container.innerHTML = '<div class="empty-state">No debts added yet</div>';
            return;
        }

        container.innerHTML = debts.map(debt => {
            const monthsPaid = Debts.getMonthsPaid(debt.startDate);
            const remaining = Debts.calculateRemainingBalance(
                debt.loanAmount, debt.interestRate, debt.loanTenure, Math.min(monthsPaid, debt.loanTenure)
            );
            const progress = Math.min(100, (monthsPaid / debt.loanTenure) * 100);

            return `
                <div class="overview-item" onclick="Summary.showDebtDetail('${debt.id}')">
                    <div class="overview-item-left">
                        <div class="overview-item-icon" style="background:var(--danger-light);color:var(--danger)">
                            ${Debts.typeEmojis[debt.type]}
                        </div>
                        <div>
                            <div class="overview-item-name">${Debts.escapeHtml ? Debts.escapeHtml(debt.name) : debt.name}</div>
                            <div class="overview-item-type">${progress.toFixed(0)}% paid off</div>
                        </div>
                    </div>
                    <div class="overview-item-value" style="color:var(--danger)">${formatCurrency(remaining)}</div>
                </div>
            `;
        }).join('');
    },

    showDebtDetail(id) {
        const debts = Storage.getDebts();
        const debt = debts.find(d => d.id === id);
        if (!debt) return;

        const monthsPaid = Debts.getMonthsPaid(debt.startDate);
        const remaining = Debts.calculateRemainingBalance(
            debt.loanAmount, debt.interestRate, debt.loanTenure, Math.min(monthsPaid, debt.loanTenure)
        );
        const progress = Math.min(100, (monthsPaid / debt.loanTenure) * 100);
        const emi = debt.emiAmount || Debts.calculateEMI(debt.loanAmount, debt.interestRate, debt.loanTenure);
        const totalInterest = Debts.calculateTotalInterest(debt.loanAmount, debt.interestRate, debt.loanTenure);
        const totalPaid = emi * Math.min(monthsPaid, debt.loanTenure);
        const remainingMonths = Math.max(0, debt.loanTenure - monthsPaid);
        const principalPaid = debt.loanAmount - remaining;
        const interestPaid = totalPaid - principalPaid;

        const tip = this._getDebtTip(debt, remaining, emi, remainingMonths, totalInterest);

        document.getElementById('detailModalTitle').textContent = debt.name;
        document.getElementById('detailModalContent').innerHTML = `
            <div class="detail-badge" style="background:var(--danger-light);color:var(--danger)">
                ${Debts.typeEmojis[debt.type]} ${Debts.typeLabels[debt.type]}
            </div>
            <div class="detail-progress">
                <div class="detail-progress-bar">
                    <div class="detail-progress-fill" style="width:${progress}%"></div>
                </div>
                <div class="detail-progress-labels">
                    <span>${monthsPaid} months paid</span>
                    <span>${remainingMonths} months remaining</span>
                </div>
            </div>
            <div class="detail-grid">
                <div class="detail-stat">
                    <div class="detail-stat-label">Loan Amount</div>
                    <div class="detail-stat-value">${formatCurrency(debt.loanAmount)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">EMI</div>
                    <div class="detail-stat-value">${formatCurrency(emi)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Interest Rate</div>
                    <div class="detail-stat-value">${debt.interestRate}% p.a.</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Outstanding</div>
                    <div class="detail-stat-value" style="color:var(--danger)">${formatCurrency(remaining)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Principal Paid</div>
                    <div class="detail-stat-value" style="color:var(--success)">${formatCurrency(principalPaid)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Interest Paid</div>
                    <div class="detail-stat-value" style="color:var(--danger)">${formatCurrency(interestPaid)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Interest</div>
                    <div class="detail-stat-value" style="color:var(--danger)">${formatCurrency(totalInterest)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Loan Ends</div>
                    <div class="detail-stat-value">${this._getEndDate(debt.startDate, debt.loanTenure)}</div>
                </div>
            </div>
            <div class="detail-tip">
                <strong>💡 Tip:</strong> ${tip}
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    _getEndDate(startDate, tenureMonths) {
        const start = new Date(startDate);
        start.setMonth(start.getMonth() + tenureMonths);
        return start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    },

    _getDebtTip(debt, remaining, emi, remainingMonths, totalInterest) {
        const extraEmi = emi * 0.1;
        const monthlyRate = debt.interestRate / 100 / 12;

        // Calculate months saved by paying 10% extra
        if (monthlyRate > 0 && remaining > 0) {
            const newEmi = emi + extraEmi;
            const monthsWithExtra = Math.ceil(
                Math.log(newEmi / (newEmi - remaining * monthlyRate)) / Math.log(1 + monthlyRate)
            );
            const monthsSaved = remainingMonths - monthsWithExtra;

            if (monthsSaved > 0) {
                const interestSaved = (emi * remainingMonths) - (newEmi * monthsWithExtra);
                return `Paying just ${formatCurrency(extraEmi)} extra per month could save you ~${formatCurrency(Math.max(0, interestSaved))} in interest and close this loan ${monthsSaved} months earlier.`;
            }
        }

        if (remainingMonths <= 12) {
            return `Almost there! Only ${remainingMonths} EMIs left. You'll be debt-free on this loan by ${this._getEndDate(debt.startDate, debt.loanTenure)}.`;
        }

        return `You've paid off ${((debt.loanAmount - remaining) / debt.loanAmount * 100).toFixed(0)}% of the principal. Consider prepaying when you have surplus funds to reduce interest burden.`;
    }
};
