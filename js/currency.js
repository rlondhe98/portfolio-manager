// Currency & Exchange Rate module
const CurrencyAPI = {
    BASE_URL: 'https://api.frankfurter.app',
    rates: null,
    lastFetched: null,

    CURRENCIES: {
        INR: { symbol: '\u20B9', name: 'Indian Rupee' },
        USD: { symbol: '$', name: 'US Dollar' },
        EUR: { symbol: '\u20AC', name: 'Euro' },
        GBP: { symbol: '\u00A3', name: 'British Pound' },
        JPY: { symbol: '\u00A5', name: 'Japanese Yen' },
        AUD: { symbol: 'A$', name: 'Australian Dollar' },
        CAD: { symbol: 'C$', name: 'Canadian Dollar' },
        SGD: { symbol: 'S$', name: 'Singapore Dollar' },
        AED: { symbol: 'AED', name: 'UAE Dirham' },
        CHF: { symbol: 'CHF', name: 'Swiss Franc' }
    },

    // Fetch latest exchange rates (base INR)
    async fetchRates() {
        // Cache for 1 hour
        if (this.rates && this.lastFetched && (Date.now() - this.lastFetched < 3600000)) {
            return this.rates;
        }

        try {
            // Use open.er-api.com which has CORS support
            const response = await fetch('https://open.er-api.com/v6/latest/INR');
            if (!response.ok) throw new Error('Rate fetch failed');
            const data = await response.json();
            this.rates = data.rates;
            this.rates.INR = 1;
            this.lastFetched = Date.now();

            // Cache in localStorage
            localStorage.setItem('pm_exchange_rates', JSON.stringify({ rates: this.rates, fetched: this.lastFetched }));
            return this.rates;
        } catch (e) {
            console.error('Exchange rate fetch error:', e);
            // Try cached rates
            const cached = localStorage.getItem('pm_exchange_rates');
            if (cached) {
                const parsed = JSON.parse(cached);
                this.rates = parsed.rates;
                return this.rates;
            }
            return null;
        }
    },

    // Convert amount from one currency to INR
    async toINR(amount, fromCurrency) {
        if (fromCurrency === 'INR') return amount;
        const rates = await this.fetchRates();
        if (!rates || !rates[fromCurrency]) return amount;
        // rates are from INR base, so 1 INR = X foreign
        // To convert foreign to INR: amount / rate
        return amount / rates[fromCurrency];
    },

    // Convert amount from INR to another currency
    async fromINR(amount, toCurrency) {
        if (toCurrency === 'INR') return amount;
        const rates = await this.fetchRates();
        if (!rates || !rates[toCurrency]) return amount;
        return amount * rates[toCurrency];
    },

    // Get exchange rate: 1 unit of currency = X INR
    async getRate(currency) {
        if (currency === 'INR') return 1;
        const rates = await this.fetchRates();
        if (!rates || !rates[currency]) return 1;
        return 1 / rates[currency];
    },

    // Format currency with symbol
    format(amount, currency) {
        const cur = this.CURRENCIES[currency] || { symbol: currency + ' ' };
        if (currency === 'INR') {
            return formatCurrency(amount);
        }
        if (Math.abs(amount) >= 1000000) {
            return cur.symbol + (amount / 1000000).toFixed(2) + 'M';
        } else if (Math.abs(amount) >= 1000) {
            return cur.symbol + (amount / 1000).toFixed(2) + 'K';
        }
        return cur.symbol + amount.toFixed(2);
    }
};
