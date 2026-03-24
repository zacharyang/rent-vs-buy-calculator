function parsePercent(value) {
  return Number(value) / 100;
}

function asCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function monthlyMortgagePayment(principal, annualRate, years) {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * (r * (1 + r) ** n)) / ((1 + r) ** n - 1);
}

function runModel(inputs) {
  const months = inputs.horizonYears * 12;
  const downPayment = inputs.homePrice * inputs.downPct;
  const buyClosing = inputs.homePrice * inputs.buyClosingPct;
  const principal = inputs.homePrice - downPayment;
  const monthlyPayment = monthlyMortgagePayment(
    principal,
    inputs.mortgageRate,
    inputs.loanYears
  );

  const monthlyTax = (inputs.homePrice * inputs.propertyTaxPct) / 12;
  const monthlyIns = (inputs.homePrice * inputs.homeInsPct) / 12;
  const monthlyMaint = (inputs.homePrice * inputs.maintPct) / 12;
  const monthlyInvestRate = inputs.investReturn / 12;

  let balance = principal;
  let homeValue = inputs.homePrice;
  let rent = inputs.monthlyRent;

  let buyOutflows = downPayment + buyClosing;
  let rentOutflows = 0;
  let investments = downPayment + buyClosing;

  const buyPath = [];
  const rentPath = [];

  for (let month = 1; month <= months; month += 1) {
    let mortgage = 0;
    if (balance > 0) {
      const interest = balance * (inputs.mortgageRate / 12);
      const principalPaid = Math.min(monthlyPayment - interest, balance);
      balance -= principalPaid;
      mortgage = interest + principalPaid;
    }

    const buyMonthly =
      mortgage + monthlyTax + monthlyIns + monthlyMaint + inputs.hoaMonthly;
    buyOutflows += buyMonthly;

    const rentMonthly = rent + inputs.rentersInsMonthly;
    rentOutflows += rentMonthly;

    const savings = Math.max(0, buyMonthly - rentMonthly);
    investments = investments * (1 + monthlyInvestRate) + savings;

    if (month % 12 === 0) {
      homeValue *= 1 + inputs.appreciation;
      rent *= 1 + inputs.rentIncrease;
    }

    const sellNowCosts = homeValue * inputs.sellClosingPct;
    const buyAssetsNow = homeValue - sellNowCosts - balance;
    const buyNetWorthNow = buyAssetsNow - buyOutflows;
    const rentNetWorthNow = investments - rentOutflows;

    buyPath.push(buyNetWorthNow);
    rentPath.push(rentNetWorthNow);
  }

  const finalSellCosts = homeValue * inputs.sellClosingPct;
  const buyAssets = homeValue - finalSellCosts - balance;
  const buyerNetWorth = buyAssets - buyOutflows;
  const renterNetWorth = investments - rentOutflows;
  const delta = buyerNetWorth - renterNetWorth;

  const breakEvenIdx = buyPath.findIndex((buyValue, i) => buyValue >= rentPath[i]);

  return {
    buyerNetWorth,
    renterNetWorth,
    delta,
    buyOutflows,
    rentOutflows,
    buyAssets,
    rentAssets: investments,
    breakEvenMonth: breakEvenIdx >= 0 ? breakEvenIdx + 1 : null,
  };
}

function readInputs(formData) {
  return {
    homePrice: Number(formData.get("homePrice")),
    downPct: parsePercent(formData.get("downPct")),
    mortgageRate: parsePercent(formData.get("mortgageRate")),
    loanYears: Number(formData.get("loanYears")),
    buyClosingPct: parsePercent(formData.get("buyClosingPct")),
    sellClosingPct: parsePercent(formData.get("sellClosingPct")),
    propertyTaxPct: parsePercent(formData.get("propertyTaxPct")),
    homeInsPct: parsePercent(formData.get("homeInsPct")),
    maintPct: parsePercent(formData.get("maintPct")),
    hoaMonthly: Number(formData.get("hoaMonthly")),
    appreciation: parsePercent(formData.get("appreciation")),
    monthlyRent: Number(formData.get("monthlyRent")),
    rentIncrease: parsePercent(formData.get("rentIncrease")),
    rentersInsMonthly: Number(formData.get("rentersInsMonthly")),
    investReturn: parsePercent(formData.get("investReturn")),
    horizonYears: Number(formData.get("horizonYears")),
  };
}

function renderResults(result) {
  const outcome = document.getElementById("outcome");
  const buyerNetWorth = document.getElementById("buyerNetWorth");
  const renterNetWorth = document.getElementById("renterNetWorth");
  const breakEven = document.getElementById("breakEven");
  const buyOutflows = document.getElementById("buyOutflows");
  const rentOutflows = document.getElementById("rentOutflows");
  const buyAssets = document.getElementById("buyAssets");
  const rentAssets = document.getElementById("rentAssets");
  const delta = document.getElementById("delta");

  const better = result.delta >= 0 ? "Buying" : "Renting";
  const diff = asCurrency(Math.abs(result.delta));

  outcome.textContent = `${better} is ahead by ${diff}.`;
  buyerNetWorth.textContent = asCurrency(result.buyerNetWorth);
  renterNetWorth.textContent = asCurrency(result.renterNetWorth);
  buyOutflows.textContent = asCurrency(result.buyOutflows);
  rentOutflows.textContent = asCurrency(result.rentOutflows);
  buyAssets.textContent = asCurrency(result.buyAssets);
  rentAssets.textContent = asCurrency(result.rentAssets);
  delta.textContent = asCurrency(result.delta);

  if (result.breakEvenMonth) {
    const years = Math.floor(result.breakEvenMonth / 12);
    const months = result.breakEvenMonth % 12;
    breakEven.textContent = `${years} years, ${months} months`;
  } else {
    breakEven.textContent = "No break-even in selected horizon";
  }
}

const form = document.getElementById("model-form");
const results = document.getElementById("results");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const inputs = readInputs(formData);
  const result = runModel(inputs);
  renderResults(result);
  results.classList.remove("hidden");
});
