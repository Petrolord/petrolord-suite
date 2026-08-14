// Client-side screening model for fiscal regime design: sliding-scale
// royalty, R-factor profit splits, cost recovery with carryforward, CIT/RRT.
// D1 (docs/scope/Economics-ROADMAP.md): IRR is a robust bisection solver
// (no artificial cap), the tax base is the contractor profit share (costs
// are compensated via cost recovery; the old opex/2 halving is gone), and
// the RRT capital uplift is a regime parameter (tax.rrtUpliftPct, default
// 20). Screening use only; full Nigerian fiscal math lives in the EPE
// engine (supabase/functions/_shared/epe-engine.ts).

const PROJECT_LIFE = 25; // years

const generateProductionProfile = (initial, decline) => {
    const profile = [];
    let currentRate = initial;
    for (let year = 1; year <= PROJECT_LIFE; year++) {
        const annualProduction = currentRate * 365;
        profile.push({ year, production: annualProduction });
        currentRate *= (1 - decline / 100);
    }
    return profile;
};

const getPriceForYear = (year, prices) => {
    let applicablePrice = prices[0];
    for (const pricePoint of prices) {
        if (year >= pricePoint.year) {
            applicablePrice = pricePoint;
        } else {
            break;
        }
    }
    return applicablePrice;
};

const getSlidingScaleRoyalty = (oilPrice, royaltyInfo) => {
    if (royaltyInfo.type === 'flat') {
        return royaltyInfo.rate / 100;
    }
    let rate = royaltyInfo.tiers[0].rate;
    for (const tier of royaltyInfo.tiers) {
        if (oilPrice >= tier.threshold) {
            rate = tier.rate;
        }
    }
    return rate / 100;
};

const getTieredSplit = (rFactor, splitInfo) => {
    if (splitInfo.type === 'flat') {
        return splitInfo.split / 100;
    }
    let split = splitInfo.tiers[0].split;
    for (const tier of splitInfo.tiers) {
        if (rFactor >= tier.threshold) {
            split = tier.split;
        }
    }
    return split / 100;
};

export const calculateNPV = (cashFlows, discountRate) => {
    return cashFlows.reduce((npv, cf) => {
        return npv + cf.contractorNCF / Math.pow(1 + discountRate / 100, cf.year);
    }, 0);
};

// Robust IRR by bisection on the NPV(r) sign change. Returns 0 when the
// cash flow never changes sign (no IRR exists) or when NPV(0) < 0 and no
// positive root exists in the searched range. No artificial rate cap.
export const calculateIRR = (cashFlows) => {
    const hasNeg = cashFlows.some(cf => cf.contractorNCF < 0);
    const hasPos = cashFlows.some(cf => cf.contractorNCF > 0);
    if (!hasNeg || !hasPos) return 0;

    const npvAt = (ratePct) => calculateNPV(cashFlows, ratePct);
    if (npvAt(0) <= 0) return 0;

    // Bracket the root: NPV(0) > 0, find an upper rate where NPV < 0.
    let lo = 0;
    let hi = 100; // 100%
    for (let i = 0; i < 10 && npvAt(hi) > 0; i++) hi *= 2;
    if (npvAt(hi) > 0) return hi; // beyond search range; report the bound

    for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (npvAt(mid) > 0) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
};


export const calculateCashFlowForRegime = (regime, project, capexMultiplier = 1, priceMultiplier = 1) => {
    const oilProd = generateProductionProfile(project.production.oil.initial, project.production.oil.decline);
    const gasProd = generateProductionProfile(project.production.gas.initial, project.production.gas.decline);
    const nglProd = generateProductionProfile(project.production.ngl.initial, project.production.ngl.decline);

    const totalCapex = (project.costs.capex.drilling + project.costs.capex.facilities + project.costs.capex.subsea) * capexMultiplier;
    let cumulativeCostPool = totalCapex;
    let cumulativeRevenue = 0;
    let cumulativeCosts = 0;
    let cumulativeNCF = 0;
    const annualCashFlows = [];

    for (let year = 1; year <= PROJECT_LIFE; year++) {
        const basePrice = getPriceForYear(year, project.prices);
        const price = { ...basePrice, oil: basePrice.oil * priceMultiplier };
        
        const oilVol = oilProd.find(p => p.year === year)?.production || 0;
        const gasVol = gasProd.find(p => p.year === year)?.production || 0;
        const nglVol = nglProd.find(p => p.year === year)?.production || 0;
        
        const oilRev = (oilVol * price.oil) / 1e6;
        const gasRev = (gasVol * price.gas) / 1e6;
        const nglRev = (nglVol * price.ngl) / 1e6;
        
        const grossRevenue = oilRev + gasRev + nglRev;
        cumulativeRevenue += grossRevenue;
        
        const totalBoe = (oilVol + nglVol) + (gasVol * 1000 / 6000);
        const variableOpex = (totalBoe * project.costs.opex.variable) / 1e6;
        const opex = project.costs.opex.fixed + variableOpex;
        
        const capex = (year === 1) ? totalCapex : 0;
        cumulativeCosts += capex + opex;

        const royaltyRate = getSlidingScaleRoyalty(price.oil, regime.royalty);
        const royalty = grossRevenue * royaltyRate;
        
        const revenueAfterRoyalty = grossRevenue - royalty;
        
        const costRecoveryAllowed = revenueAfterRoyalty * (regime.costRecoveryLimit / 100);
        const costRecovered = Math.min(cumulativeCostPool, costRecoveryAllowed);
        cumulativeCostPool -= costRecovered;
        
        const profitOil = revenueAfterRoyalty - costRecovered;
        
        const rFactor = cumulativeCosts > 0 ? cumulativeRevenue / cumulativeCosts : 0;
        const contractorProfitSplit = getTieredSplit(rFactor, regime.profitSplit);
        
        const contractorProfitShare = profitOil * contractorProfitSplit;
        const governmentProfitShare = profitOil * (1 - contractorProfitSplit);
        
        // Tax base is the contractor's profit share. Costs are already
        // compensated through cost recovery, so no further opex deduction
        // here (the old `- opex / 2` was an invented halving, removed D1).
        const taxableIncome = contractorProfitShare;
        const cit = taxableIncome > 0 ? taxableIncome * (regime.tax.cit / 100) : 0;
        // RRT base allows an annual capital uplift (screening approximation
        // of an uplifted cost pool); rate is a regime parameter, default 20%.
        const rrtUpliftPct = regime.tax.rrtUpliftPct ?? 20;
        const rrtBase = taxableIncome - (totalCapex * rrtUpliftPct / 100);
        const rrt = rrtBase > 0 ? rrtBase * (regime.tax.rrt / 100) : 0;
        const minTax = grossRevenue * (regime.tax.minTax / 100);
        const tax = Math.max(cit + rrt, minTax);

        const contractorNCF = contractorProfitShare - tax - opex - capex;
        const governmentTake = royalty + governmentProfitShare + tax;
        
        cumulativeNCF += contractorNCF;

        annualCashFlows.push({
            year,
            contractorNCF,
            governmentTake,
            cumulativeNCF,
            rFactor,
        });
    }
    return annualCashFlows;
};

