export const calculateEconomics = (inputs) => {
  const { 
    modelSettings, 
    productionData, 
    costData, 
    fiscalTerms, 
    priceAssumptions, 
    assumptions, 
    streams 
  } = inputs;

  const startYear = modelSettings.startYear;
  const endYear = modelSettings.endYear;
  const discountRate = modelSettings.discountRate;
  const inflationRate = modelSettings.inflationEnabled ? (modelSettings.inflationRate || 0) : 0;

  let cumulativeCashflow = 0;
  const annualResults = [];
  let npv = 0;
  let hasPayback = false;
  let paybackYear = null;
  let previousCumCashflow = 0;

  // Fiscal Rules
  const royaltyRate = (fiscalTerms?.royalty_rate || 0) / 100;
  const taxRate = (fiscalTerms?.tax_rate || 0) / 100;
  const costRecoveryLimit = (fiscalTerms?.cost_oil_limit || 100) / 100; // PSC
  const profitSplitContractor = (fiscalTerms?.profit_split || 100) / 100; // PSC

  // Simple Depreciation State (Straight Line 5 years)
  // For demo simplicity, we might just expense or do simple pool
  let costPool = 0; // For PSC or Depreciation

  for (let year = startYear; year <= endYear; year++) {
    const yearIndex = year - startYear;
    const prod = productionData.find(p => p.year === year) || { oil_rate: 0, gas_rate: 0, condensate_rate: 0 };
    const capexItem = costData.capexProfile?.find(c => c.year === year) || {};
    const opexItem = costData.opexProfile?.find(o => o.year === year) || {};

    // 1. Volumes (Annual)
    const oilVol = prod.oil_rate || 0; // Already annualized in demo data
    const gasVol = prod.gas_rate || 0;
    const condVol = prod.condensate_rate || 0;

    // 2. Prices (Escalated)
    const escalationFactor = Math.pow(1 + priceAssumptions.escalation, yearIndex);
    const oilPrice = priceAssumptions.oilPrice * escalationFactor;
    const gasPrice = priceAssumptions.gasPrice * escalationFactor;

    // 3. Revenue
    const grossRevenue = (oilVol * oilPrice) + (gasVol * gasPrice) + (condVol * oilPrice * 0.9); // Disc condensate slightly

    // 4. Costs (Escalated by Inflation)
    const costEscalation = Math.pow(1 + inflationRate, yearIndex);
    
    // CAPEX
    const drilling = (capexItem.drilling_capex || 0) * costEscalation;
    const facilities = (capexItem.facilities_capex || 0) * costEscalation;
    const abandonment = (capexItem.abandonment_capex || 0) * costEscalation;
    const otherCapex = (capexItem.other_capex || 0) * costEscalation;
    const totalCapex = drilling + facilities + abandonment + otherCapex;

    // OPEX
    const fixedOpex = (opexItem.fixed_opex || 0) * costEscalation;
    const variableOil = (opexItem.variable_oil || 0) * costEscalation;
    const variableGas = (opexItem.variable_gas || 0) * costEscalation;
    const totalOpex = fixedOpex + (variableOil * oilVol) + (variableGas * gasVol);

    // 5. Fiscal Calculation
    let royalties = 0;
    let tax = 0;
    let govtTake = 0;
    let netCashflow = 0;
    let contractorRevenue = 0;
    let recoverableCost = 0;
    let profitShare = 0;
    let taxableIncome = 0;

    if (fiscalTerms?.template_type === 'psc') {
        // PSC Logic
        royalties = grossRevenue * royaltyRate;
        const netRevenue = grossRevenue - royalties;
        
        // Cost Recovery
        const maxCostRecovery = netRevenue * costRecoveryLimit;
        const currentCosts = totalCapex + totalOpex;
        // Simplified: Recover current costs + pool
        recoverableCost = Math.min(currentCosts, maxCostRecovery); 
        // Note: Real PSC would track unrecovered cost pool. Simplified here.
        
        const profitOil = netRevenue - recoverableCost;
        const contractorProfit = profitOil * profitSplitContractor;
        const govtProfit = profitOil * (1 - profitSplitContractor);
        
        // Contractor Tax (usually on profit share)
        taxableIncome = contractorProfit; // Simplified
        tax = taxableIncome * taxRate;

        contractorRevenue = recoverableCost + contractorProfit;
        netCashflow = contractorRevenue - currentCosts - tax;
        govtTake = royalties + govtProfit + tax;
        profitShare = contractorProfit;

    } else {
        // Royalty/Tax Logic
        royalties = grossRevenue * royaltyRate;
        const netRevenue = grossRevenue - royalties;
        
        // Taxable Income (Revenue - OPEX - Depreciation)
        // Simplified: Immediate expensing of CAPEX for robust demo without complex depreciation state
        // Or simple straight line could be implemented if needed.
        // Let's use Immediate for clarity in cashflow unless specified
        taxableIncome = Math.max(0, netRevenue - totalOpex - totalCapex);
        
        tax = taxableIncome * taxRate;
        netCashflow = netRevenue - totalOpex - totalCapex - tax;
        govtTake = royalties + tax;
    }

    // 6. Metrics
    cumulativeCashflow += netCashflow;
    const discountFactor = 1 / Math.pow(1 + discountRate, yearIndex + 0.5); // Mid-year discounting
    const discountedCashflow = netCashflow * discountFactor;
    npv += discountedCashflow;

    // Payback Calc
    if (!hasPayback && cumulativeCashflow >= 0) {
        hasPayback = true;
        // Linear interpolation for fractional year
        const fraction = Math.abs(previousCumCashflow) / (netCashflow + Number.EPSILON);
        paybackYear = year - 1 + fraction;
    }
    previousCumCashflow = cumulativeCashflow;

    annualResults.push({
        year,
        gross_revenue: grossRevenue,
        royalties,
        opex: totalOpex,
        capex: totalCapex,
        taxable_income: taxableIncome,
        tax,
        net_cashflow: netCashflow,
        cumulative_cashflow: cumulativeCashflow,
        govt_take: govtTake,
        recoverable_cost: recoverableCost,
        profit_share: profitShare
    });
  }

  // IRR Calculation (Newton-Raphson approximation or simple iterative)
  // Simplified IRR for demo:
  let irr = 0;
  // ... (IRR logic requires iterative solver, usually skipped in simple frontend demos or use a library)
  // We'll use a very simple approximation or mock if complex
  try {
      // Basic IRR finder
      let min = -1.0;
      let max = 1.0;
      for(let i=0; i<20; i++) {
          const guess = (min + max) / 2;
          let npvGuess = 0;
          for(let t=0; t<annualResults.length; t++) {
              npvGuess += annualResults[t].net_cashflow / Math.pow(1 + guess, t + 0.5);
          }
          if(npvGuess > 0) min = guess;
          else max = guess;
      }
      irr = (min + max) / 2 * 100;
  } catch (e) {
      irr = 0;
  }

  // DPI
  const totalPvCapex = annualResults.reduce((acc, r, i) => acc + (r.capex / Math.pow(1 + discountRate, i + 0.5)), 0);
  const dpi = totalPvCapex > 0 ? (npv / totalPvCapex) : 0;

  // Unit Costs
  const totalBoe = productionData.reduce((acc, r) => acc + r.oil_rate + (r.gas_rate / 6), 0); // 6 mcf = 1 boe
  const unitTechCost = totalBoe > 0 ? (annualResults.reduce((acc, r) => acc + r.capex + r.opex, 0) / totalBoe) : 0;

  return {
    annualResults,
    metrics: {
        npv,
        irr,
        payback_year: hasPayback ? paybackYear : null,
        dpi,
        unit_technical_cost: unitTechCost,
        breakeven_price: unitTechCost * 1.1 // Mock breakeven slightly higher than UTC
    }
  };
};