// Mutual Fund NAV module - fetches live NAV from MFAPI
const MutualFundAPI = {
    BASE_URL: 'https://api.mfapi.in/mf',
    searchTimeout: null,
    cache: {},

    // Search funds by name
    async search(query) {
        if (query.length < 3) return [];

        // Check cache
        const cacheKey = query.toLowerCase();
        if (this.cache[cacheKey]) return this.cache[cacheKey];

        try {
            const response = await fetch(`${this.BASE_URL}/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) return [];
            const results = await response.json();
            // Cache results
            this.cache[cacheKey] = results.slice(0, 20); // Limit to 20
            return this.cache[cacheKey];
        } catch (e) {
            console.error('Fund search error:', e);
            return [];
        }
    },

    // Get latest NAV for a scheme
    async getLatestNAV(schemeCode) {
        if (!schemeCode) return null;

        try {
            const response = await fetch(`${this.BASE_URL}/${schemeCode}/latest`);
            if (!response.ok) return null;
            const data = await response.json();
            if (data && data.data && data.data.length > 0) {
                return {
                    nav: parseFloat(data.data[0].nav),
                    date: data.data[0].date,
                    name: data.meta?.scheme_name || ''
                };
            }
            return null;
        } catch (e) {
            // CORS blocked - silently fail, will use cached values
            return null;
        }
    },

    // Get NAV for a specific date (T+1 for SIP). Returns NAV on or after the given date.
    async getNAVForDate(schemeCode, date) {
        if (!schemeCode) return null;

        try {
            // MFAPI returns all historical data sorted by date descending
            const response = await fetch(`${this.BASE_URL}/${schemeCode}`);
            if (!response.ok) return null;
            const data = await response.json();
            if (!data || !data.data || data.data.length === 0) return null;

            // Date format in MFAPI is DD-MM-YYYY
            const targetDate = this._formatDateForAPI(date);
            const targetTs = this._dateToTimestamp(date);

            // Find NAV on or closest after the target date
            // Data is sorted newest first, so we iterate from end
            let closestNAV = null;
            let closestDiff = Infinity;

            for (const entry of data.data) {
                const entryTs = this._parseMFAPIDate(entry.date);
                // We want the NAV on target date or the first available date AFTER target
                const diff = entryTs - targetTs;
                if (diff >= 0 && diff < closestDiff) {
                    closestDiff = diff;
                    closestNAV = { nav: parseFloat(entry.nav), date: entry.date };
                }
            }

            // If no NAV found on/after date, take the closest before
            if (!closestNAV) {
                for (const entry of data.data) {
                    const entryTs = this._parseMFAPIDate(entry.date);
                    const diff = targetTs - entryTs;
                    if (diff >= 0 && diff < closestDiff) {
                        closestDiff = diff;
                        closestNAV = { nav: parseFloat(entry.nav), date: entry.date };
                    }
                }
            }

            return closestNAV;
        } catch (e) {
            console.error('Historical NAV fetch error:', e);
            return null;
        }
    },

    _formatDateForAPI(dateStr) {
        const d = new Date(dateStr);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    },

    _dateToTimestamp(dateStr) {
        return new Date(dateStr).getTime();
    },

    _parseMFAPIDate(dateStr) {
        // Format: DD-MM-YYYY
        const parts = dateStr.split('-');
        return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    },

    // Initialize fund search UI behavior
    initSearchUI() {
        const typeSelect = document.getElementById('investmentType');
        const fundSearchGroup = document.getElementById('fundSearchGroup');
        const unitsGroup = document.getElementById('unitsGroup');
        const fundSearch = document.getElementById('fundSearch');
        const results = document.getElementById('fundSearchResults');

        // Show/hide fund search based on type
        typeSelect.addEventListener('change', () => {
            const val = typeSelect.value;
            const wrapper = document.getElementById('investmentFieldsWrapper');
            const isMF = val === 'mutual_fund';
            const isStock = val === 'stocks';

            // Show all fields wrapper once type is selected
            wrapper.style.display = val ? 'block' : 'none';

            fundSearchGroup.style.display = isMF ? 'block' : 'none';
            unitsGroup.style.display = isMF ? 'block' : 'none';
            document.getElementById('currencyGroup').style.display = isStock ? 'flex' : 'none';
            document.getElementById('sharesGroup').style.display = isStock ? 'block' : 'none';
            document.getElementById('mfFieldsGroup').style.display = isStock ? 'none' : 'block';

            // Default currency
            if (!isStock) {
                document.getElementById('investmentCurrency').value = 'INR';
            }
        });

        // Debounced search
        fundSearch.addEventListener('input', () => {
            clearTimeout(this.searchTimeout);
            const query = fundSearch.value.trim();

            if (query.length < 3) {
                results.style.display = 'none';
                results.innerHTML = '';
                return;
            }

            results.innerHTML = '<div class="fund-search-loading">Searching...</div>';
            results.style.display = 'block';

            this.searchTimeout = setTimeout(async () => {
                const funds = await this.search(query);
                if (funds.length === 0) {
                    results.innerHTML = '<div class="fund-search-empty">No funds found</div>';
                    return;
                }

                results.innerHTML = funds.map(fund => `
                    <div class="fund-search-item" data-code="${fund.schemeCode}" data-name="${this._escapeAttr(fund.schemeName)}">
                        <div class="fund-search-item-name">${fund.schemeName}</div>
                        <div class="fund-search-item-code">Code: ${fund.schemeCode}</div>
                    </div>
                `).join('');

                // Add click handlers
                results.querySelectorAll('.fund-search-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const code = item.dataset.code;
                        const name = item.dataset.name;
                        document.getElementById('investmentSchemeCode').value = code;
                        document.getElementById('investmentName').value = name;
                        fundSearch.value = name;
                        results.style.display = 'none';
                        // Fetch and show current NAV
                        this._showNAVPreview(code);
                    });
                });
            }, 400);
        });

        // Close results on outside click
        document.addEventListener('click', (e) => {
            if (!fundSearchGroup.contains(e.target)) {
                results.style.display = 'none';
            }
        });

        // Ticker symbol auto-lookup for stocks
        const tickerInput = document.getElementById('investmentTicker');
        const nameInput = document.getElementById('investmentName');
        let tickerTimeout = null;

        tickerInput.addEventListener('input', () => {
            clearTimeout(tickerTimeout);
            const ticker = tickerInput.value.trim().toUpperCase();
            if (ticker.length < 1) return;

            tickerTimeout = setTimeout(async () => {
                try {
                    const resp = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=5&newsCount=0`);
                    if (!resp.ok) return;
                    const data = await resp.json();
                    if (data.quotes && data.quotes.length > 0) {
                        const match = data.quotes.find(q => q.symbol === ticker) || data.quotes[0];
                        if (match && match.shortname) {
                            nameInput.value = match.shortname;
                        } else if (match && match.longname) {
                            nameInput.value = match.longname;
                        }
                    }
                } catch (e) {
                    // Silently fail - user can type name manually
                }
            }, 500);
        });

        // Reverse: typing name searches for ticker
        nameInput.addEventListener('input', () => {
            // Only auto-search if stocks type is selected and ticker is empty
            if (document.getElementById('investmentType').value !== 'stocks') return;
            if (tickerInput.value.trim()) return;

            clearTimeout(tickerTimeout);
            const name = nameInput.value.trim();
            if (name.length < 3) return;

            tickerTimeout = setTimeout(async () => {
                try {
                    const resp = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(name)}&quotesCount=3&newsCount=0`);
                    if (!resp.ok) return;
                    const data = await resp.json();
                    if (data.quotes && data.quotes.length > 0) {
                        tickerInput.value = data.quotes[0].symbol;
                    }
                } catch (e) {
                    // Silently fail
                }
            }, 600);
        });
    },

    // Show NAV preview after selecting a fund
    async _showNAVPreview(schemeCode) {
        const navData = await this.getLatestNAV(schemeCode);
        const results = document.getElementById('fundSearchResults');

        if (navData) {
            results.innerHTML = `
                <div class="fund-nav-preview">
                    <span class="nav-label">Latest NAV:</span>
                    <span class="nav-value">₹${navData.nav.toFixed(4)}</span>
                    <span class="nav-date">(${navData.date})</span>
                </div>
            `;
            results.style.display = 'block';
        }
    },

    _escapeAttr(str) {
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
};
