// SIPs View - shows all SIPs across all funds in a modal
const SIPsView = {
    showAllSIPs() {
        document.getElementById('detailModalTitle').textContent = 'All SIPs';
        document.getElementById('detailModalContent').innerHTML = this._buildContent();
        document.getElementById('detailModal').classList.add('active');
    },

    render() {
        // Only re-render if the modal is open and showing SIPs
        const modal = document.getElementById('detailModal');
        const title = document.getElementById('detailModalTitle');
        if (modal.classList.contains('active') && title.textContent === 'All SIPs') {
            document.getElementById('detailModalContent').innerHTML = this._buildContent();
        }
    },

    _buildContent() {
        const investments = Storage.getInvestments();
        // Only show funds that have active SIPs
        const fundsWithActiveSIPs = investments.filter(inv => inv.sips && inv.sips.length > 0 && inv.sips.some(s => s.active));
        // All funds available for adding new SIPs
        const allFunds = investments.filter(inv => inv.type === 'mutual_fund' || inv.sips);
        const fundsWithSIPs = fundsWithActiveSIPs;

        if (fundsWithSIPs.length === 0) {
            return `
                <div class="sip-no-active">
                    <p>No active SIPs. Add a SIP to one of your funds below.</p>
                </div>
                ${this._buildAddSIPDropdown(allFunds)}
            `;
        }

        // Calculate totals
        const allActiveSIPs = [];
        let totalMonthly = 0;
        fundsWithSIPs.forEach(inv => {
            if (inv.sips) {
                inv.sips.forEach(sip => {
                    if (sip.active) {
                        totalMonthly += sip.amount;
                        allActiveSIPs.push({ ...sip, fundName: inv.name, fundId: inv.id });
                    }
                });
            }
        });

        // Summary cards
        let html = `
            <div class="sip-overview-cards">
                <div class="summary-card">
                    <div class="card-label">Total Monthly SIP</div>
                    <div class="card-value">${formatCurrency(totalMonthly)}</div>
                    <div class="card-sub">${allActiveSIPs.length} active SIP(s)</div>
                </div>
                <div class="summary-card">
                    <div class="card-label">Yearly Investment</div>
                    <div class="card-value">${formatCurrency(totalMonthly * 12)}</div>
                    <div class="card-sub">via SIPs</div>
                </div>
            </div>
        `;

        // Group by fund, order SIPs by date
        html += '<div class="sip-funds-list">';

        fundsWithSIPs.forEach(inv => {
            const sips = (inv.sips || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
            const activeSIPs = sips.filter(s => s.active);
            const monthlyTotal = activeSIPs.reduce((sum, s) => sum + s.amount, 0);

            html += `
                <div class="sip-fund-group">
                    <div class="sip-fund-header">
                        <div class="sip-fund-header-left">
                            <div class="sip-fund-name">${inv.name}</div>
                            <div class="sip-fund-meta">${activeSIPs.length} active · ${formatCurrency(monthlyTotal)}/month</div>
                        </div>
                        <button class="btn-sm btn-primary" onclick="SIPsView.showAddSIP('${inv.id}')">+ Add SIP</button>
                    </div>
                    <div class="sip-fund-items">
            `;

            if (sips.length === 0) {
                html += '<div class="sip-empty-fund">No SIPs registered for this fund</div>';
            } else {
                sips.forEach((sip, idx) => {
                    const sipDay = new Date(sip.startDate).getDate();
                    const installmentCount = sip.installments ? sip.installments.length : 0;
                    const totalInvested = sip.installments
                        ? sip.installments.reduce((sum, inst) => sum + inst.amount, 0)
                        : 0;
                    const totalUnits = sip.installments
                        ? sip.installments.reduce((sum, inst) => sum + inst.units, 0)
                        : 0;

                    html += `
                        <div class="sip-view-item ${sip.active ? '' : 'sip-inactive'}">
                            <div class="sip-view-main">
                                <div class="sip-view-amount">${formatCurrency(sip.amount)}<span>/month on ${sipDay}${this._getOrdinal(sipDay)}</span></div>
                                <div class="sip-view-dates">
                                    ${new Date(sip.startDate).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'})}
                                    ${sip.endDate ? ' → ' + new Date(sip.endDate).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'}) : ' → Present'}
                                </div>
                                ${installmentCount > 0 ? `<div class="sip-view-stats">${installmentCount} installments · ${formatCurrency(totalInvested)} invested · ${totalUnits.toFixed(3)} units added</div>` : ''}
                            </div>
                            <div class="sip-view-actions">
                                <span class="sip-badge ${sip.active ? 'sip-active-badge' : 'sip-stopped-badge'}">${sip.active ? 'Active' : 'Stopped'}</span>
                                <button class="btn-sm btn-edit" onclick="SIPsView.editSIP('${inv.id}', ${idx})">Edit</button>
                                ${sip.active ? `<button class="btn-sm btn-danger" onclick="SIPsView.stopSIP('${inv.id}', ${idx})">Stop</button>` : ''}
                                <button class="btn-sm btn-danger" onclick="SIPsView.deleteSIP('${inv.id}', ${idx})">×</button>
                            </div>
                        </div>
                    `;
                });
            }

            html += '</div></div>';
        });

        html += '</div>';
        html += this._buildAddSIPDropdown(allFunds);
        return html;
    },

    _buildAddSIPDropdown(funds) {
        if (funds.length === 0) return '<p style="color:var(--text-muted);font-size:0.85rem;margin-top:16px;">Import funds first to add SIPs.</p>';

        return `
            <div class="sip-add-to-fund">
                <h4>Add SIP to Fund</h4>
                <div class="form-group">
                    <select id="sipFundSelect">
                        <option value="">Select a fund...</option>
                        ${funds.map(f => '<option value="' + f.id + '">' + f.name.substring(0, 50) + '</option>').join('')}
                    </select>
                </div>
                <button class="btn-primary" onclick="SIPsView._addSIPFromDropdown()">Next</button>
            </div>
        `;
    },

    _addSIPFromDropdown() {
        const fundId = document.getElementById('sipFundSelect').value;
        if (!fundId) { showToast('Select a fund first'); return; }
        this.showAddSIP(fundId);
    },

    showAddSIP(investmentId) {
        document.getElementById('detailModalTitle').textContent = 'Add SIP';
        document.getElementById('detailModalContent').innerHTML = `
            <div class="sip-add-form">
                <input type="hidden" id="sipEditInvId" value="${investmentId}">
                <input type="hidden" id="sipEditIdx" value="-1">
                <div class="form-row">
                    <div class="form-group">
                        <label>Amount (₹/month)</label>
                        <input type="number" id="sipFormAmount" placeholder="5000" min="100" step="any">
                    </div>
                    <div class="form-group">
                        <label>Start Date</label>
                        <input type="date" id="sipFormStartDate">
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn-secondary" onclick="SIPsView.showAllSIPs()">Back</button>
                    <button class="btn-primary" onclick="SIPsView.saveSIP()">Save SIP</button>
                </div>
            </div>
        `;
    },

    editSIP(investmentId, sipIndex) {
        const investments = Storage.getInvestments();
        const inv = investments.find(i => i.id === investmentId);
        if (!inv || !inv.sips || !inv.sips[sipIndex]) return;

        const sip = inv.sips[sipIndex];

        document.getElementById('detailModalTitle').textContent = 'Edit SIP';
        document.getElementById('detailModalContent').innerHTML = `
            <div class="sip-add-form">
                <input type="hidden" id="sipEditInvId" value="${investmentId}">
                <input type="hidden" id="sipEditIdx" value="${sipIndex}">
                <div class="form-row">
                    <div class="form-group">
                        <label>Amount (₹/month)</label>
                        <input type="number" id="sipFormAmount" value="${sip.amount}" min="100" step="any">
                    </div>
                    <div class="form-group">
                        <label>Start Date</label>
                        <input type="date" id="sipFormStartDate" value="${sip.startDate}">
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn-secondary" onclick="SIPsView.showAllSIPs()">Back</button>
                    <button class="btn-primary" onclick="SIPsView.saveSIP()">Update SIP</button>
                </div>
            </div>
        `;
    },

    saveSIP() {
        const investmentId = document.getElementById('sipEditInvId').value;
        const sipIndex = parseInt(document.getElementById('sipEditIdx').value);
        const amount = parseFloat(document.getElementById('sipFormAmount').value);
        const startDate = document.getElementById('sipFormStartDate').value;

        if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
        if (!startDate) { showToast('Select a start date'); return; }

        const investments = Storage.getInvestments();
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        if (!inv.sips) inv.sips = [];

        if (sipIndex >= 0 && inv.sips[sipIndex]) {
            // Edit existing
            inv.sips[sipIndex].amount = amount;
            inv.sips[sipIndex].startDate = startDate;
        } else {
            // Add new
            inv.sips.push({
                id: Storage.generateId(),
                amount: amount,
                startDate: startDate,
                endDate: '',
                active: true,
                installments: []
            });
        }

        inv.monthlySIP = inv.sips.filter(s => s.active).reduce((sum, s) => sum + s.amount, 0);
        Storage.saveInvestments(investments);

        this.showAllSIPs();
        Investments.render();
        showToast(sipIndex >= 0 ? 'SIP updated' : 'SIP added');
    },

    stopSIP(investmentId, sipIndex) {
        const investments = Storage.getInvestments();
        const inv = investments.find(i => i.id === investmentId);
        if (!inv || !inv.sips || !inv.sips[sipIndex]) return;

        inv.sips[sipIndex].active = false;
        inv.sips[sipIndex].endDate = new Date().toISOString().split('T')[0];
        inv.monthlySIP = inv.sips.filter(s => s.active).reduce((sum, s) => sum + s.amount, 0);

        Storage.saveInvestments(investments);
        this.showAllSIPs();
        Investments.render();
        showToast('SIP stopped');
    },

    deleteSIP(investmentId, sipIndex) {
        Investments._showConfirmModal('Delete this SIP record?', () => {
            const investments = Storage.getInvestments();
            const inv = investments.find(i => i.id === investmentId);
            if (!inv || !inv.sips) return;

            inv.sips.splice(sipIndex, 1);
            inv.monthlySIP = inv.sips.filter(s => s.active).reduce((sum, s) => sum + s.amount, 0);

            localStorage.setItem('pm_investments', JSON.stringify(investments));
            if (typeof SheetsBackend !== 'undefined' && typeof GoogleAuth !== 'undefined' && GoogleAuth.isSignedIn() && SheetsBackend.spreadsheetId) {
                SheetsBackend.syncInvestments(investments);
            }

            this.showAllSIPs();
            Investments.render();
            showToast('SIP deleted');
        });
    },

    _getOrdinal(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    }
};