const runSensitivityAnalysis = (regimes, projectInputs) => {
    const priceSens = { labels: [], data: regimes.map(r => ({ regimeId: r.id, values: [] })) };
    for (let price = 40; price <= 120; price += 10) {
        priceSens.labels.push(price);
        regimes.forEach(regime => {
            const cashflows = calculateCashFlowForRegime(regime, projectInputs, 1, price / projectInputs.prices[0].oil);
            const totalGovTake = cashflows.reduce((sum, cf) => sum + cf.governmentTake, 0);
            const totalContractorTake = cashflows.reduce((sum, cf) => sum + cf.contractorNCF, 0);
            const totalProfit = totalGovTake + totalContractorTake;
            const effectiveTaxRate = totalProfit > 0 ? (totalGovTake / totalProfit) * 100 : 0;
            priceSens.data.find(d => d.regimeId === regime.id).values.push(effectiveTaxRate);
        });
    }

    const capexSens = { labels: [], data: regimes.map(r => ({ regimeId: r.id, values: [] })) };
    for (let multiplier = 0.8; multiplier <= 1.5; multiplier += 0.1) {
        capexSens.labels.push(multiplier.toFixed(1));
        regimes.forEach(regime => {
            const cashflows = calculateCashFlowForRegime(regime, projectInputs, multiplier, 1);
            const npv = calculateNPV(cashflows, projectInputs.discountRate);
            capexSens.data.find(d => d.regimeId === regime.id).values.push(npv);
        });
    }

    return { price: priceSens, capex: capexSens };
};

export const runFiscalComparison = async (inputs) => {
    const { projectInputs, regimes } = inputs;
    const summary = [];
    const annualCashFlows = [];

    regimes.forEach(regime => {
        const cashflows = calculateCashFlowForRegime(regime, projectInputs);
        annualCashFlows.push({ regimeId: regime.id, data: cashflows });

        const contractorNPV = calculateNPV(cashflows, projectInputs.discountRate);
        const irr = calculateIRR(cashflows);
        const payback = cashflows.find(cf => cf.cumulativeNCF > 0);
        const rFactorPayout = cashflows.find(cf => cf.rFactor > 1.0);

        const totalGovTake = cashflows.reduce((sum, cf) => sum + cf.governmentTake, 0);
        const totalCapex = (projectInputs.costs.capex.drilling + projectInputs.costs.capex.facilities + projectInputs.costs.capex.subsea);
        const totalContractorTake = cashflows.reduce((sum, cf) => sum + cf.contractorNCF, 0) + totalCapex;
        const totalProfit = totalGovTake + totalContractorTake;
        const effectiveTaxRate = totalProfit > 0 ? (totalGovTake / totalProfit) * 100 : 0;
        
        summary.push({
            id: regime.id,
            name: regime.name,
            npv: contractorNPV,
            irr: irr,
            paybackPeriod: payback ? payback.year : null,
            rFactorPayoutYear: rFactorPayout ? rFactorPayout.year : null,
            govTake: totalGovTake,
            effectiveTaxRate: effectiveTaxRate
        });
    });

    const sensitivityData = runSensitivityAnalysis(regimes, projectInputs);

    summary.sort((a,b) => b.npv - a.npv);

    return {
        summary,
        annualCashFlows,
        sensitivityData,
    };
};