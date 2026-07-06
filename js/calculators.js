// Calculators module
const Calculators = {
    render() {
        const container = document.getElementById('calcContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="calc-grid">
                <div class="calc-card" onclick="Calculators.showSIPCalc()">
                    <div class="calc-icon">📈</div>
                    <div class="calc-title">SIP Calculator</div>
                    <div class="calc-desc">Project future value of your current investments + SIPs</div>
                </div>
                <div class="calc-card" onclick="Calculators.showTopupCalc()">
                    <div class="calc-icon">⬆️</div>
                    <div class="calc-title">Top-up Calculator</div>
                    <div class="calc-desc">See impact of increasing SIP amount yearly</div>
                </div>
                <div class="calc-card" onclick="Calculators.showGoalCalc()">
                    <div class="calc-icon">🎯</div>
                    <div class="calc-title">Goal-based SIP</div>
                    <div class="calc-desc">How much extra to invest monthly to reach your goal</div>
                </div>
                <div class="calc-card" onclick="Calculators.showEMICalc()">
                    <div class="calc-icon">🏦</div>
                    <div class="calc-title">EMI Calculator</div>
                    <div class="calc-desc">Calculate EMI, total interest, and GST impact</div>
                </div>
            </div>
        `;
    },

    // SIP Calculator
    showSIPCalc() {
        const investments = Storage.getInvestments();
        const totalCorpus = investments.reduce((sum, inv) => {
            if (inv.liveNAV && inv.units > 0) return sum + inv.units * inv.liveNAV;
            return sum + (inv.currentCorpus || inv.initialCorpus || 0);
        }, 0);
        const totalSIP = investments.reduce((sum, inv) => {
            const sips = Array.isArray(inv.sips) ? inv.sips : [];
            return sum + sips.filter(s => s.active).reduce((s, sip) => s + sip.amount, 0);
        }, 0);

        document.getElementById('detailModalTitle').textContent = 'SIP Calculator';
        document.getElementById('detailModalContent').innerHTML = `
            <div class="calc-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Current Portfolio Value (₹)</label>
                        <input type="number" id="calcCorpus" value="${Math.round(totalCorpus)}" step="any">
                    </div>
                    <div class="form-group">
                        <label>Monthly SIP (₹)</label>
                        <input type="number" id="calcSIP" value="${Math.round(totalSIP)}" step="any">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Expected Return (% p.a.)</label>
                        <input type="number" id="calcReturn" value="12" step="0.1">
                    </div>
                    <div class="form-group">
                        <label>Tenure (years)</label>
                        <input type="number" id="calcYears" value="10" min="1" max="50">
                    </div>
                </div>
                <button class="btn-primary" onclick="Calculators._calcSIP()">Calculate</button>
                <div id="calcSIPResult" class="calc-result"></div>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    _calcSIP() {
        const corpus = parseFloat(document.getElementById('calcCorpus').value) || 0;
        const sip = parseFloat(document.getElementById('calcSIP').value) || 0;
        const rate = parseFloat(document.getElementById('calcReturn').value) || 12;
        const years = parseInt(document.getElementById('calcYears').value) || 10;

        const monthlyRate = rate / 100 / 12;
        const months = years * 12;
        const corpusFV = corpus * Math.pow(1 + monthlyRate, months);
        const sipFV = monthlyRate > 0
            ? sip * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate)
            : sip * months;
        const totalFV = corpusFV + sipFV;
        const totalInvested = corpus + (sip * months);
        const gains = totalFV - totalInvested;

        document.getElementById('calcSIPResult').innerHTML = `
            <div class="detail-grid" style="margin-top:16px">
                <div class="detail-stat">
                    <div class="detail-stat-label">Future Value</div>
                    <div class="detail-stat-value positive">${formatCurrency(totalFV)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Invested</div>
                    <div class="detail-stat-value">${formatCurrency(totalInvested)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Wealth Gained</div>
                    <div class="detail-stat-value positive">${formatCurrency(gains)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Corpus Growth</div>
                    <div class="detail-stat-value">${formatCurrency(corpusFV)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">SIP Growth</div>
                    <div class="detail-stat-value">${formatCurrency(sipFV)}</div>
                </div>
            </div>
        `;
    },

    // Top-up Calculator
    showTopupCalc() {
        const investments = Storage.getInvestments();
        const totalSIP = investments.reduce((sum, inv) => {
            const sips = Array.isArray(inv.sips) ? inv.sips : [];
            return sum + sips.filter(s => s.active).reduce((s, sip) => s + sip.amount, 0);
        }, 0);

        document.getElementById('detailModalTitle').textContent = 'Top-up Calculator';
        document.getElementById('detailModalContent').innerHTML = `
            <div class="calc-form">
                <p class="calc-desc-text">See how increasing your SIP by a fixed % each year accelerates wealth creation.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>Current Monthly SIP (₹)</label>
                        <input type="number" id="topupSIP" value="${Math.round(totalSIP)}" step="any">
                    </div>
                    <div class="form-group">
                        <label>Annual Top-up (%)</label>
                        <input type="number" id="topupPercent" value="10" step="1">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Expected Return (% p.a.)</label>
                        <input type="number" id="topupReturn" value="12" step="0.1">
                    </div>
                    <div class="form-group">
                        <label>Tenure (years)</label>
                        <input type="number" id="topupYears" value="10" min="1" max="50">
                    </div>
                </div>
                <button class="btn-primary" onclick="Calculators._calcTopup()">Calculate</button>
                <div id="calcTopupResult" class="calc-result"></div>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    _calcTopup() {
        let sip = parseFloat(document.getElementById('topupSIP').value) || 0;
        const topupPct = parseFloat(document.getElementById('topupPercent').value) || 10;
        const rate = parseFloat(document.getElementById('topupReturn').value) || 12;
        const years = parseInt(document.getElementById('topupYears').value) || 10;
        const monthlyRate = rate / 100 / 12;

        let totalFV = 0;
        let totalInvested = 0;
        let currentSIP = sip;

        for (let yr = 0; yr < years; yr++) {
            for (let mo = 0; mo < 12; mo++) {
                totalInvested += currentSIP;
                const remainingMonths = (years * 12) - (yr * 12 + mo) - 1;
                totalFV += currentSIP * Math.pow(1 + monthlyRate, remainingMonths);
            }
            currentSIP = currentSIP * (1 + topupPct / 100);
        }

        // Without top-up for comparison
        const flatFV = monthlyRate > 0
            ? sip * ((Math.pow(1 + monthlyRate, years * 12) - 1) / monthlyRate) * (1 + monthlyRate)
            : sip * years * 12;
        const extraGain = totalFV - flatFV;

        document.getElementById('calcTopupResult').innerHTML = `
            <div class="detail-grid" style="margin-top:16px">
                <div class="detail-stat">
                    <div class="detail-stat-label">With Top-up</div>
                    <div class="detail-stat-value positive">${formatCurrency(totalFV)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Without Top-up</div>
                    <div class="detail-stat-value">${formatCurrency(flatFV)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Extra Gained</div>
                    <div class="detail-stat-value positive">${formatCurrency(extraGain)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Invested</div>
                    <div class="detail-stat-value">${formatCurrency(totalInvested)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Final Monthly SIP</div>
                    <div class="detail-stat-value">${formatCurrency(currentSIP)}</div>
                </div>
            </div>
        `;
    },

    // Goal-based SIP Calculator
    showGoalCalc() {
        const investments = Storage.getInvestments();
        const totalCorpus = investments.reduce((sum, inv) => sum + (inv.currentCorpus || 0), 0);

        document.getElementById('detailModalTitle').textContent = 'Goal-based SIP Calculator';
        document.getElementById('detailModalContent').innerHTML = `
            <div class="calc-form">
                <p class="calc-desc-text">Calculate how much extra monthly investment you need to reach your goal.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>Goal Amount (₹)</label>
                        <input type="number" id="goalAmount" placeholder="1,00,00,000" step="any">
                    </div>
                    <div class="form-group">
                        <label>Timeline (years)</label>
                        <input type="number" id="goalYears" value="10" min="1" max="50">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Amount already assigned from portfolio (₹)</label>
                        <input type="number" id="goalAssigned" value="${Math.round(totalCorpus)}" step="any">
                    </div>
                    <div class="form-group">
                        <label>Expected Return (% p.a.)</label>
                        <input type="number" id="goalReturn" value="12" step="0.1">
                    </div>
                </div>
                <button class="btn-primary" onclick="Calculators._calcGoal()">Calculate</button>
                <div id="calcGoalResult" class="calc-result"></div>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    _calcGoal() {
        const goal = parseFloat(document.getElementById('goalAmount').value) || 0;
        const years = parseInt(document.getElementById('goalYears').value) || 10;
        const assigned = parseFloat(document.getElementById('goalAssigned').value) || 0;
        const rate = parseFloat(document.getElementById('goalReturn').value) || 12;

        if (goal <= 0) { showToast('Enter a goal amount'); return; }

        const monthlyRate = rate / 100 / 12;
        const months = years * 12;

        // Future value of assigned corpus
        const assignedFV = assigned * Math.pow(1 + monthlyRate, months);

        // Remaining goal after assigned corpus grows
        const remaining = Math.max(0, goal - assignedFV);

        // SIP needed to fill the gap
        let sipNeeded = 0;
        if (remaining > 0 && monthlyRate > 0) {
            sipNeeded = remaining / (((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate));
        } else if (remaining > 0) {
            sipNeeded = remaining / months;
        }

        const totalInvestment = assigned + (sipNeeded * months);

        document.getElementById('calcGoalResult').innerHTML = `
            <div class="detail-grid" style="margin-top:16px">
                <div class="detail-stat">
                    <div class="detail-stat-label">Goal</div>
                    <div class="detail-stat-value">${formatCurrency(goal)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Assigned Corpus will grow to</div>
                    <div class="detail-stat-value">${formatCurrency(assignedFV)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Gap to fill</div>
                    <div class="detail-stat-value" style="color:var(--warning)">${formatCurrency(remaining)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Monthly SIP Needed</div>
                    <div class="detail-stat-value positive">${formatCurrency(sipNeeded)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Investment</div>
                    <div class="detail-stat-value">${formatCurrency(totalInvestment)}</div>
                </div>
            </div>
            ${remaining <= 0 ? '<div class="detail-tip" style="margin-top:12px"><strong>🎉</strong> Your existing corpus will grow beyond your goal! No extra SIP needed.</div>' : ''}
        `;
    },

    // EMI Calculator
    showEMICalc() {
        document.getElementById('detailModalTitle').textContent = 'EMI Calculator';
        document.getElementById('detailModalContent').innerHTML = `
            <div class="calc-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Loan Amount (₹)</label>
                        <input type="number" id="emiLoan" placeholder="50,00,000" step="any">
                    </div>
                    <div class="form-group">
                        <label>Interest Rate (% p.a.)</label>
                        <input type="number" id="emiRate" value="8.5" step="0.01">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Tenure (months)</label>
                        <input type="number" id="emiTenure" value="240" min="1" max="600">
                    </div>
                    <div class="form-group">
                        <label>GST on interest (%)</label>
                        <input type="number" id="emiGST" value="18" step="0.1">
                    </div>
                </div>
                <button class="btn-primary" onclick="Calculators._calcEMI()">Calculate</button>
                <div id="calcEMIResult" class="calc-result"></div>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    _calcEMI() {
        const loan = parseFloat(document.getElementById('emiLoan').value) || 0;
        const annualRate = parseFloat(document.getElementById('emiRate').value) || 8.5;
        const tenure = parseInt(document.getElementById('emiTenure').value) || 240;
        const gstPct = parseFloat(document.getElementById('emiGST').value) || 18;

        if (loan <= 0) { showToast('Enter a loan amount'); return; }

        const monthlyRate = annualRate / 100 / 12;
        let emi;
        if (monthlyRate === 0) {
            emi = loan / tenure;
        } else {
            emi = loan * monthlyRate * Math.pow(1 + monthlyRate, tenure) / (Math.pow(1 + monthlyRate, tenure) - 1);
        }

        const totalPayable = emi * tenure;
        const totalInterest = totalPayable - loan;
        const gstOnInterest = totalInterest * (gstPct / 100);
        const totalCost = totalPayable + gstOnInterest;
        const effectiveEMI = totalCost / tenure;

        document.getElementById('calcEMIResult').innerHTML = `
            <div class="detail-grid" style="margin-top:16px">
                <div class="detail-stat">
                    <div class="detail-stat-label">Monthly EMI</div>
                    <div class="detail-stat-value">${formatCurrency(emi)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Interest</div>
                    <div class="detail-stat-value negative">${formatCurrency(totalInterest)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">GST on Interest (${gstPct}%)</div>
                    <div class="detail-stat-value negative">${formatCurrency(gstOnInterest)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Payable</div>
                    <div class="detail-stat-value">${formatCurrency(totalPayable)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Cost (with GST)</div>
                    <div class="detail-stat-value negative">${formatCurrency(totalCost)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Effective EMI (with GST)</div>
                    <div class="detail-stat-value">${formatCurrency(effectiveEMI)}</div>
                </div>
            </div>
            <div class="detail-tip" style="margin-top:12px">
                <strong>💡</strong> Interest is ${((totalInterest / loan) * 100).toFixed(0)}% of the loan amount. Tenure: ${Math.floor(tenure/12)} years ${tenure%12} months.
            </div>
        `;
    }
};
