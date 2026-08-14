// Client-side screening model for fiscal regime design: sliding-scale
// royalty, R-factor profit splits, cost recovery with carryforward, CIT/RRT.
// Known simplifications pending D1 of docs/scope/Economics-ROADMAP.md:
// deductions use opex/2, RRT uplift is a flat 20% of capex, and the IRR
// solver is a bounded guess-adjuster. Screening use only.

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

const calculateNPV = (cashFlows, discountRate) => {
    return cashFlows.reduce((npv, cf) => {
        return npv + cf.contractorNCF / Math.pow(1 + discountRate / 100, cf.year);
    }, 0);
};

const calculateIRR = (cashFlows) => {
    let irr = 0;
    let npv = 0;
    const maxIterations = 100;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIterations; i++) {
        npv = calculateNPV(cashFlows, irr * 100);
        if (Math.abs(npv) < tolerance) {
            return irr * 100;
        }
        // A simple guess adjustment - not a robust solver
        if (npv > 0) {
            irr += 0.01;
        } else {
            irr -= 0.005;
        }
    }
    // Fallback for simple solver
    if (calculateNPV(cashFlows, 0) < 0) return 0;
    return irr * 100 > 50 ? 50 : irr * 100; // Cap at 50%
};


const calculateCashFlowForRegime = (regime, project, capexMultiplier = 1, priceMultiplier = 1) => {
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
        
        const taxableIncome = contractorProfitShare - (opex / 2);
        const cit = taxableIncome > 0 ? taxableIncome * (regime.tax.cit / 100) : 0;
        const rrtBase = taxableIncome - (totalCapex * 0.2);
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