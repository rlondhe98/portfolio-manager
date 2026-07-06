// CAS (Consolidated Account Statement) PDF Parser
const CASImporter = {
    showImportModal() {
        const modal = document.getElementById('casImportModal');
        modal.classList.add('active');
        document.getElementById('casFile').value = '';
        document.getElementById('casPassword').value = '';
        document.getElementById('casParseResults').style.display = 'none';
        document.getElementById('casInstructions').style.display = 'block';
        document.getElementById('casFileSection').style.display = 'block';
        document.getElementById('casStatus').style.display = 'none';
    },

    async parsePDF() {
        const fileInput = document.getElementById('casFile');
        const password = document.getElementById('casPassword').value;
        const file = fileInput.files[0];

        if (!file) { showToast('Please select a PDF file'); return; }
        if (!password) { showToast('Please enter the PDF password'); return; }

        const statusEl = document.getElementById('casStatus');
        statusEl.textContent = 'Reading PDF...';
        statusEl.style.display = 'block';

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, password: password }).promise;
            statusEl.textContent = 'Parsing ' + pdf.numPages + ' pages...';

            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }

            console.log('[CAS] Text length:', fullText.length);
            console.log('[CAS] Sample:', fullText.substring(0, 2000));

            const funds = this._extractFunds(fullText);

            if (funds.length === 0) {
                statusEl.textContent = 'No funds found. Check browser console for debug info.';
                return;
            }

            statusEl.style.display = 'none';
            this._showResults(funds);
        } catch (err) {
            console.error('PDF parse error:', err);
            if (err.name === 'PasswordException') {
                statusEl.textContent = 'Incorrect password. Please try again.';
            } else {
                statusEl.textContent = 'Failed to parse PDF: ' + (err.message || 'Unknown error');
            }
        }
    },

    _extractFunds(text) {
        const funds = [];

        // CAS text order per row: FolioNo MarketValue SchemeName UnitBalance NAVDate NAV Registrar ISIN CostValue
        // ISINs come AFTER the fund data. Look at text BEFORE each ISIN.

        const isinPattern = /(INF\w{8,10}|INE\w{8,10})/g;
        const isinPositions = [];
        let m;
        while ((m = isinPattern.exec(text)) !== null) {
            isinPositions.push({ isin: m[1], index: m.index, end: m.index + m[1].length });
        }

        console.log('[CAS] ISINs found:', isinPositions.length);
        if (isinPositions.length === 0) return funds;

        for (let i = 0; i < isinPositions.length; i++) {
            // Chunk BEFORE this ISIN (from end of previous ISIN or start of text)
            const chunkStart = i === 0 ? Math.max(0, isinPositions[i].index - 800) : isinPositions[i - 1].end;
            const chunkEnd = isinPositions[i].index;
            const beforeChunk = text.substring(chunkStart, chunkEnd);

            // Chunk AFTER this ISIN (for cost value)
            const afterChunk = text.substring(isinPositions[i].end, isinPositions[i].end + 80);

            // Get all numbers from the before chunk
            const numbers = [];
            const numRe = /(\d{1,3}(?:,\d{3})*\.\d{2,4})/g;
            let nm;
            while ((nm = numRe.exec(beforeChunk)) !== null) {
                numbers.push(parseFloat(nm[1].replace(/,/g, '')));
            }

            // Get cost from after chunk
            const afterNumRe = /(\d{1,3}(?:,\d{3})*\.\d{2,4})/g;
            let costMatch = afterNumRe.exec(afterChunk);
            const costValue = costMatch ? parseFloat(costMatch[1].replace(/,/g, '')) : 0;

            console.log('[CAS] ISIN', isinPositions[i].isin, 'numbers before:', numbers, 'cost after:', costValue);

            // Find units * NAV = market value
            let best = null;

            for (let a = 0; a < numbers.length; a++) {
                for (let b = a + 1; b < numbers.length; b++) {
                    // Try both orders: numbers[a] as units & numbers[b] as NAV, and vice versa
                    const pairs = [
                        { units: numbers[a], nav: numbers[b] },
                        { units: numbers[b], nav: numbers[a] }
                    ];

                    for (const pair of pairs) {
                        if (pair.nav < 1 || pair.nav > 10000) continue;
                        if (pair.units <= 0) continue;

                        const product = pair.units * pair.nav;

                        // Check if product matches any other number in the list
                        for (let c = 0; c < numbers.length; c++) {
                            if (c === a || c === b) continue;
                            if (numbers[c] <= 0) continue;

                            const diff = Math.abs(product - numbers[c]) / numbers[c];
                            if (diff < 0.03 && (!best || diff < best.diff)) {
                                best = { units: pair.units, nav: pair.nav, value: numbers[c], diff: diff };
                            }
                        }
                    }
                }
            }

            if (!best) continue;

            // Extract scheme name: remove numbers, dates, registrar names from chunk
            let name = beforeChunk
                .replace(/\d{1,3}(?:,\d{3})*\.\d{2,4}/g, '|')
                .replace(/\d{2}-\w{3}-\d{4}/g, '|')
                .replace(/\d{5,}\/?\d*/g, '|')
                .replace(/\b(CAMS|KFINTECH|KARVY|Page \d+.*?)\b/gi, '|')
                .split('|')
                .map(s => s.trim())
                .filter(s => s.length > 10)
                .pop() || '';

            name = name.replace(/^[A-Z]\d+\s*[-]\s*/, '');
            name = name.replace(/^\d+[A-Z]+\s*[-]\s*/i, '');
            name = name.replace(/^[A-Z0-9]+\s*[-–]\s*/, '');
            name = name.replace(/\s*\(Non-?Demat\)\s*/gi, '');
            name = name.replace(/\s*\(Formerly Known as[^)]*\)\s*/gi, '');
            name = name.replace(/\s+/g, ' ').trim();

            if (name.length < 5) name = 'Fund (' + isinPositions[i].isin + ')';

            // Merge duplicates
            const key = name.replace(/\s/g, '').toLowerCase();
            const existing = funds.find(f => f.name.replace(/\s/g, '').toLowerCase() === key);

            if (existing) {
                existing.units += best.units;
                existing.value += best.value;
                existing.cost += costValue;
            } else {
                funds.push({
                    name: name,
                    isin: isinPositions[i].isin,
                    units: best.units,
                    nav: best.nav,
                    value: best.value,
                    cost: costValue,
                    selected: true
                });
            }
        }

        console.log('[CAS] Extracted funds:', funds.length);
        return funds;
    },

    _showResults(funds) {
        document.getElementById('casInstructions').style.display = 'none';
        document.getElementById('casFileSection').style.display = 'none';

        const container = document.getElementById('casParseResults');
        container.style.display = 'block';
        const totalValue = funds.reduce((sum, f) => sum + f.value, 0);

        container.innerHTML =
            '<p class="cas-results-count">Found <strong>' + funds.length + ' mutual fund(s)</strong> worth <strong>' + formatCurrency(totalValue) + '</strong></p>' +
            '<div class="cas-fund-list">' +
            funds.map((fund, idx) =>
                '<label class="cas-fund-item">' +
                '<input type="checkbox" data-idx="' + idx + '" ' + (fund.selected ? 'checked' : '') + '>' +
                '<div class="cas-fund-info">' +
                '<div class="cas-fund-name">' + fund.name + '</div>' +
                '<div class="cas-fund-details">' +
                '<span>Units: ' + fund.units.toFixed(3) + '</span>' +
                '<span>NAV: \u20B9' + fund.nav.toFixed(4) + '</span>' +
                '<span>Value: \u20B9' + fund.value.toLocaleString('en-IN', {maximumFractionDigits: 2}) + '</span>' +
                (fund.cost ? '<span>Cost: \u20B9' + fund.cost.toLocaleString('en-IN', {maximumFractionDigits: 2}) + '</span>' : '') +
                '</div></div></label>'
            ).join('') +
            '</div>' +
            '<div class="cas-actions">' +
            '<button class="btn-secondary" onclick="CASImporter._goBack()">Back</button>' +
            '<button class="btn-primary" onclick="CASImporter._importSelected()">Import Selected</button>' +
            '</div>';

        this._parsedFunds = funds;
    },

    _goBack() {
        document.getElementById('casInstructions').style.display = 'block';
        document.getElementById('casFileSection').style.display = 'block';
        document.getElementById('casParseResults').style.display = 'none';
    },

    async _importSelected() {
        const checkboxes = document.querySelectorAll('#casParseResults input[type="checkbox"]:checked');
        const selectedFunds = Array.from(checkboxes).map(cb => this._parsedFunds[parseInt(cb.dataset.idx)]);

        if (selectedFunds.length === 0) { showToast('No funds selected'); return; }

        const statusEl = document.getElementById('casStatus');
        statusEl.style.display = 'block';

        const investments = Storage.getInvestments();
        let imported = 0;

        for (let fi = 0; fi < selectedFunds.length; fi++) {
            const fund = selectedFunds[fi];
            statusEl.textContent = 'Looking up fund ' + (fi + 1) + '/' + selectedFunds.length + ': ' + fund.name.substring(0, 40) + '...';

            let schemeCode = '';
            let resolvedName = fund.name;

            try {
                // Try multiple search strategies to find the scheme code
                const searchTerms = this._getSearchTerms(fund.name);

                for (const term of searchTerms) {
                    if (schemeCode) break;
                    const results = await MutualFundAPI.search(term);
                    if (results.length > 0) {
                        const nameLower = fund.name.toLowerCase();
                        const isDirect = nameLower.includes('direct');
                        const isGrowth = nameLower.includes('growth');

                        const match = results.find(r => {
                            const rL = r.schemeName.toLowerCase();
                            return (isDirect === rL.includes('direct')) &&
                                   (isGrowth === rL.includes('growth'));
                        }) || results[0];

                        schemeCode = match.schemeCode.toString();
                        // Use the official scheme name from MFAPI for cleaner display
                        resolvedName = match.schemeName;
                    }
                }
            } catch (e) { console.warn('Scheme search failed:', fund.name); }

            const exists = investments.find(inv =>
                (inv.isin && inv.isin === fund.isin) ||
                inv.name.replace(/\s/g, '').toLowerCase() === resolvedName.replace(/\s/g, '').toLowerCase()
            );

            if (!exists) {
                investments.push({
                    id: Storage.generateId(),
                    name: resolvedName,
                    type: 'mutual_fund',
                    schemeCode: schemeCode,
                    isin: fund.isin || '',
                    units: fund.units,
                    initialCorpus: fund.cost || fund.value,
                    currentCorpus: fund.value,
                    liveNAV: fund.nav,
                    casImportDate: new Date().toISOString().split('T')[0],
                    investmentStartDate: new Date().toISOString().split('T')[0],
                    monthlySIP: 0,
                    sipStartDate: '',
                    expectedReturn: 12,
                    investmentHorizon: 10
                });
                imported++;
            }
        }

        Storage.saveInvestments(investments);
        statusEl.style.display = 'none';
        document.getElementById('casImportModal').classList.remove('active');
        if (typeof App !== 'undefined') App.renderAll();
        showToast('Imported ' + imported + ' mutual fund(s)');
    },

    // Generate multiple search terms from the fund name
    _getSearchTerms(name) {
        const terms = [];
        // Clean name
        let clean = name
            .replace(/^\d+[A-Z]*\s*[-–]\s*/i, '')
            .replace(/\s*\(Non-?Demat\)\s*/gi, '')
            .replace(/\s*\(Formerly Known as[^)]*\)\s*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Full clean name (limited to 50 chars)
        terms.push(clean.substring(0, 50));

        // Try just the core fund name (first few meaningful words)
        const words = clean.split(/\s+/);
        if (words.length > 3) {
            // Take first 4-5 words that look like fund name
            terms.push(words.slice(0, 5).join(' '));
        }

        // Try without plan type suffix
        const withoutPlan = clean.replace(/[-–]\s*(Regular|Direct)\s*(Plan)?[-–]?\s*(Growth|Dividend|IDCW)?.*$/i, '').trim();
        if (withoutPlan.length > 5 && withoutPlan !== clean) {
            terms.push(withoutPlan);
        }

        return terms;
    }
};
