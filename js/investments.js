// Investments module
const Investments = {
    typeColors: {
        mutual_fund: '#6366f1',
        stocks: '#ec4899',
        us_stocks: '#3b82f6',
        intl_stocks: '#8b5cf6',
        ppf: '#10b981',
        epf: '#14b8a6',
        fd: '#f59e0b',
        gold: '#eab308',
        real_estate: '#8b5cf6',
        crypto: '#f97316',
        nps: '#06b6d4',
        other: '#64748b'
    },

    typeLabels: {
        mutual_fund: 'Mutual Fund',
        stocks: 'Stocks',
        us_stocks: 'US Stocks',
        intl_stocks: 'Intl Stocks',
        ppf: 'PPF',
        epf: 'EPF',
        fd: 'Fixed Deposit',
        gold: 'Gold',
        real_estate: 'Real Estate',
        crypto: 'Crypto',
        nps: 'NPS',
        other: 'Other'
    },

    typeEmojis: {
        mutual_fund: '\uD83D\uDCC8',
        stocks: '\uD83D\uDCCA',
        us_stocks: '\uD83C\uDDFA\uD83C\uDDF8',
        intl_stocks: '\uD83C\uDF0D',
        ppf: '\uD83C\uDFE6',
        epf: '\uD83C\uDFDB\uFE0F',
        fd: '\uD83D\uDCB0',
        gold: '\uD83E\uDD47',
        real_estate: '\uD83C\uDFE0',
        crypto: '\u20BF',
        nps: '\uD83C\uDFAF',
        other: '\uD83D\uDCBC'
    },

    // Calculate future value with SIP
    calculateFutureValue(corpus, monthlySIP, annualReturn, years) {
        const monthlyRate = annualReturn / 100 / 12;
        const months = years * 12;

        // Future value of current corpus
        const corpusFV = corpus * Math.pow(1 + monthlyRate, months);

        // Future value of SIP
        let sipFV = 0;
        if (monthlySIP > 0 && monthlyRate > 0) {
            sipFV = monthlySIP * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
        } else if (monthlySIP > 0) {
            sipFV = monthlySIP * months;
        }

        return corpusFV + sipFV;
    },

    // Calculate current value based on initial corpus + SIPs grown over time
    // For mutual funds with schemeCode + units, live NAV is fetched separately
    calculateCurrentValue(inv) {
        // If units and live NAV are available (set by fetchAndUpdateNAV), use that
        if (inv.liveNAV && inv.units > 0) {
            return inv.units * inv.liveNAV;
        }

        const monthlyRate = inv.expectedReturn / 100 / 12;

        // Months since initial investment
        const startDate = new Date(inv.investmentStartDate);
        const now = new Date();
        const monthsSinceStart = Math.max(0,
            (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth())
        );

        // Growth of initial corpus
        const corpusGrown = inv.initialCorpus * Math.pow(1 + monthlyRate, monthsSinceStart);

        // Growth of SIPs
        let sipGrown = 0;
        if (inv.monthlySIP > 0 && inv.sipStartDate) {
            const sipStart = new Date(inv.sipStartDate);
            const monthsSinceSIP = Math.max(0,
                (now.getFullYear() - sipStart.getFullYear()) * 12 + (now.getMonth() - sipStart.getMonth())
            );

            if (monthsSinceSIP > 0 && monthlyRate > 0) {
                sipGrown = inv.monthlySIP * ((Math.pow(1 + monthlyRate, monthsSinceSIP) - 1) / monthlyRate) * (1 + monthlyRate);
            } else if (monthsSinceSIP > 0) {
                sipGrown = inv.monthlySIP * monthsSinceSIP;
            }
        }

        return corpusGrown + sipGrown;
    },

    // Fetch live NAV and update investment current value
    async fetchAndUpdateNAV(inv) {
        if (!inv.schemeCode || !inv.units) return inv;

        const navData = await MutualFundAPI.getLatestNAV(inv.schemeCode);
        if (navData) {
            inv.liveNAV = navData.nav;
            inv.navDate = navData.date;
            inv.currentCorpus = inv.units * navData.nav;
        }
        return inv;
    },

    // Fetch NAV for all mutual fund investments
    async refreshAllNAVs() {
        const banner = document.getElementById('liveDataBanner');
        if (banner) {
            banner.style.display = 'flex';
            banner.className = 'live-data-banner loading';
            document.getElementById('liveDataText').textContent = 'Fetching live data...';
        }

        const investments = Storage.getInvestments();
        let updated = false;

        // Try MFAPI first for mutual funds
        for (const inv of investments) {
            if (inv.schemeCode && inv.units > 0) {
                try {
                    const navData = await MutualFundAPI.getLatestNAV(inv.schemeCode);
                    if (navData) {
                        inv.liveNAV = navData.nav;
                        inv.navDate = navData.date;
                        inv.currentCorpus = inv.units * navData.nav;
                        updated = true;
                    }
                } catch (e) { /* continue */ }
            }
        }

        if (updated) {
            localStorage.setItem('pm_investments', JSON.stringify(investments));
            this.render();
            Summary.render();
        }

        // Process pending SIPs
        await this.processPendingSIPs();

        // Fetch stock prices via Google Sheets
        if (banner && banner.style.display !== 'none') {
            document.getElementById('liveDataText').textContent = 'Fetching stock prices...';
        }
        await this._refreshStockPrices();

        // Show completion
        if (banner) {
            if (updated) {
                banner.className = 'live-data-banner done';
                document.getElementById('liveDataText').textContent = 'Live data updated';
            } else {
                banner.className = 'live-data-banner done';
                document.getElementById('liveDataText').textContent = 'Using cached data (API unavailable from localhost)';
            }
            setTimeout(() => { banner.style.display = 'none'; }, 4000);
        }
    },

    // Fetch stock prices separately so MF isn't blocked
    async _refreshStockPrices() {
        if (!GoogleAuth.isSignedIn() || !SheetsBackend.spreadsheetId) return;

        const data = localStorage.getItem('pm_investments');
        if (!data) return;
        const investments = JSON.parse(data);

        // Collect all tickers
        const stockInvs = investments.filter(inv => inv.ticker && inv.shares > 0);
        if (stockInvs.length === 0) return;

        const banner = document.getElementById('liveDataBanner');
        if (banner && banner.style.display !== 'none') {
            document.getElementById('liveDataText').textContent = 'Fetching live stock prices...';
        }

        try {
            // Ensure StockPrices sheet exists with GOOGLEFINANCE formulas
            await this._ensureStockPriceSheet(stockInvs);

            // Wait a moment for GOOGLEFINANCE to calculate
            await new Promise(r => setTimeout(r, 2000));

            // Read prices from sheet
            const prices = await this._readStockPrices(stockInvs);
            if (!prices) return;

            let updated = false;
            for (const inv of stockInvs) {
                const price = prices[inv.ticker];
                if (price && price > 0) {
                    inv.currentPrice = price;
                    inv.currentCorpus = inv.shares * price;
                    updated = true;
                }
            }

            if (updated) {
                localStorage.setItem('pm_investments', JSON.stringify(investments));
                this.render();
                Summary.render();
            }
        } catch (e) {
            console.warn('Stock price refresh failed:', e);
        }
    },

    // Create/update StockPrices sheet with GOOGLEFINANCE formulas
    async _ensureStockPriceSheet(stockInvs) {
        const spreadsheetId = SheetsBackend.spreadsheetId;
        const token = GoogleAuth.getToken();

        // Check if StockPrices sheet exists
        const metaResp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const meta = await metaResp.json();
        const sheetExists = meta.sheets && meta.sheets.some(s => s.properties.title === 'StockPrices');

        if (!sheetExists) {
            // Add the sheet (ignore error if it already exists)
            try {
                await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requests: [{ addSheet: { properties: { title: 'StockPrices' } } }]
                    })
                });
            } catch (e) { /* sheet might already exist */ }
        }

        // Write tickers + GOOGLEFINANCE formulas
        const rows = [['Ticker', 'Price']];
        stockInvs.forEach(inv => {
            rows.push([inv.ticker, `=GOOGLEFINANCE("${inv.ticker}","price")`]);
        });

        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/StockPrices!A1:B${rows.length}?valueInputOption=USER_ENTERED`,
            {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ range: `StockPrices!A1:B${rows.length}`, majorDimension: 'ROWS', values: rows })
            }
        );
    },

    // Read calculated prices from StockPrices sheet
    async _readStockPrices(stockInvs) {
        const spreadsheetId = SheetsBackend.spreadsheetId;
        const token = GoogleAuth.getToken();

        const resp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/StockPrices!A:B`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!resp.ok) return null;
        const data = await resp.json();
        const rows = data.values || [];

        const prices = {};
        for (let i = 1; i < rows.length; i++) {
            const ticker = rows[i][0];
            const price = parseFloat(rows[i][1]);
            if (ticker && !isNaN(price)) {
                prices[ticker] = price;
            }
        }
        return prices;
    },

    // Process SIP installments that have occurred but not yet processed
    async processPendingSIPs() {
        const investments = Storage.getInvestments();
        let anyUpdated = false;

        for (const inv of investments) {
            if (!inv.sips || inv.sips.length === 0 || !inv.schemeCode) continue;

            for (const sip of inv.sips) {
                if (!sip.active) continue;

                const pendingDates = this._getPendingSIPDates(sip, inv.casImportDate);
                if (pendingDates.length === 0) continue;

                for (const sipDate of pendingDates) {
                    // T+1: NAV is applied on the next business day
                    const t1Date = this._getNextDay(sipDate);

                    // Fetch NAV for T+1
                    const navData = await MutualFundAPI.getNAVForDate(inv.schemeCode, t1Date);
                    if (!navData) continue;

                    // Calculate units allotted
                    const unitsAllotted = sip.amount / navData.nav;

                    // Add to investment units
                    inv.units = (inv.units || 0) + unitsAllotted;

                    // Record this installment
                    if (!sip.installments) sip.installments = [];
                    sip.installments.push({
                        date: sipDate,
                        navDate: navData.date,
                        nav: navData.nav,
                        amount: sip.amount,
                        units: unitsAllotted
                    });

                    anyUpdated = true;
                }

                // Update last processed date
                if (pendingDates.length > 0) {
                    sip.lastProcessed = pendingDates[pendingDates.length - 1];
                }
            }

            // Update current corpus
            if (inv.liveNAV && inv.units > 0) {
                inv.currentCorpus = inv.units * inv.liveNAV;
            }
        }

        if (anyUpdated) {
            Storage.saveInvestments(investments);
            this.render();
            Summary.render();
            showToast('SIP units updated automatically');
        }
    },

    // Get SIP dates that haven't been processed yet
    _getPendingSIPDates(sip, casImportDate) {
        const dates = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sipDay = new Date(sip.startDate).getDate();
        const startDate = new Date(sip.startDate);
        const lastProcessed = sip.lastProcessed ? new Date(sip.lastProcessed) : new Date(sip.startDate);
        lastProcessed.setDate(lastProcessed.getDate() - 1);

        // CAS cutoff: only process SIPs AFTER the CAS import date
        const cutoffStart = casImportDate ? new Date(casImportDate) : startDate;

        let current = new Date(lastProcessed);
        current.setMonth(current.getMonth() + 1);
        current.setDate(sipDay);

        // Don't process today's SIP yet (wait for T+1 NAV to be available)
        const cutoffDate = new Date(today);
        cutoffDate.setDate(cutoffDate.getDate() - 2);

        while (current <= cutoffDate) {
            // Only process if AFTER CAS import date
            if (current > cutoffStart && current >= startDate) {
                dates.push(current.toISOString().split('T')[0]);
            }
            current.setMonth(current.getMonth() + 1);
            current.setDate(sipDay);
        }

        return dates.slice(0, 12);
    },

    _getNextDay(dateStr) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    },

    // Get months of SIP completed
    getSIPMonths(sipStartDate) {
        if (!sipStartDate) return 0;
        const start = new Date(sipStartDate);
        const now = new Date();
        return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
    },

    // Calculate total invested amount (actual money put in)
    calculateTotalInvested(inv) {
        let total = inv.initialCorpus || inv.currentCorpus || 0;

        // If SIP history exists, use that for accuracy
        if (inv.sips && inv.sips.length > 0) {
            total = (inv.initialCorpus || 0) + this._calculateTotalSIPInvested(inv.sips);
        } else if (inv.monthlySIP > 0 && inv.sipStartDate) {
            total += inv.monthlySIP * this.getSIPMonths(inv.sipStartDate);
        }

        return total;
    },

    // Render all investments grouped by type - grid view with expand
    render() {
        const investments = Storage.getInvestments();
        const grid = document.getElementById('investmentsGrid');

        if (investments.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                    <p>No investments yet. Add your first investment to get started.</p>
                </div>`;
            return;
        }

        const rates = CurrencyAPI.rates || {};
        const groups = {};
        let portfolioValueINR = 0;
        let portfolioInvestedINR = 0;

        investments.forEach(inv => {
            const currentValue = (inv.liveNAV && inv.units > 0)
                ? inv.units * inv.liveNAV
                : (inv.shares > 0 && inv.avgBuyPrice > 0)
                    ? inv.shares * (inv.currentPrice || inv.avgBuyPrice)
                    : (inv.initialCorpus ? this.calculateCurrentValue(inv) : inv.currentCorpus);
            const invested = this.calculateTotalInvested(inv);
            const cur = inv.currency || 'INR';
            const rateToINR = cur === 'INR' ? 1 : (rates[cur] ? (1 / rates[cur]) : 1);
            const valueINR = currentValue * rateToINR;
            const investedINR = invested * rateToINR;

            portfolioValueINR += valueINR;
            portfolioInvestedINR += investedINR;

            const type = inv.type || 'other';
            if (!groups[type]) groups[type] = { items: [], valueINR: 0, investedINR: 0 };
            groups[type].items.push({ inv, currentValue, invested, cur, rateToINR, valueINR, investedINR });
            groups[type].valueINR += valueINR;
            groups[type].investedINR += investedINR;
        });

        const portfolioGains = portfolioValueINR - portfolioInvestedINR;
        const portfolioGainsPercent = portfolioInvestedINR > 0 ? ((portfolioGains / portfolioInvestedINR) * 100).toFixed(1) : 0;

        // Portfolio summary
        let html = `
            <div class="inv-table-header">
                <div class="inv-table-totals">
                    <span>Portfolio: ${formatCurrency(portfolioValueINR)}</span>
                    <span>Invested: ${formatCurrency(portfolioInvestedINR)}</span>
                    <span class="${portfolioGains >= 0 ? 'positive' : 'negative'}">Gains: ${portfolioGains >= 0 ? '+' : ''}${portfolioGainsPercent}% (${formatCurrency(portfolioGains)})</span>
                </div>
            </div>
        `;

        const typeOrder = ['mutual_fund', 'us_stocks', 'intl_stocks', 'stocks', 'ppf', 'epf', 'nps', 'fd', 'gold', 'real_estate', 'crypto', 'other'];
        const sortedTypes = Object.keys(groups).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));

        // Check if a category is expanded
        const expanded = this._expandedCategory;

        if (expanded && groups[expanded]) {
            // Show collapsed tabs for other categories + expanded view for selected
            html += '<div class="inv-tabs">';
            for (const type of sortedTypes) {
                const g = groups[type];
                const isActive = type === expanded;
                html += `<button class="inv-tab ${isActive ? 'inv-tab-active' : ''}" onclick="Investments.expandCategory('${type}')">
                    ${this.typeEmojis[type] || ''} ${this.typeLabels[type] || type}
                    <span class="inv-tab-value">${formatCurrency(g.valueINR)}</span>
                </button>`;
            }
            html += '</div>';

            // Show MF-specific actions when mutual_fund is expanded
            if (expanded === 'mutual_fund') {
                const mfSIPs = groups.mutual_fund.items.reduce((sum, item) => {
                    return sum + (item.inv.sips || []).filter(s => s.active).reduce((s, sip) => s + sip.amount, 0);
                }, 0);
                html += `<div class="inv-mf-actions">
                    <button class="btn-secondary" onclick="SIPsView.showAllSIPs()">Live SIPs${mfSIPs > 0 ? ' \u00B7 ' + formatCurrency(mfSIPs) + '/mo' : ''}</button>
                    <button class="btn-secondary" onclick="CASImporter.showImportModal()">Import CAS</button>
                </div>`;
            }

            // Expanded category detail
            const group = groups[expanded];
            html += this._renderExpandedGroup(expanded, group);
        } else {
            // Grid view - all categories as boxes
            html += '<div class="inv-category-grid">';
            for (const type of sortedTypes) {
                const g = groups[type];
                const gGains = g.valueINR - g.investedINR;
                const gPercent = g.investedINR > 0 ? ((gGains / g.investedINR) * 100).toFixed(1) : 0;

                // Extra info for mutual funds
                let extraInfo = '';
                if (type === 'mutual_fund') {
                    const mfSIPs = g.items.reduce((sum, item) => {
                        return sum + (item.inv.sips || []).filter(s => s.active).reduce((s, sip) => s + sip.amount, 0);
                    }, 0);
                    if (mfSIPs > 0) {
                        extraInfo = `<div class="inv-cat-extra">SIPs: ${formatCurrency(mfSIPs)}/mo</div>`;
                    }
                }

                // For foreign currency groups, show native currency value + INR
                const groupCurrency = g.items[0] ? (g.items[0].inv.currency || 'INR') : 'INR';
                const isForeignGroup = groupCurrency !== 'INR';
                let valueDisplay = formatCurrency(g.valueINR);
                if (isForeignGroup) {
                    const nativeTotal = g.items.reduce((sum, item) => sum + item.currentValue, 0);
                    const curSymbol = (CurrencyAPI.CURRENCIES[groupCurrency] || {}).symbol || groupCurrency;
                    valueDisplay = `${curSymbol}${nativeTotal.toFixed(2)}<span class="inv-cat-inr">${formatCurrency(g.valueINR)}</span>`;
                }

                html += `
                    <div class="inv-category-box" onclick="Investments.expandCategory('${type}')">
                        <div class="inv-cat-emoji">${this.typeEmojis[type] || ''}</div>
                        <div class="inv-cat-label">${this.typeLabels[type] || type}</div>
                        <div class="inv-cat-value">${valueDisplay}</div>
                        <div class="inv-cat-gains ${gGains >= 0 ? 'positive' : 'negative'}">${gGains >= 0 ? '+' : ''}${gPercent}%</div>
                        <div class="inv-cat-count">${g.items.length} holding${g.items.length > 1 ? 's' : ''}</div>
                        ${extraInfo}
                        <button class="btn-sm inv-cat-whatif" onclick="event.stopPropagation(); Investments.showCategoryWhatIf('${type}')">What-If</button>
                    </div>
                `;
            }
            html += '</div>';
        }

        grid.innerHTML = html;
    },

    _expandedCategory: null,

    expandCategory(type) {
        this._expandedCategory = this._expandedCategory === type ? null : type;
        this.render();
    },

    _renderExpandedGroup(type, group) {
        let html = '<div class="inv-expanded-group">';

        for (const { inv, currentValue, invested, cur, rateToINR, valueINR } of group.items) {
            const gains = currentValue - invested;
            const gainsPercent = invested > 0 ? ((gains / invested) * 100).toFixed(2) : 0;
            const isForeign = cur !== 'INR';
            const curSymbol = (CurrencyAPI.CURRENCIES[cur] || {}).symbol || cur;
            const activeSIPs = (inv.sips || []).filter(s => s.active);
            const monthlySIP = activeSIPs.reduce((sum, s) => sum + s.amount, 0);

            const valueDisplay = isForeign
                ? curSymbol + currentValue.toFixed(2) + '<span class="inv-inr-equiv">\u2248 ' + formatCurrency(valueINR) + '</span>'
                : formatCurrency(currentValue);

            const investedDisplay = isForeign
                ? curSymbol + invested.toFixed(2)
                : formatCurrency(invested);

            html += `
                <div class="inv-row" onclick="Investments.showDetail('${inv.id}')">
                    <div class="inv-row-name">
                        <div>
                            <div class="inv-row-title">${this.escapeHtml(inv.name)}${inv.ticker ? ' <span class="inv-ticker">' + inv.ticker + '</span>' : ''}</div>
                            <div class="inv-row-meta">${isForeign ? cur : ''}${inv.currentPrice ? (isForeign ? ' · ' : '') + 'LTP: ' + curSymbol + parseFloat(inv.currentPrice).toFixed(2) : ''}${inv.navDate ? ' · NAV: ' + inv.navDate : ''}${inv.shares > 0 ? ' · ' + inv.shares + ' shares' : ''}</div>
                        </div>
                    </div>
                    <div class="inv-row-data">
                        <div class="inv-row-cell">
                            <span class="inv-row-label">Value</span>
                            <span class="inv-row-value">${valueDisplay}</span>
                        </div>
                        <div class="inv-row-cell">
                            <span class="inv-row-label">Invested</span>
                            <span class="inv-row-value">${investedDisplay}</span>
                        </div>
                        <div class="inv-row-cell">
                            <span class="inv-row-label">Gains</span>
                            <span class="inv-row-value ${gains >= 0 ? 'positive' : 'negative'}">${gains >= 0 ? '+' : ''}${gainsPercent}% (${curSymbol}${Math.abs(gains).toFixed(2)})</span>
                        </div>
                        <div class="inv-row-cell">
                            <span class="inv-row-label">${inv.shares > 0 ? 'Shares' : monthlySIP > 0 ? 'SIP' : 'Units'}</span>
                            <span class="inv-row-value">${inv.shares > 0 ? inv.shares : (monthlySIP > 0 ? formatCurrency(monthlySIP) + '/mo' : (inv.units > 0 ? inv.units.toFixed(2) : '\u2014'))}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    },

    // Category-level What-If analysis
    showCategoryWhatIf(type) {
        const investments = Storage.getInvestments().filter(inv => inv.type === type);
        const rates = CurrencyAPI.rates || {};

        let totalValueINR = 0;
        let totalSIPINR = 0;

        investments.forEach(inv => {
            const cur = inv.currency || 'INR';
            const rateToINR = cur === 'INR' ? 1 : (rates[cur] ? (1 / rates[cur]) : 1);
            let value;
            if (inv.currentPrice && inv.shares > 0) value = inv.shares * inv.currentPrice;
            else if (inv.liveNAV && inv.units > 0) value = inv.units * inv.liveNAV;
            else if (inv.shares > 0 && inv.avgBuyPrice > 0) value = inv.shares * parseFloat(inv.avgBuyPrice);
            else value = inv.currentCorpus || inv.initialCorpus || 0;
            totalValueINR += value * rateToINR;

            const sips = Array.isArray(inv.sips) ? inv.sips : [];
            const monthlySIP = sips.filter(s => s.active).reduce((s, sip) => s + sip.amount, 0);
            totalSIPINR += monthlySIP * rateToINR;
        });

        const label = this.typeLabels[type] || type;

        document.getElementById('detailModalTitle').textContent = 'What-If: ' + label;
        document.getElementById('detailModalContent').innerHTML = `
            <div class="calc-form">
                <p class="calc-desc-text">Project the future value of your ${label} portfolio with different scenarios.</p>
                <div class="detail-grid" style="margin-bottom:16px">
                    <div class="detail-stat">
                        <div class="detail-stat-label">Current Value</div>
                        <div class="detail-stat-value">${formatCurrency(totalValueINR)}</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-label">Active SIPs</div>
                        <div class="detail-stat-value">${formatCurrency(totalSIPINR)}/mo</div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Additional Lump Sum (₹)</label>
                        <input type="number" id="wifLumpsum" value="0" step="any">
                    </div>
                    <div class="form-group">
                        <label>Top-up SIP (₹/month extra)</label>
                        <input type="number" id="wifTopup" value="0" step="any">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Expected Return (% p.a.)</label>
                        <input type="number" id="wifReturn" value="12" step="0.1">
                    </div>
                    <div class="form-group">
                        <label>Tenure (years)</label>
                        <input type="number" id="wifYears" value="10" min="1" max="50">
                    </div>
                </div>
                <button class="btn-primary" onclick="Investments._calcWhatIf(${totalValueINR}, ${totalSIPINR})">Calculate</button>
                <div id="whatIfResult" class="calc-result"></div>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    _calcWhatIf(currentValue, currentSIP) {
        const lumpsum = parseFloat(document.getElementById('wifLumpsum').value) || 0;
        const topup = parseFloat(document.getElementById('wifTopup').value) || 0;
        const rate = parseFloat(document.getElementById('wifReturn').value) || 12;
        const years = parseInt(document.getElementById('wifYears').value) || 10;

        const monthlyRate = rate / 100 / 12;
        const months = years * 12;
        const totalCorpus = currentValue + lumpsum;
        const totalSIP = currentSIP + topup;

        // With SIP
        const corpusFV = totalCorpus * Math.pow(1 + monthlyRate, months);
        const sipFV = totalSIP > 0 && monthlyRate > 0
            ? totalSIP * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate)
            : totalSIP * months;
        const withSIP = corpusFV + sipFV;

        // Without SIP (corpus only)
        const withoutSIP = totalCorpus * Math.pow(1 + monthlyRate, months);

        // Current path (no lumpsum, no topup)
        const currentPath = currentValue * Math.pow(1 + monthlyRate, months) +
            (currentSIP > 0 && monthlyRate > 0
                ? currentSIP * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate)
                : currentSIP * months);

        const extraGain = withSIP - currentPath;

        document.getElementById('whatIfResult').innerHTML = `
            <div class="detail-grid" style="margin-top:16px">
                <div class="detail-stat">
                    <div class="detail-stat-label">Future Value (with SIP)</div>
                    <div class="detail-stat-value positive">${formatCurrency(withSIP)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Without SIP (corpus only)</div>
                    <div class="detail-stat-value">${formatCurrency(withoutSIP)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Current Path (no changes)</div>
                    <div class="detail-stat-value">${formatCurrency(currentPath)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Extra from Lump Sum + Top-up</div>
                    <div class="detail-stat-value positive">${formatCurrency(extraGain)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">SIP Contribution</div>
                    <div class="detail-stat-value">${formatCurrency(sipFV)}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Corpus Growth</div>
                    <div class="detail-stat-value">${formatCurrency(corpusFV)}</div>
                </div>
            </div>
            ${extraGain > 0 ? `<div class="detail-tip" style="margin-top:12px"><strong>\uD83D\uDCA1</strong> Adding ${formatCurrency(lumpsum)} lump sum + ${formatCurrency(topup)}/mo extra SIP generates ${formatCurrency(extraGain)} more than your current path.</div>` : ''}
        `;
    },

    // Show full detail modal for an investment
    showDetail(id) {
        const data = localStorage.getItem('pm_investments');
        if (!data) return;
        const investments = JSON.parse(data);
        const inv = investments.find(i => i.id === id);
        if (!inv) return;

        if (typeof inv.sips === 'string') { try { inv.sips = JSON.parse(inv.sips); } catch(e) { inv.sips = []; } }
        if (!Array.isArray(inv.sips)) inv.sips = [];

        const currentValue = (inv.liveNAV && inv.units > 0)
            ? inv.units * inv.liveNAV
            : (inv.currentPrice && inv.shares > 0)
                ? inv.shares * inv.currentPrice
                : (inv.shares > 0 && inv.avgBuyPrice > 0)
                    ? inv.shares * parseFloat(inv.avgBuyPrice)
                    : (inv.initialCorpus ? this.calculateCurrentValue(inv) : inv.currentCorpus);
        const invested = this.calculateTotalInvested(inv);
        const gains = currentValue - invested;
        const gainsPercent = invested > 0 ? ((gains / invested) * 100).toFixed(2) : 0;
        const futureValue = this.calculateFutureValue(currentValue, inv.monthlySIP || 0, inv.expectedReturn, inv.investmentHorizon);
        const activeSIPs = inv.sips.filter(s => s.active);
        const monthlySIP = activeSIPs.reduce((sum, s) => sum + s.amount, 0);
        const cur = inv.currency || 'INR';
        const isForeign = cur !== 'INR';
        const curSymbol = (CurrencyAPI.CURRENCIES[cur] || {}).symbol || cur;
        const rates = CurrencyAPI.rates || {};
        const rateToINR = cur === 'INR' ? 1 : (rates[cur] ? (1 / rates[cur]) : 1);
        const valueINR = currentValue * rateToINR;

        const fmtVal = (amt) => isForeign ? curSymbol + amt.toFixed(2) : formatCurrency(amt);
        const inrNote = (amt) => isForeign ? '<div class="detail-inr-note">\u2248 ' + formatCurrency(amt * rateToINR) + '</div>' : '';

        document.getElementById('detailModalTitle').textContent = inv.name;
        document.getElementById('detailModalContent').innerHTML = `
            <div class="detail-badge" style="background:${this.typeColors[inv.type]}22;color:${this.typeColors[inv.type]}">
                ${this.typeEmojis[inv.type]} ${this.typeLabels[inv.type]}${isForeign ? ' · ' + cur : ''}
            </div>
            ${inv.navDate ? '<div class="inv-detail-nav">Live NAV: \u20B9' + inv.liveNAV.toFixed(4) + ' (' + inv.navDate + ')</div>' : ''}
            <div class="detail-grid">
                <div class="detail-stat">
                    <div class="detail-stat-label">Current Value</div>
                    <div class="detail-stat-value">${fmtVal(currentValue)}</div>
                    ${inrNote(currentValue)}
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Invested</div>
                    <div class="detail-stat-value">${fmtVal(invested)}</div>
                    ${inrNote(invested)}
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Gains</div>
                    <div class="detail-stat-value ${gains >= 0 ? 'positive' : 'negative'}">${gains >= 0 ? '+' : ''}${gainsPercent}% (${fmtVal(gains)})</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">${inv.shares > 0 ? 'Shares' : 'Units'}</div>
                    <div class="detail-stat-value">${inv.shares > 0 ? inv.shares : (inv.units ? inv.units.toFixed(3) : '\u2014')}</div>
                </div>
                ${monthlySIP > 0 ? `<div class="detail-stat"><div class="detail-stat-label">Monthly SIP</div><div class="detail-stat-value">${fmtVal(monthlySIP)}</div></div>` : ''}
                ${inv.avgBuyPrice > 0 ? `<div class="detail-stat"><div class="detail-stat-label">Avg Buy Price</div><div class="detail-stat-value">${curSymbol}${parseFloat(inv.avgBuyPrice).toFixed(2)}</div></div>` : ''}
                <div class="detail-stat">
                    <div class="detail-stat-label">Initial Investment</div>
                    <div class="detail-stat-value">${fmtVal(inv.initialCorpus || 0)}</div>
                </div>
            </div>
            <div class="inv-detail-actions">
                <button class="btn-sm btn-primary" onclick="Investments.showTransactions('${inv.id}')">Transactions</button>
                <button class="btn-sm btn-sip" onclick="Investments.showSIPs('${inv.id}')">Manage SIPs</button>
                <button class="btn-sm btn-edit" onclick="Investments.edit('${inv.id}')">Edit</button>
                <button class="btn-sm btn-danger" onclick="event.stopPropagation(); Investments.delete('${inv.id}')">Delete</button>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    // Transaction Management
    showTransactions(investmentId) {
        const data = localStorage.getItem('pm_investments');
        if (!data) return;
        const investments = JSON.parse(data);
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        if (typeof inv.transactions === 'string') {
            try { inv.transactions = JSON.parse(inv.transactions); } catch(e) { inv.transactions = []; }
        }
        if (!Array.isArray(inv.transactions)) inv.transactions = [];

        const transactions = inv.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        const cur = inv.currency || 'INR';
        const curSymbol = (CurrencyAPI.CURRENCIES[cur] || {}).symbol || cur;

        const totalBuy = transactions.filter(t => t.type === 'buy').reduce((s, t) => s + t.amount, 0);
        const totalSell = transactions.filter(t => t.type === 'sell').reduce((s, t) => s + t.amount, 0);

        document.getElementById('detailModalTitle').textContent = 'Transactions - ' + inv.name.substring(0, 25);
        document.getElementById('detailModalContent').innerHTML = `
            <div class="detail-grid" style="margin-bottom:16px">
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Bought</div>
                    <div class="detail-stat-value">${curSymbol}${totalBuy.toLocaleString()}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Total Sold</div>
                    <div class="detail-stat-value">${curSymbol}${totalSell.toLocaleString()}</div>
                </div>
                <div class="detail-stat">
                    <div class="detail-stat-label">Net Invested</div>
                    <div class="detail-stat-value">${curSymbol}${(totalBuy - totalSell).toLocaleString()}</div>
                </div>
            </div>

            <div class="txn-list">
                ${transactions.length === 0 ? '<p class="sip-empty">No transactions recorded yet.</p>' : ''}
                ${transactions.map((txn, idx) => `
                    <div class="txn-item txn-${txn.type}">
                        <div class="txn-item-left">
                            <span class="txn-badge txn-badge-${txn.type}">${txn.type === 'buy' ? 'BUY' : 'SELL'}</span>
                            <div>
                                <div class="txn-amount">${curSymbol}${txn.amount.toLocaleString()}${txn.units ? ' · ' + txn.units.toFixed(3) + ' units' : ''}${txn.shares ? ' · ' + txn.shares + ' shares' : ''}</div>
                                <div class="txn-date">${new Date(txn.date).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'})}${txn.price ? ' @ ' + curSymbol + txn.price.toFixed(2) : ''}</div>
                                ${txn.note ? '<div class="txn-note">' + txn.note + '</div>' : ''}
                            </div>
                        </div>
                        <button class="btn-sm btn-danger" onclick="event.stopPropagation(); Investments.deleteTxn('${investmentId}',${idx})">×</button>
                    </div>
                `).join('')}
            </div>

            <div class="sip-add-form" style="margin-top:16px">
                <h4>Add Transaction</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>Type</label>
                        <select id="txnType">
                            <option value="buy">Buy / Invest</option>
                            <option value="sell">Sell / Redeem</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" id="txnDate" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Amount (${curSymbol})</label>
                        <input type="number" id="txnAmount" placeholder="Total amount" min="0" step="any">
                    </div>
                    <div class="form-group">
                        <label>${inv.type === 'mutual_fund' ? 'Units' : 'Shares'} <small>(optional)</small></label>
                        <input type="number" id="txnUnits" placeholder="Qty" min="0" step="any">
                    </div>
                </div>
                <div class="form-group">
                    <label>Price per unit/share <small>(optional)</small></label>
                    <input type="number" id="txnPrice" placeholder="NAV or share price" min="0" step="any">
                </div>
                <div class="form-group">
                    <label>Note <small>(optional)</small></label>
                    <input type="text" id="txnNote" placeholder="e.g., Lump sum top-up">
                </div>
                <button class="btn-primary" onclick="Investments.addTransaction('${investmentId}')">Add Transaction</button>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    async addTransaction(investmentId) {
        const type = document.getElementById('txnType').value;
        const date = document.getElementById('txnDate').value;
        const amount = parseFloat(document.getElementById('txnAmount').value);
        const units = parseFloat(document.getElementById('txnUnits').value) || 0;
        const price = parseFloat(document.getElementById('txnPrice').value) || 0;
        const note = document.getElementById('txnNote').value.trim();

        if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
        if (!date) { showToast('Select a date'); return; }

        const data = localStorage.getItem('pm_investments');
        if (!data) return;
        const investments = JSON.parse(data);
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        if (typeof inv.transactions === 'string') {
            try { inv.transactions = JSON.parse(inv.transactions); } catch(e) { inv.transactions = []; }
        }
        if (!Array.isArray(inv.transactions)) inv.transactions = [];

        inv.transactions.push({
            id: Storage.generateId(),
            type: type,
            date: date,
            amount: amount,
            units: units,
            shares: (inv.type === 'stocks' || inv.type === 'us_stocks' || inv.type === 'intl_stocks') ? units : 0,
            price: price,
            note: note
        });

        // Update investment totals based on transactions
        if (type === 'buy') {
            inv.initialCorpus = (inv.initialCorpus || 0) + amount;
            if (units > 0) {
                if (inv.type === 'mutual_fund') {
                    inv.units = (inv.units || 0) + units;
                } else {
                    inv.shares = (inv.shares || 0) + units;
                }
            }
        } else if (type === 'sell') {
            if (units > 0) {
                if (inv.type === 'mutual_fund') {
                    inv.units = Math.max(0, (inv.units || 0) - units);
                } else {
                    inv.shares = Math.max(0, (inv.shares || 0) - units);
                }
            }
        }

        // Recalculate current corpus
        if (inv.liveNAV && inv.units > 0) {
            inv.currentCorpus = inv.units * inv.liveNAV;
        } else if (inv.shares > 0 && inv.avgBuyPrice > 0) {
            inv.currentCorpus = inv.shares * (inv.currentPrice || inv.avgBuyPrice);
        }

        localStorage.setItem('pm_investments', JSON.stringify(investments));
        if (typeof SheetsBackend !== 'undefined' && typeof GoogleAuth !== 'undefined' && GoogleAuth.isSignedIn() && SheetsBackend.spreadsheetId) {
            await SheetsBackend.syncInvestments(investments);
        }

        this.showTransactions(investmentId);
        this.render();
        showToast('Transaction added');
    },

    async deleteTxn(investmentId, txnIndex) {
        const data = localStorage.getItem('pm_investments');
        if (!data) return;
        const investments = JSON.parse(data);
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        if (typeof inv.transactions === 'string') {
            try { inv.transactions = JSON.parse(inv.transactions); } catch(e) { inv.transactions = []; }
        }
        if (!Array.isArray(inv.transactions)) return;

        inv.transactions.splice(txnIndex, 1);

        localStorage.setItem('pm_investments', JSON.stringify(investments));
        if (typeof SheetsBackend !== 'undefined' && typeof GoogleAuth !== 'undefined' && GoogleAuth.isSignedIn() && SheetsBackend.spreadsheetId) {
            await SheetsBackend.syncInvestments(investments);
        }

        this.showTransactions(investmentId);
        showToast('Transaction removed');
    },

    // SIP Management
    showSIPs(investmentId) {
        // Read directly from localStorage to avoid migration re-creating deleted SIPs
        const data = localStorage.getItem('pm_investments');
        if (!data) return;
        const investments = JSON.parse(data);
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        // Parse sips if needed
        if (typeof inv.sips === 'string') {
            try { inv.sips = JSON.parse(inv.sips); } catch (e) { inv.sips = []; }
        }
        if (!Array.isArray(inv.sips)) inv.sips = [];

        const sips = inv.sips || [];
        const cur = inv.currency || 'INR';
        const curSymbol = (CurrencyAPI.CURRENCIES[cur] || {}).symbol || cur;
        const fmtAmt = (amt) => cur === 'INR' ? formatCurrency(amt) : curSymbol + parseFloat(amt).toFixed(2);
        const isStock = inv.type === 'stocks' || inv.type === 'us_stocks' || inv.type === 'intl_stocks';
        const unitLabel = isStock ? 'shares' : 'units';

        const totalMonthlyActive = sips.filter(s => s.active).reduce((sum, s) => sum + s.amount, 0);
        const totalInvestedViaSIP = this._calculateTotalSIPInvested(sips);

        document.getElementById('detailModalTitle').textContent = 'SIPs - ' + inv.name.substring(0, 30);
        document.getElementById('detailModalContent').innerHTML = `
            <div class="sip-summary">
                <div class="detail-grid">
                    <div class="detail-stat">
                        <div class="detail-stat-label">Active SIPs</div>
                        <div class="detail-stat-value">${sips.filter(s => s.active).length}</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-label">Monthly Total</div>
                        <div class="detail-stat-value">${fmtAmt(totalMonthlyActive)}</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-label">Total Invested via SIP</div>
                        <div class="detail-stat-value">${fmtAmt(totalInvestedViaSIP)}</div>
                    </div>
                </div>
            </div>
            <div class="sip-list">
                ${sips.length === 0 ? '<p class="sip-empty">No recurring investments registered. Add one below.</p>' : ''}
                ${sips.map((sip, idx) => `
                    <div class="sip-item ${sip.active ? '' : 'sip-inactive'}">
                        <div class="sip-item-info">
                            <div class="sip-item-amount">${fmtAmt(sip.amount)}<span>/month on ${new Date(sip.startDate).getDate()}th</span></div>
                            <div class="sip-item-dates">
                                Started: ${new Date(sip.startDate).toLocaleDateString('en-IN', {month: 'short', year: 'numeric'})}
                                ${sip.endDate ? ' \u2014 Ended: ' + new Date(sip.endDate).toLocaleDateString('en-IN', {month: 'short', year: 'numeric'}) : ''}
                                ${inv.casImportDate && new Date(sip.startDate) <= new Date(inv.casImportDate) ? ' <span class="sip-cas-note">\u00B7 Units included in CAS</span>' : ''}
                            </div>
                            ${sip.installments && sip.installments.length > 0 ? `
                                <div class="sip-installments-summary">${sip.installments.length} installment(s) \u00B7 ${sip.installments.reduce((s,i) => s + i.units, 0).toFixed(3)} ${unitLabel} added</div>
                                <div class="sip-installments-list">
                                    ${sip.installments.slice(-3).map(inst => `
                                        <div class="sip-inst-row">
                                            <span>${inst.date}</span>
                                            <span>Price: ${curSymbol}${inst.nav.toFixed(4)}</span>
                                            <span>+${inst.units.toFixed(3)} ${unitLabel}</span>
                                        </div>
                                    `).join('')}
                                    ${sip.installments.length > 3 ? '<div class="sip-inst-more">... and ' + (sip.installments.length - 3) + ' more</div>' : ''}
                                </div>
                            ` : ''}
                        </div>
                        <div class="sip-item-actions">
                            <span class="sip-badge ${sip.active ? 'sip-active-badge' : 'sip-stopped-badge'}">${sip.active ? 'Active' : 'Stopped'}</span>
                            ${sip.active ? `<button class="btn-sm btn-danger" onclick="event.stopPropagation(); Investments.stopSIP('${investmentId}',${idx})">Stop</button>` : ''}
                            <button class="btn-sm btn-danger" onclick="event.stopPropagation(); Investments.deleteSIP('${investmentId}',${idx})">×</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="sip-add-form">
                <h4>Add Recurring Investment</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>Amount (${curSymbol}/month)</label>
                        <input type="number" id="newSIPAmount" placeholder="${cur === 'INR' ? '5000' : '100'}" min="1" step="any">
                    </div>
                    <div class="form-group">
                        <label>Start Date</label>
                        <input type="date" id="newSIPStartDate">
                    </div>
                </div>
                <button class="btn-primary" onclick="Investments.addSIP('${investmentId}')">Add</button>
            </div>
            <div class="sip-units-section">
                <h4>Update ${isStock ? 'Shares' : 'Units'}</h4>
                <p class="sip-units-note">Update your total ${unitLabel} from your latest statement.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>Current ${isStock ? 'Shares' : 'Units'}</label>
                        <input type="number" id="updateUnits" value="${isStock ? (inv.shares || '') : (inv.units || '')}" placeholder="Total ${unitLabel} held" min="0" step="0.001">
                    </div>
                    <div class="form-group" style="display:flex;align-items:flex-end">
                        <button class="btn-primary" onclick="Investments.updateUnits('${investmentId}')">Update</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('detailModal').classList.add('active');
    },

    async addSIP(investmentId) {
        const amount = parseFloat(document.getElementById('newSIPAmount').value);
        const startDate = document.getElementById('newSIPStartDate').value;

        if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
        if (!startDate) { showToast('Select a start date'); return; }

        const data = localStorage.getItem('pm_investments');
        if (!data) return;
        const investments = JSON.parse(data);
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        if (typeof inv.sips === 'string') {
            try { inv.sips = JSON.parse(inv.sips); } catch (e) { inv.sips = []; }
        }
        if (!Array.isArray(inv.sips)) inv.sips = [];

        inv.sips.push({
            id: Storage.generateId(),
            amount: amount,
            startDate: startDate,
            endDate: '',
            active: true,
            installments: []
        });

        inv.monthlySIP = inv.sips.filter(s => s.active).reduce((sum, s) => sum + s.amount, 0);

        // Save and wait for sheets sync
        localStorage.setItem('pm_investments', JSON.stringify(investments));
        if (typeof SheetsBackend !== 'undefined' && typeof GoogleAuth !== 'undefined' && GoogleAuth.isSignedIn() && SheetsBackend.spreadsheetId) {
            await SheetsBackend.syncInvestments(investments);
        }

        this.showSIPs(investmentId);
        this.render();
        showToast('SIP added');
    },

    async stopSIP(investmentId, sipIndex) {
        const data = localStorage.getItem('pm_investments');
        if (!data) return;
        const investments = JSON.parse(data);
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        if (typeof inv.sips === 'string') {
            try { inv.sips = JSON.parse(inv.sips); } catch (e) { inv.sips = []; }
        }
        if (!Array.isArray(inv.sips) || !inv.sips[sipIndex]) return;

        inv.sips[sipIndex].active = false;
        inv.sips[sipIndex].endDate = new Date().toISOString().split('T')[0];
        inv.monthlySIP = inv.sips.filter(s => s.active).reduce((sum, s) => sum + s.amount, 0);

        localStorage.setItem('pm_investments', JSON.stringify(investments));
        if (typeof SheetsBackend !== 'undefined' && typeof GoogleAuth !== 'undefined' && GoogleAuth.isSignedIn() && SheetsBackend.spreadsheetId) {
            await SheetsBackend.syncInvestments(investments);
        }

        this.showSIPs(investmentId);
        this.render();
        showToast('SIP stopped');
    },

    async deleteSIP(investmentId, sipIndex) {
        console.log('[DELETE SIP] Called with:', investmentId, 'index:', sipIndex);
        const data = localStorage.getItem('pm_investments');
        if (!data) { console.log('[DELETE SIP] No data in localStorage'); return; }
        const investments = JSON.parse(data);
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) { console.log('[DELETE SIP] Investment not found:', investmentId); return; }

        if (typeof inv.sips === 'string') {
            try { inv.sips = JSON.parse(inv.sips); } catch (e) { inv.sips = []; }
        }
        if (!Array.isArray(inv.sips)) inv.sips = [];

        console.log('[DELETE SIP] SIPs before delete:', JSON.stringify(inv.sips.length), 'deleting index:', sipIndex);
        inv.sips.splice(sipIndex, 1);
        console.log('[DELETE SIP] SIPs after delete:', JSON.stringify(inv.sips.length));
        inv.monthlySIP = inv.sips.filter(s => s.active).reduce((sum, s) => sum + s.amount, 0);

        localStorage.setItem('pm_investments', JSON.stringify(investments));
        console.log('[DELETE SIP] Saved to localStorage');

        if (typeof SheetsBackend !== 'undefined' && typeof GoogleAuth !== 'undefined' && GoogleAuth.isSignedIn() && SheetsBackend.spreadsheetId) {
            console.log('[DELETE SIP] Syncing to sheets...');
            await SheetsBackend.syncInvestments(investments);
            console.log('[DELETE SIP] Sync complete');
        }

        this.showSIPs(investmentId);
        document.getElementById('detailModal').classList.add('active');
        this.render();
        console.log('[DELETE SIP] UI refreshed');
        showToast('SIP deleted');
    },

    updateUnits(investmentId) {
        const value = parseFloat(document.getElementById('updateUnits').value);
        if (!value || value <= 0) { showToast('Enter a valid number'); return; }

        const investments = Storage.getInvestments();
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        const isStock = inv.type === 'stocks' || inv.type === 'us_stocks' || inv.type === 'intl_stocks';

        if (isStock) {
            inv.shares = value;
            if (inv.currentPrice) {
                inv.currentCorpus = value * inv.currentPrice;
            }
        } else {
            inv.units = value;
            if (inv.liveNAV) {
                inv.currentCorpus = value * inv.liveNAV;
            }
        }

        Storage.saveInvestments(investments);
        this.render();
        Summary.render();
        showToast(isStock ? 'Shares updated' : 'Units updated');
        document.getElementById('detailModal').classList.remove('active');
    },

    _calculateTotalSIPInvested(sips) {
        const now = new Date();
        let total = 0;
        for (const sip of sips) {
            const start = new Date(sip.startDate);
            const end = sip.endDate ? new Date(sip.endDate) : now;
            const months = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
            total += sip.amount * months;
        }
        return total;
    },

    // Add or update investment
    save(data) {
        const investments = Storage.getInvestments();
        if (data.id) {
            const idx = investments.findIndex(i => i.id === data.id);
            if (idx !== -1) investments[idx] = data;
        } else {
            data.id = Storage.generateId();
            investments.push(data);
        }
        Storage.saveInvestments(investments);
        this.render();
        Summary.render();
    },

    // Edit investment
    edit(id) {
        // Close the detail modal first
        document.getElementById('detailModal').classList.remove('active');

        const investments = Storage.getInvestments();
        const inv = investments.find(i => i.id === id);
        if (!inv) return;

        document.getElementById('investmentModalTitle').textContent = 'Edit Investment';
        document.getElementById('investmentId').value = inv.id;
        document.getElementById('investmentSchemeCode').value = inv.schemeCode || '';
        document.getElementById('investmentName').value = inv.name;
        document.getElementById('investmentType').value = inv.type;
        document.getElementById('investmentCurrency').value = inv.currency || 'INR';
        document.getElementById('investmentTicker').value = inv.ticker || '';
        document.getElementById('investmentShares').value = inv.shares || '';
        document.getElementById('investmentAvgPrice').value = inv.avgBuyPrice || '';
        document.getElementById('initialCorpus').value = inv.initialCorpus || inv.currentCorpus || '';
        document.getElementById('investmentStartDate').value = inv.investmentStartDate || '';
        document.getElementById('monthlySIP').value = inv.monthlySIP || '';
        document.getElementById('sipStartDate').value = inv.sipStartDate || '';
        document.getElementById('expectedReturn').value = inv.expectedReturn;
        document.getElementById('investmentHorizon').value = inv.investmentHorizon;
        document.getElementById('investmentUnits').value = inv.units || '';
        document.getElementById('fundSearch').value = inv.schemeCode ? inv.name : '';

        // Show/hide fields based on type
        const isMF = inv.type === 'mutual_fund';
        const isStock = inv.type === 'stocks' || inv.type === 'us_stocks' || inv.type === 'intl_stocks';
        document.getElementById('investmentFieldsWrapper').style.display = 'block';
        document.getElementById('fundSearchGroup').style.display = isMF ? 'block' : 'none';
        document.getElementById('unitsGroup').style.display = isMF ? 'block' : 'none';
        document.getElementById('currencyGroup').style.display = isStock ? 'flex' : 'none';
        document.getElementById('sharesGroup').style.display = isStock ? 'block' : 'none';
        document.getElementById('mfFieldsGroup').style.display = isStock ? 'none' : 'block';

        // Set dropdown to "stocks" for all stock subtypes
        document.getElementById('investmentType').value = isStock ? 'stocks' : inv.type;

        document.getElementById('investmentModal').classList.add('active');
    },

    // Delete investment
    delete(id) {
        this._showConfirmModal('Are you sure you want to delete this investment?', () => {
            const investments = Storage.getInvestments().filter(i => i.id !== id);
            Storage.saveInvestments(investments);
            this.render();
            Summary.render();
            showToast('Investment deleted');
        });
    },

    // Show what-if analysis
    showWhatIf(id) {
        const investments = Storage.getInvestments();
        const inv = investments.find(i => i.id === id);
        if (!inv) return;

        const currentFV = this.calculateFutureValue(
            inv.currentCorpus, inv.monthlySIP || 0, inv.expectedReturn, inv.investmentHorizon
        );

        const content = document.getElementById('whatIfContent');
        const sipVal = inv.monthlySIP || 0;
        const maxSIP = sipVal * 3 || 50000;

        content.innerHTML = `
            <div class="whatif-current">
                <h4>${this.escapeHtml(inv.name)}</h4>
                <p style="font-size:0.8rem;color:var(--text-secondary)">
                    Current: ${formatCurrency(inv.currentCorpus)} | SIP: ${formatCurrency(sipVal)}/mo | Return: ${inv.expectedReturn}% | Horizon: ${inv.investmentHorizon} yrs
                </p>
            </div>
            <div class="whatif-slider-group">
                <label>Monthly SIP <span id="whatifSIPValue">${formatCurrency(sipVal)}</span></label>
                <input type="range" id="whatifSIP" min="0" max="${maxSIP}" step="500" value="${sipVal}">
            </div>
            <div class="whatif-slider-group">
                <label>Investment Horizon <span id="whatifYearsValue">${inv.investmentHorizon} years</span></label>
                <input type="range" id="whatifYears" min="1" max="40" step="1" value="${inv.investmentHorizon}">
            </div>
            <div class="whatif-slider-group">
                <label>Expected Return <span id="whatifReturnValue">${inv.expectedReturn}%</span></label>
                <input type="range" id="whatifReturn" min="1" max="30" step="0.5" value="${inv.expectedReturn}">
            </div>
            <div class="whatif-results">
                <div class="whatif-result-card original">
                    <div class="whatif-result-label">Current Plan</div>
                    <div class="whatif-result-value">${formatCurrency(currentFV)}</div>
                </div>
                <div class="whatif-result-card projected">
                    <div class="whatif-result-label">Projected</div>
                    <div class="whatif-result-value" id="whatifProjected">${formatCurrency(currentFV)}</div>
                </div>
            </div>
            <div class="whatif-diff" id="whatifDiff">No change</div>
        `;

        const updateWhatIf = () => {
            const newSIP = parseFloat(document.getElementById('whatifSIP').value);
            const newYears = parseFloat(document.getElementById('whatifYears').value);
            const newReturn = parseFloat(document.getElementById('whatifReturn').value);

            document.getElementById('whatifSIPValue').textContent = formatCurrency(newSIP);
            document.getElementById('whatifYearsValue').textContent = `${newYears} years`;
            document.getElementById('whatifReturnValue').textContent = `${newReturn}%`;

            const newFV = this.calculateFutureValue(inv.currentCorpus, newSIP, newReturn, newYears);
            document.getElementById('whatifProjected').textContent = formatCurrency(newFV);

            const diff = newFV - currentFV;
            const diffEl = document.getElementById('whatifDiff');
            if (diff > 0) {
                diffEl.textContent = `+${formatCurrency(diff)} more than current plan`;
                diffEl.className = 'whatif-diff';
            } else if (diff < 0) {
                diffEl.textContent = `${formatCurrency(diff)} less than current plan`;
                diffEl.className = 'whatif-diff negative';
            } else {
                diffEl.textContent = 'No change';
                diffEl.className = 'whatif-diff';
            }
        };

        document.getElementById('whatIfModal').classList.add('active');

        setTimeout(() => {
            document.getElementById('whatifSIP').addEventListener('input', updateWhatIf);
            document.getElementById('whatifYears').addEventListener('input', updateWhatIf);
            document.getElementById('whatifReturn').addEventListener('input', updateWhatIf);
        }, 100);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    _showConfirmModal(message, onConfirm) {
        // Create modal overlay
        let overlay = document.getElementById('confirmModal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'confirmModal';
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div class="modal confirm-modal">
                <div class="confirm-message">${message}</div>
                <div class="confirm-actions">
                    <button class="btn-secondary" id="confirmCancel">Cancel</button>
                    <button class="btn-danger-solid" id="confirmOk">Delete</button>
                </div>
            </div>
        `;
        overlay.classList.add('active');

        document.getElementById('confirmCancel').addEventListener('click', () => {
            overlay.classList.remove('active');
        });
        document.getElementById('confirmOk').addEventListener('click', () => {
            overlay.classList.remove('active');
            onConfirm();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    }
};

// Format currency
function formatCurrency(amount) {
    if (amount === 0 || isNaN(amount)) return '\u20B90';
    if (amount >= 10000000) {
        return '\u20B9' + (amount / 10000000).toFixed(2) + ' Cr';
    } else if (amount >= 100000) {
        return '\u20B9' + (amount / 100000).toFixed(2) + ' L';
    }
    return '\u20B9' + Math.round(amount).toLocaleString('en-IN');
}
