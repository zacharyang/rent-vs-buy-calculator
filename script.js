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
  const buyClosing = inputs.buyClosingCost;
  const principal = inputs.homePrice - downPayment;
  const monthlyPayment = monthlyMortgagePayment(
    principal,
    inputs.mortgageRate,
    inputs.loanYears
  );

  const monthlyTax = inputs.propertyTaxAnnual / 12;
  const monthlyIns = inputs.homeInsuranceAnnual / 12;
  const monthlyMaint = inputs.maintenanceAnnual / 12;
  const monthlyInvestRate = inputs.investReturn / 12;

  let balance = principal;
  let homeValue = inputs.homePrice;
  let rent = inputs.monthlyRent;

  let buyOutflows = downPayment + buyClosing;
  let rentOutflows = 0;
  let investments = downPayment + buyClosing;

  const buyPath = [];
  const rentPath = [];
  const monthsPath = [];
  const interestPaidPath = [];
  const rentPaidPath = [];
  const appreciationPath = [];
  let cumulativeInterestPaid = 0;
  let cumulativeRentPaid = 0;

  for (let month = 1; month <= months; month += 1) {
    let interest = 0;
    let mortgage = 0;
    if (balance > 0) {
      interest = balance * (inputs.mortgageRate / 12);
      const principalPaid = Math.min(monthlyPayment - interest, balance);
      balance -= principalPaid;
      mortgage = interest + principalPaid;
    }
    cumulativeInterestPaid += interest;

    const buyMonthly = mortgage + monthlyTax + monthlyIns + monthlyMaint;
    buyOutflows += buyMonthly;

    const rentMonthly =
      rent + inputs.rentersInsMonthly + inputs.rentMaintenanceMonthly;
    rentOutflows += rentMonthly;
    cumulativeRentPaid += rent;

    const savings = Math.max(0, buyMonthly - rentMonthly);
    investments = investments * (1 + monthlyInvestRate) + savings;

    if (month % 12 === 0) {
      homeValue *= 1 + inputs.appreciation;
      rent *= 1 + inputs.rentIncrease;
    }

    const buyAssetsNow = homeValue - balance;
    const buyNetWorthNow = buyAssetsNow - buyOutflows;
    const rentNetWorthNow = investments - rentOutflows;

    monthsPath.push(month);
    buyPath.push(buyNetWorthNow);
    rentPath.push(rentNetWorthNow);
    interestPaidPath.push(cumulativeInterestPaid);
    rentPaidPath.push(cumulativeRentPaid);
    appreciationPath.push(homeValue - inputs.homePrice);
  }

  const buyAssets = homeValue - balance;
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
    series: {
      months: monthsPath,
      buyNetWorth: buyPath,
      rentNetWorth: rentPath,
      cumulativeInterestPaid: interestPaidPath,
      cumulativeRentPaid: rentPaidPath,
      cumulativeAppreciation: appreciationPath,
    },
  };
}

function readInputs(formData) {
  return {
    homePrice: Number(formData.get("homePrice")),
    downPct: parsePercent(formData.get("downPct")),
    mortgageRate: parsePercent(formData.get("mortgageRate")),
    loanYears: Number(formData.get("loanYears")),
    buyClosingCost: Number(formData.get("buyClosingCost")),
    propertyTaxAnnual: Number(formData.get("propertyTaxAnnual")),
    homeInsuranceAnnual: Number(formData.get("homeInsuranceAnnual")),
    maintenanceAnnual: Number(formData.get("maintenanceAnnual")),
    appreciation: parsePercent(formData.get("appreciation")),
    monthlyRent: Number(formData.get("monthlyRent")),
    rentIncrease: parsePercent(formData.get("rentIncrease")),
    rentersInsMonthly: Number(formData.get("rentersInsMonthly")),
    rentMaintenanceMonthly: Number(formData.get("rentMaintenanceMonthly")),
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

let trendChart = null;
let latestResult = null;

function buildDatasets(result, view) {
  if (view === "components") {
    return [
      {
        label: "Cumulative Interest Paid",
        data: result.series.cumulativeInterestPaid,
        borderColor: "#ef4444",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        tension: 0.25,
      },
      {
        label: "Cumulative Rent Paid",
        data: result.series.cumulativeRentPaid,
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.1)",
        tension: 0.25,
      },
      {
        label: "Home Value Appreciation",
        data: result.series.cumulativeAppreciation,
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        tension: 0.25,
      },
    ];
  }

  return [
    {
      label: "Buy Net Worth",
      data: result.series.buyNetWorth,
      borderColor: "#1d4ed8",
      backgroundColor: "rgba(29, 78, 216, 0.1)",
      tension: 0.25,
    },
    {
      label: "Rent Net Worth",
      data: result.series.rentNetWorth,
      borderColor: "#7c3aed",
      backgroundColor: "rgba(124, 58, 237, 0.1)",
      tension: 0.25,
    },
  ];
}

function renderTrendChart(view = "netWorth") {
  if (!latestResult) return;
  const canvas = document.getElementById("trendChart");
  const ctx = canvas.getContext("2d");

  if (trendChart) {
    trendChart.destroy();
  }

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: latestResult.series.months.map((m) => (m / 12).toFixed(1)),
      datasets: buildDatasets(latestResult, view),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${asCurrency(context.raw)}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Years",
          },
        },
        y: {
          ticks: {
            callback(value) {
              return asCurrency(value);
            },
          },
        },
      },
    },
  });
}

const form = document.getElementById("model-form");
const results = document.getElementById("results");
const toggleButtons = document.querySelectorAll(".toggle-btn");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const inputs = readInputs(formData);
  const result = runModel(inputs);
  latestResult = result;
  renderResults(result);
  renderTrendChart("netWorth");
  toggleButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === "netWorth");
  });
  results.classList.remove("hidden");
});

toggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    renderTrendChart(view);
    toggleButtons.forEach((otherButton) => {
      otherButton.classList.toggle("active", otherButton === button);
    });
  });
});
