const STORAGE_KEY = "daybook-budget-v1";
const CURRENCIES = {
  EUR: { symbol: "€", locale: "en-IE" },
  USD: { symbol: "$", locale: "en-US" },
  GBP: { symbol: "£", locale: "en-GB" },
  ALL: { symbol: "L", locale: "en-US" },
};
const CATEGORY_COLORS = {
  "Food & dining": "#cd8c69",
  Transport: "#879b83",
  Shopping: "#91a7ad",
  "Bills & utilities": "#d2b878",
  Health: "#a4aa7d",
  Entertainment: "#af94ab",
  Home: "#8298a7",
  Other: "#aaa99c",
  Saving: "#718268",
  Investment: "#6b8990",
};
const CATEGORY_ICONS = {
  "Food & dining": "🍽️",
  Transport: "🚲",
  Shopping: "🛍️",
  "Bills & utilities": "💡",
  Health: "🌿",
  Entertainment: "🎟️",
  Home: "🏠",
  Other: "✦",
};
const SAVING_CATEGORIES = {
  Saving: "🐷",
  Investment: "📈",
};

const monthPicker = document.querySelector("#month-picker");
const weekPicker = document.querySelector("#week-picker");
const plannerMonthPicker = document.querySelector("#planner-month-picker");
const plannerWeekPicker = document.querySelector("#planner-week-picker");
const currencySelect = document.querySelector("#currency-select");
const plannerTotalBudgetInput = document.querySelector("#planner-total-budget");
const monthSavingForm = document.querySelector("#month-saving-form");
const weekSavingForm = document.querySelector("#week-saving-form");
const transactionTypeInput = document.querySelector("#transaction-type");
const transactionCategoryInput = document.querySelector("#expense-category");
const monthlyPlan = document.querySelector("#monthly-plan");
const weeklyPlan = document.querySelector("#weekly-plan");
const planPeriodButtons = document.querySelectorAll("[data-plan-period]");
const overviewPage = document.querySelector("#overview");
const plannerPage = document.querySelector("#plan-page");
const navigationLinks = document.querySelectorAll("[data-page-target], [data-page-scroll]");
const expenseForm = document.querySelector("#expense-form");
const expenseRows = document.querySelector("#expense-rows");
const toast = document.querySelector("#toast");
const formMessage = document.querySelector("#form-message");
const cancelEditButton = document.querySelector("#cancel-edit");
let state = loadState();
let toastTimeout;
let editingId = null;
let selectedPlanPeriod = "month";
let currentPage = "overview";
let activeNavigation = "overview";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function isoWeekForDate(date = new Date()) {
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function weekStartDate(week) {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) return null;
  const year = Number(match[1]);
  const weekNumber = Number(match[2]);
  if (weekNumber < 1 || weekNumber > 53) return null;
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - ((januaryFourth.getUTCDay() + 6) % 7) + (weekNumber - 1) * 7);
  const localMonday = new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 12);
  if (isoWeekForDate(localMonday) !== week) return null;
  return monday.toISOString().slice(0, 10);
}

function weekEndDate(week) {
  const start = weekStartDate(week);
  if (!start) return null;
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10);
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultExpenseDate(month = monthPicker.value) {
  const today = localDateString();
  return today.startsWith(`${month}-`) ? today : `${month}-01`;
}

function defaultTransactionDate() {
  if (selectedPlanPeriod !== "week") return defaultExpenseDate();
  return defaultTransactionDateForWeek();
}

function defaultTransactionDateForWeek() {
  const start = weekStartDate(weekPicker.value);
  const end = weekEndDate(weekPicker.value);
  if (!start || !end) return localDateString();
  const today = localDateString();
  return today >= start && today <= end ? today : start;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        expenses: [],
        savings: [],
        budgets: {},
        weekBudgets: {},
        monthCategoryBudgets: {},
        weekCategoryBudgets: {},
        currency: "EUR",
      };
    }
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.expenses) || !parsed.budgets || typeof parsed.budgets !== "object" ||
      (parsed.savings !== undefined && !Array.isArray(parsed.savings)) ||
      (parsed.monthCategoryBudgets !== undefined &&
        (!parsed.monthCategoryBudgets || typeof parsed.monthCategoryBudgets !== "object")) ||
      (parsed.weekCategoryBudgets !== undefined &&
        (!parsed.weekCategoryBudgets || typeof parsed.weekCategoryBudgets !== "object")) ||
      (parsed.weekBudgets !== undefined && (!parsed.weekBudgets || typeof parsed.weekBudgets !== "object"))) {
      throw new Error("Saved budget data has an invalid format.");
    }
    const isValidTransaction = (transaction) =>
      transaction &&
      typeof transaction.id === "string" &&
      typeof transaction.name === "string" &&
      typeof transaction.category === "string" &&
      typeof transaction.date === "string" &&
      Number.isFinite(transaction.amount) &&
      transaction.amount > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(transaction.date);
    const expenses = parsed.expenses.filter(isValidTransaction);
    const savings = (parsed.savings || []).filter(isValidTransaction);
    const budgets = Object.fromEntries(
      Object.entries(parsed.budgets).filter(([month, amount]) =>
        /^\d{4}-\d{2}$/.test(month) && Number.isFinite(amount) && amount >= 0
      )
    );
    const weekBudgets = Object.fromEntries(
      Object.entries(parsed.weekBudgets || {}).filter(([week, amount]) =>
        weekStartDate(week) && Number.isFinite(amount) && amount >= 0
      )
    );
    const filterCategoryBudgets = (savedBudgets, isValidPeriod) => Object.fromEntries(
      Object.entries(savedBudgets || [])
        .filter(([period, categories]) =>
          isValidPeriod(period) && categories && typeof categories === "object" && !Array.isArray(categories)
        )
        .map(([period, categories]) => [
          period,
          Object.fromEntries(Object.entries(categories).filter(([category, amount]) =>
            (Object.hasOwn(CATEGORY_ICONS, category) || Object.hasOwn(SAVING_CATEGORIES, category)) &&
            Number.isFinite(amount) && amount >= 0
          )),
        ])
    );
    const monthCategoryBudgets = filterCategoryBudgets(
      parsed.monthCategoryBudgets,
      (month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    );
    const weekCategoryBudgets = filterCategoryBudgets(parsed.weekCategoryBudgets, weekStartDate);
    const currency = Object.hasOwn(CURRENCIES, parsed.currency) ? parsed.currency : "EUR";
    return {
      expenses,
      savings,
      budgets,
      weekBudgets,
      monthCategoryBudgets,
      weekCategoryBudgets,
      currency,
    };
  } catch (error) {
    console.error("Could not load saved budget data:", error);
    return {
      expenses: [],
      savings: [],
      budgets: {},
      weekBudgets: {},
      monthCategoryBudgets: {},
      weekCategoryBudgets: {},
      currency: "EUR",
    };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("Could not save budget data:", error);
    showToast("Could not save data on this device. Check available storage.");
    return false;
  }
}

function monthExpenses(month = monthPicker.value) {
  return state.expenses
    .filter((expense) => expense.date.startsWith(`${month}-`))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function selectedWeekExpenses(week = weekPicker.value) {
  const start = weekStartDate(week);
  const end = weekEndDate(week);
  if (!start || !end) return [];
  return state.expenses
    .filter((expense) => expense.date >= start && expense.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function transactionsForMonth(month = monthPicker.value) {
  return [...state.expenses, ...state.savings]
    .filter((transaction) => transaction.date.startsWith(`${month}-`))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function selectedWeekSavings(week = weekPicker.value) {
  const start = weekStartDate(week);
  const end = weekEndDate(week);
  if (!start || !end) return [];
  return state.savings
    .filter((saving) => saving.date >= start && saving.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function selectedWeekTransactions(week = weekPicker.value) {
  const start = weekStartDate(week);
  const end = weekEndDate(week);
  if (!start || !end) return [];
  return [...state.expenses, ...state.savings]
    .filter((transaction) => transaction.date >= start && transaction.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function transactionCollection(type) {
  return type === "saving" ? state.savings : state.expenses;
}

function populateSavingCategories() {
  for (const select of document.querySelectorAll("#month-saving-category, #week-saving-category")) {
    for (const [category, icon] of Object.entries(SAVING_CATEGORIES)) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = `${icon} ${category}`;
      select.append(option);
    }
  }
}

function populateTransactionCategories(type, selectedCategory) {
  const categories = type === "saving" ? SAVING_CATEGORIES : CATEGORY_ICONS;
  transactionCategoryInput.replaceChildren();
  for (const [category, icon] of Object.entries(categories)) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = `${icon} ${category}`;
    transactionCategoryInput.append(option);
  }
  if (selectedCategory && !Object.hasOwn(categories, selectedCategory)) {
    const legacyOption = document.createElement("option");
    legacyOption.value = selectedCategory;
    legacyOption.textContent = selectedCategory;
    transactionCategoryInput.append(legacyOption);
  }
  transactionCategoryInput.value = selectedCategory && [...transactionCategoryInput.options]
    .some((option) => option.value === selectedCategory)
    ? selectedCategory
    : Object.keys(categories)[0];
}

function addPeriodSaving(form, period) {
  const amountInput = form.querySelector('input[type="number"]');
  const categoryInput = form.querySelector("select");
  const amount = Number(amountInput.value);
  const category = categoryInput.value;
  if (!amountInput.value || !Number.isFinite(amount) || amount <= 0 || !Object.hasOwn(SAVING_CATEGORIES, category)) {
    showToast("Enter a positive saving amount and choose a category.");
    return;
  }

  const date = period === "month" ? defaultExpenseDate(monthPicker.value) : defaultTransactionDateForWeek();
  const saving = {
    id: crypto.randomUUID(),
    name: category,
    amount: Math.round(amount * 100) / 100,
    category,
    date,
    createdAt: Date.now(),
  };
  state.savings.push(saving);
  if (!saveState()) {
    state.savings.pop();
    return;
  }

  form.reset();
  render();
  showToast(`${formatMoney(saving.amount)} added under ${category}.`);
}

function findTransaction(id) {
  for (const type of ["expense", "saving"]) {
    const collection = transactionCollection(type);
    const index = collection.findIndex((transaction) => transaction.id === id);
    if (index >= 0) return { type, collection, index, transaction: collection[index] };
  }
  return null;
}

function selectedPeriodKey() {
  return selectedPlanPeriod === "month" ? monthPicker.value : weekPicker.value;
}

function selectedCategoryBudgets() {
  const allBudgets = selectedPlanPeriod === "month"
    ? state.monthCategoryBudgets
    : state.weekCategoryBudgets;
  return allBudgets[selectedPeriodKey()] || {};
}

function selectedPeriodExpenses() {
  return selectedPlanPeriod === "month" ? monthExpenses() : selectedWeekExpenses();
}

function savePlannedAmount(category, value) {
  const amount = value === "" ? null : Number(value);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    showToast("Enter a category plan of zero or more.");
    render();
    return;
  }
  const collection = selectedPlanPeriod === "month"
    ? state.monthCategoryBudgets
    : state.weekCategoryBudgets;
  const period = selectedPeriodKey();
  const previous = collection[period] ? { ...collection[period] } : undefined;
  if (!collection[period]) collection[period] = {};
  if (amount === null) {
    delete collection[period][category];
    if (Object.keys(collection[period]).length === 0) delete collection[period];
  } else {
    collection[period][category] = Math.round(amount * 100) / 100;
  }
  if (!saveState()) {
    if (previous) collection[period] = previous;
    else delete collection[period];
    return;
  }
  render();
}

function renderPlanner() {
  const isMonthlyPlan = selectedPlanPeriod === "month";
  document.querySelector("#planner-month-control").hidden = !isMonthlyPlan;
  document.querySelector("#planner-week-control").hidden = isMonthlyPlan;
  document.querySelector("#planner-period-heading").textContent =
    isMonthlyPlan ? "Monthly plan" : "Weekly plan";
  if (document.activeElement !== plannerMonthPicker) plannerMonthPicker.value = monthPicker.value;
  if (document.activeElement !== plannerWeekPicker) plannerWeekPicker.value = weekPicker.value;
  const key = selectedPeriodKey();
  const totalBudget = isMonthlyPlan ? state.budgets[key] : state.weekBudgets[key];
  if (document.activeElement !== plannerTotalBudgetInput) {
    plannerTotalBudgetInput.value = totalBudget ?? "";
  }
  document.querySelector("#planner-period-range").textContent = isMonthlyPlan
    ? formatMonth(key)
    : `${formatDate(weekStartDate(key))} – ${formatDate(weekEndDate(key))}`;
  document.querySelector("#planner-currency").textContent = CURRENCIES[state.currency].symbol;

  const budgets = selectedCategoryBudgets();
  const amountsByCategory = new Map();
  const periodExpenses = selectedPeriodExpenses();
  const periodSavings = isMonthlyPlan
    ? state.savings.filter((saving) => saving.date.startsWith(`${key}-`))
    : selectedWeekSavings(key);
  for (const transaction of [...periodExpenses, ...periodSavings]) {
    amountsByCategory.set(
      transaction.category,
      (amountsByCategory.get(transaction.category) || 0) + transaction.amount
    );
  }
  const allocationTotal = Object.values(budgets).reduce((sum, amount) => sum + amount, 0);
  const allocationTotalLabel = document.querySelector("#planner-allocation-total");
  const allocationExcess = totalBudget === undefined ? 0 : allocationTotal - totalBudget;
  allocationTotalLabel.textContent = allocationExcess > 0
    ? `${formatMoney(allocationTotal)} allocated · ${formatMoney(allocationExcess)} over total`
    : `${formatMoney(allocationTotal)} planned across categories`;
  allocationTotalLabel.classList.toggle("over-budget", allocationExcess > 0);

  const categoryList = document.querySelector("#planner-category-list");
  categoryList.replaceChildren();
  const planGroups = [
    { categories: CATEGORY_ICONS, actualLabel: "Spent", goalLabel: "limit" },
    { categories: SAVING_CATEGORIES, actualLabel: "Saved", goalLabel: "goal" },
  ];
  for (const group of planGroups) {
    for (const [category, icon] of Object.entries(group.categories)) {
      const row = document.createElement("div");
      row.className = "planner-category-row";
      const planned = budgets[category];
      const actual = amountsByCategory.get(category) || 0;
      row.innerHTML = `
        <span class="planner-category-name"><span aria-hidden="true">${escapeXml(icon)}</span>${escapeXml(category)}</span>
        <span class="planner-category-spent">${group.actualLabel} <strong>${formatMoney(actual)}</strong></span>
        <label class="planner-category-input">
          <span>${isMonthlyPlan ? "Monthly" : "Weekly"} ${group.goalLabel}</span>
          <span class="planner-amount-input"><span>${escapeXml(CURRENCIES[state.currency].symbol)}</span>
            <input type="number" min="0" step="0.01" inputmode="decimal" data-plan-category="${escapeXml(category)}" aria-label="${escapeXml(category)} planned amount" placeholder="Not set" value="${planned ?? ""}" />
          </span>
        </label>`;
      categoryList.append(row);
    }
  }
}

function formatMoney(amount, currency = state.currency) {
  const { locale } = CURRENCIES[currency];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

function formatMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
    .format(new Date(year, monthNumber - 1, 1));
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character]);
}

function render() {
  const isMonthlyPlan = selectedPlanPeriod === "month";
  overviewPage.hidden = currentPage !== "overview";
  plannerPage.hidden = currentPage !== "plan";
  document.querySelector("#current-page-title").textContent =
    currentPage === "plan" ? "Plan budget" : "Dashboard";
  for (const link of document.querySelectorAll(".nav-item[data-page-target]")) {
    const isCurrent = link.dataset.pageTarget === activeNavigation;
    link.classList.toggle("active", isCurrent);
    if (isCurrent) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  monthlyPlan.hidden = !isMonthlyPlan;
  weeklyPlan.hidden = isMonthlyPlan;
  for (const button of planPeriodButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.planPeriod === selectedPlanPeriod));
  }

  const expenses = monthExpenses();
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const savings = state.savings.filter((saving) => saving.date.startsWith(`${monthPicker.value}-`));
  const savedTotal = savings.reduce((sum, saving) => sum + saving.amount, 0);
  const budget = state.budgets[monthPicker.value] ?? 0;
  const remaining = budget - total - savedTotal;
  const weekExpenses = selectedWeekExpenses();
  const weekTotal = weekExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const weekSavings = selectedWeekSavings();
  const weekSavedTotal = weekSavings.reduce((sum, saving) => sum + saving.amount, 0);
  const weekBudget = state.weekBudgets[weekPicker.value] ?? 0;
  const weekRemaining = weekBudget - weekTotal - weekSavedTotal;
  const currency = CURRENCIES[state.currency];

  document.querySelector("#total-spent").textContent = formatMoney(total);
  document.querySelector("#expense-count").textContent =
    `${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"} this month`;
  document.querySelector("#month-saved-amount").textContent = formatMoney(savedTotal);
  document.querySelector("#month-saving-count").textContent =
    `${savings.length} ${savings.length === 1 ? "saving" : "savings"} this month`;
  document.querySelector("#amount-currency").textContent = currency.symbol;
  document.querySelector("#month-budget-amount").textContent = formatMoney(budget);
  document.querySelector("#week-budget-amount").textContent = formatMoney(weekBudget);
  for (const prefix of document.querySelectorAll(".saving-currency")) {
    prefix.textContent = currency.symbol;
  }
  document.querySelector("#remaining-amount").textContent = formatMoney(Math.max(0, remaining));
  document.querySelector("#budget-progress-label").textContent = !budget
    ? "Set a budget to track your progress"
    : remaining >= 0
      ? `${Math.round(((total + savedTotal) / budget) * 100)}% of your budget used`
      : `${formatMoney(Math.abs(remaining))} over your budget`;

  const progress = budget > 0 ? Math.min(((total + savedTotal) / budget) * 100, 100) : 0;
  const progressFill = document.querySelector("#budget-progress");
  progressFill.style.width = `${progress}%`;
  progressFill.classList.toggle("over-budget", budget > 0 && total + savedTotal > budget);
  const weekStart = weekStartDate(weekPicker.value);
  const weekEnd = weekEndDate(weekPicker.value);
  document.querySelector("#transaction-month-label").textContent = isMonthlyPlan
    ? formatMonth(monthPicker.value)
    : `Week of ${formatDate(weekStart)}`;
  document.querySelector("#week-range").textContent = `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
  document.querySelector("#week-spent-amount").textContent = formatMoney(weekTotal);
  document.querySelector("#week-expense-count").textContent =
    `${weekExpenses.length} ${weekExpenses.length === 1 ? "expense" : "expenses"} this week`;
  document.querySelector("#week-saved-amount").textContent = formatMoney(weekSavedTotal);
  document.querySelector("#week-saving-count").textContent =
    `${weekSavings.length} ${weekSavings.length === 1 ? "saving" : "savings"} this week`;
  document.querySelector("#week-remaining-amount").textContent = formatMoney(Math.max(0, weekRemaining));
  document.querySelector("#week-budget-progress-label").textContent = !weekBudget
    ? "Set a budget to track your progress"
    : weekRemaining >= 0
      ? `${Math.round(((weekTotal + weekSavedTotal) / weekBudget) * 100)}% of your budget used`
      : `${formatMoney(Math.abs(weekRemaining))} over your budget`;
  const weekProgress = weekBudget > 0
    ? Math.min(((weekTotal + weekSavedTotal) / weekBudget) * 100, 100)
    : 0;
  const weekProgressFill = document.querySelector("#week-budget-progress");
  weekProgressFill.style.width = `${weekProgress}%`;
  weekProgressFill.classList.toggle(
    "over-budget",
    weekBudget > 0 && weekTotal + weekSavedTotal > weekBudget
  );

  const transactions = isMonthlyPlan ? transactionsForMonth() : selectedWeekTransactions();
  const categoryExpenses = isMonthlyPlan ? expenses : weekExpenses;
  const categorySavings = isMonthlyPlan ? savings : weekSavings;
  const categoryExpenseTotal = isMonthlyPlan ? total : weekTotal;
  const categorySavingsTotal = isMonthlyPlan ? savedTotal : weekSavedTotal;
  expenseRows.replaceChildren();
  for (const transaction of transactions) {
    const type = state.savings.includes(transaction) ? "saving" : "expense";
    const row = document.createElement("tr");
    row.classList.toggle("editing", transaction.id === editingId);
    row.innerHTML = `
      <td>${escapeXml(transaction.name)}</td>
      <td><span class="transaction-type ${type}">${type === "saving" ? "Saving" : "Expense"}</span></td>
      <td><span class="expense-category"><span aria-hidden="true">${CATEGORY_ICONS[transaction.category] || SAVING_CATEGORIES[transaction.category] || "✦"}</span>${escapeXml(transaction.category)}</span></td>
      <td>${formatDate(transaction.date)}</td>
      <td class="amount-cell">${formatMoney(transaction.amount)}</td>
      <td class="action-cell"><button class="edit-button" type="button" data-edit-id="${escapeXml(transaction.id)}" aria-label="Edit ${escapeXml(transaction.name)}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6 4 4M4.5 19.5l1-4.5L15.3 5.2a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L9 18.5l-4.5 1Z" /></svg></button><button class="delete-button" type="button" data-delete-id="${escapeXml(transaction.id)}" aria-label="Delete ${escapeXml(transaction.name)}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button></td>`;
    expenseRows.append(row);
  }

  const isEmpty = transactions.length === 0;
  document.querySelector("#expenses-empty").hidden = !isEmpty;
  document.querySelector("#table-expense-count").textContent =
    `${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"}`;

  const categoryList = document.querySelector("#category-list");
  categoryList.replaceChildren();
  const categoryBudgets = selectedCategoryBudgets();
  const categoryGroups = [
    {
      label: "Expenses",
      entries: categoryExpenses,
      total: categoryExpenseTotal,
      categories: CATEGORY_ICONS,
    },
    {
      label: "Savings",
      entries: categorySavings,
      total: categorySavingsTotal,
      categories: SAVING_CATEGORIES,
    },
  ];
  for (const group of categoryGroups) {
    const groupBudgets = Object.fromEntries(
      Object.entries(categoryBudgets).filter(([category]) => Object.hasOwn(group.categories, category))
    );
    if (!group.entries.length && !Object.keys(groupBudgets).length) continue;
    const heading = document.createElement("div");
    heading.className = "category-group-label";
    heading.textContent = group.label;
    categoryList.append(heading);
    const totalsByCategory = new Map();
    for (const transaction of group.entries) {
      totalsByCategory.set(
        transaction.category,
        (totalsByCategory.get(transaction.category) || 0) + transaction.amount
      );
    }
    for (const category of Object.keys(groupBudgets)) {
      if (!totalsByCategory.has(category)) totalsByCategory.set(category, 0);
    }
    const categories = [...totalsByCategory.entries()].sort((a, b) => b[1] - a[1]);
    for (const [category, amount] of categories) {
      const row = document.createElement("div");
      row.className = "category-row";
      const planned = groupBudgets[category];
      const barWidth = planned !== undefined
        ? (planned > 0 ? Math.min((amount / planned) * 100, 100) : (amount > 0 ? 100 : 0))
        : group.total > 0 ? (amount / group.total) * 100 : 0;
      const fillColor = amount > planned && planned !== undefined
        ? "#c78065"
        : CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
      row.innerHTML = `
        <span class="category-name">${escapeXml(CATEGORY_ICONS[category] || SAVING_CATEGORIES[category] || "✦")} &nbsp;${escapeXml(category)}</span>
        <span class="category-track"><span class="category-fill" style="display:block;width:${barWidth}%;background:${fillColor}"></span></span>
        <span class="category-total">${formatMoney(amount)}${planned !== undefined
    ? `<small class="category-plan-caption">of ${formatMoney(planned)} planned</small>`
    : ""}</span>`;
      categoryList.append(row);
    }
  }
  document.querySelector("#category-empty").hidden =
    transactions.length > 0 || Object.keys(categoryBudgets).length > 0;
  document.querySelector("#snapshot-footer-text").textContent = transactions.length
    ? `${categoryExpenses.length} expenses · ${categorySavings.length} savings`
    : Object.keys(categoryBudgets).length
      ? "Planned category amounts appear here"
      : "Categories update as you add transactions";
  renderPlanner();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2800);
}

function editButtonFor(id) {
  return [...expenseRows.querySelectorAll("[data-edit-id]")].find((button) => button.dataset.editId === id);
}

function startEditing(transaction, type) {
  editingId = transaction.id;
  transactionTypeInput.value = type;
  populateTransactionCategories(type, transaction.category);
  document.querySelector("#expense-name").value = transaction.name;
  document.querySelector("#expense-amount").value = transaction.amount.toFixed(2);
  document.querySelector("#expense-date").value = transaction.date;
  document.querySelector("#form-kicker").textContent = "FIX A DETAIL";
  document.querySelector("#form-heading").textContent = `Edit ${type}`;
  document.querySelector("#submit-label").textContent = "Save changes";
  cancelEditButton.hidden = false;
  formMessage.textContent = "";
  render();
  document.querySelector("#expense-name").focus();
}

function stopEditing() {
  editingId = null;
  expenseForm.reset();
  populateTransactionCategories("expense", "Food & dining");
  transactionTypeInput.value = "expense";
  document.querySelector("#expense-date").value = defaultTransactionDate();
  document.querySelector("#form-kicker").textContent = "KEEP A DAILY NOTE";
  document.querySelector("#form-heading").textContent = "Add a transaction";
  document.querySelector("#submit-label").textContent = "Add expense";
  cancelEditButton.hidden = true;
  formMessage.textContent = "";
}

function setCell(cellReference, value, type = "string") {
  if (type === "number") {
    return `<c r="${cellReference}"><v>${Number(value)}</v></c>`;
  }
  return `<c r="${cellReference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function worksheetXml(rows) {
  const body = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => {
      let column = columnIndex + 1;
      let columnName = "";
      while (column > 0) {
        columnName = String.fromCharCode(((column - 1) % 26) + 65) + columnName;
        column = Math.floor((column - 1) / 26);
      }
      const isNumber = typeof value === "number" && Number.isFinite(value);
      return setCell(`${columnName}${rowNumber}`, value, isNumber ? "number" : "string");
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x21, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x21, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function exportMonth() {
  const month = monthPicker.value;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    showToast("Choose a month before exporting.");
    return;
  }

  const expenses = monthExpenses(month);
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const savings = state.savings.filter((saving) => saving.date.startsWith(`${month}-`));
  const savedTotal = savings.reduce((sum, saving) => sum + saving.amount, 0);
  const budget = state.budgets[month] ?? 0;
  const categoryBudgets = state.monthCategoryBudgets[month] || {};
  const expensesByCategory = new Map();
  for (const expense of expenses) {
    expensesByCategory.set(
      expense.category,
      (expensesByCategory.get(expense.category) || 0) + expense.amount
    );
  }
  const overviewRows = [
    ["Monthly budget summary", formatMonth(month)],
    ["Currency", state.currency],
    ["Total spent", total],
    ["Total saved", savedTotal],
    ["Monthly budget", budget],
    ["Remaining", budget - total],
    ["Number of expenses", expenses.length],
    ["Number of savings", savings.length],
    [],
    ["Category", `Planned (${state.currency})`, `Spent (${state.currency})`],
    ...Object.entries(categoryBudgets).map(([category, planned]) => [
      category,
      planned,
      expensesByCategory.get(category) || 0,
    ]),
  ];
  const detailRows = [
    ["Date", "Type", "Item", "Category", `Amount (${state.currency})`],
    ...[...expenses.map((expense) => ({ ...expense, type: "Expense" })),
      ...savings.map((saving) => ({ ...saving, type: "Saving" }))]
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
      .map((transaction) => [
        transaction.date,
        transaction.type,
        transaction.name,
        transaction.category,
        transaction.amount,
      ]),
  ];

  const files = [
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Overview" sheetId="1" r:id="rId1"/><sheet name="Transactions" sheetId="2" r:id="rId2"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'],
    ["xl/worksheets/sheet1.xml", worksheetXml(overviewRows)],
    ["xl/worksheets/sheet2.xml", worksheetXml(detailRows)],
  ];

  const url = URL.createObjectURL(makeZip(files));
  const link = document.createElement("a");
  link.href = url;
  link.download = `daybook-${month}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Exported ${formatMonth(month)} to Excel.`);
}

function navigateToPage(page, updateHistory = true) {
  currentPage = page === "plan" ? "plan" : "overview";
  activeNavigation = currentPage;
  if (updateHistory) {
    const hash = currentPage === "plan" ? "#plan" : "#overview";
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
  }
  render();
}

monthPicker.value = currentMonth();
weekPicker.value = isoWeekForDate();
let lastValidWeek = weekPicker.value;
plannerMonthPicker.value = monthPicker.value;
plannerWeekPicker.value = weekPicker.value;
if (window.location.hash === "#plan") {
  currentPage = "plan";
  activeNavigation = "plan";
}
currencySelect.value = state.currency;
populateSavingCategories();
populateTransactionCategories("expense", "Food & dining");
document.querySelector("#expense-date").value = defaultTransactionDate();
render();

for (const button of planPeriodButtons) {
  button.addEventListener("click", () => {
    selectedPlanPeriod = button.dataset.planPeriod;
    if (!editingId) document.querySelector("#expense-date").value = defaultTransactionDate();
    render();
  });
}

monthPicker.addEventListener("change", () => {
  if (editingId) stopEditing();
  plannerMonthPicker.value = monthPicker.value;
  document.querySelector("#expense-date").value = defaultTransactionDate();
  render();
});
weekPicker.addEventListener("change", () => {
  if (!weekStartDate(weekPicker.value)) {
    showToast("Choose a valid week.");
    weekPicker.value = lastValidWeek;
    return;
  }
  lastValidWeek = weekPicker.value;
  plannerWeekPicker.value = weekPicker.value;
  if (!editingId && selectedPlanPeriod === "week") {
    document.querySelector("#expense-date").value = defaultTransactionDate();
  }
  render();
});
plannerMonthPicker.addEventListener("change", () => {
  monthPicker.value = plannerMonthPicker.value;
  selectedPlanPeriod = "month";
  document.querySelector("#expense-date").value = defaultTransactionDate();
  render();
});
plannerWeekPicker.addEventListener("change", () => {
  if (!weekStartDate(plannerWeekPicker.value)) {
    showToast("Choose a valid week.");
    plannerWeekPicker.value = weekPicker.value;
    return;
  }
  weekPicker.value = plannerWeekPicker.value;
  lastValidWeek = weekPicker.value;
  selectedPlanPeriod = "week";
  document.querySelector("#expense-date").value = defaultTransactionDate();
  render();
});
transactionTypeInput.addEventListener("change", () => {
  const current = editingId ? findTransaction(editingId) : null;
  const selectedCategory = current?.type === transactionTypeInput.value
    ? current.transaction.category
    : undefined;
  populateTransactionCategories(transactionTypeInput.value, selectedCategory);
  if (editingId) {
    document.querySelector("#form-heading").textContent =
      `Edit ${transactionTypeInput.value === "saving" ? "saving" : "expense"}`;
  } else {
    document.querySelector("#submit-label").textContent =
      transactionTypeInput.value === "saving" ? "Add saving" : "Add expense";
  }
});
currencySelect.addEventListener("change", () => {
  state.currency = currencySelect.value;
  saveState();
  render();
});

plannerTotalBudgetInput.addEventListener("change", () => {
  const isMonthlyPlan = selectedPlanPeriod === "month";
  const budgets = isMonthlyPlan ? state.budgets : state.weekBudgets;
  const period = selectedPeriodKey();
  const previous = budgets[period];
  if (plannerTotalBudgetInput.value === "") {
    delete budgets[period];
  } else {
    const amount = Number(plannerTotalBudgetInput.value);
    if (!Number.isFinite(amount) || amount < 0) {
      showToast("Enter a budget of zero or more.");
      render();
      return;
    }
    budgets[period] = Math.round(amount * 100) / 100;
  }
  if (!saveState()) {
    if (previous === undefined) delete budgets[period];
    else budgets[period] = previous;
    return;
  }
  render();
});

document.querySelector("#planner-category-list").addEventListener("change", (event) => {
  const input = event.target.closest("[data-plan-category]");
  if (input) savePlannedAmount(input.dataset.planCategory, input.value);
});

for (const link of navigationLinks) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const page = link.dataset.pageTarget === "plan" ? "plan" : "overview";
    navigateToPage(page);
    if (link.dataset.pageScroll) {
      document.querySelector(`#${link.dataset.pageScroll}`).scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

window.addEventListener("hashchange", () => {
  const page = window.location.hash === "#plan" ? "plan" : "overview";
  if (page !== currentPage) navigateToPage(page, false);
});

monthSavingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addPeriodSaving(monthSavingForm, "month");
});

weekSavingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addPeriodSaving(weekSavingForm, "week");
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(expenseForm);
  const name = String(formData.get("name") || "").trim();
  const amount = Number(formData.get("amount"));
  const date = String(formData.get("date") || "");
  const category = String(formData.get("category") || "");
  const type = String(formData.get("type") || "");
  const current = editingId ? findTransaction(editingId) : null;
  if (!name || name.length > 80 || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    formMessage.textContent = "Add a description, a positive amount, and a valid date.";
    return;
  }
  if (!["expense", "saving"].includes(type)) {
    formMessage.textContent = "Choose whether this transaction is an expense or saving.";
    return;
  }
  const validCategories = type === "saving" ? SAVING_CATEGORIES : CATEGORY_ICONS;
  if (!Object.hasOwn(validCategories, category) &&
    !(current?.type === type && current.transaction.category === category)) {
    formMessage.textContent = type === "saving"
      ? "Choose Saving or Investment as the category."
      : "Choose a valid expense category.";
    return;
  }
  if (editingId) {
    if (!current) {
      stopEditing();
      render();
      showToast("That transaction no longer exists.");
      return;
    }
    const previous = current.transaction;
    const updated = { ...previous, name, amount: Math.round(amount * 100) / 100, category, date };
    if (current.type === type) {
      current.collection[current.index] = updated;
    } else {
      current.collection.splice(current.index, 1);
      transactionCollection(type).push(updated);
    }
    if (!saveState()) {
      if (current.type === type) {
        current.collection[current.index] = previous;
      } else {
        const target = transactionCollection(type);
        const targetIndex = target.findIndex((transaction) => transaction.id === editingId);
        if (targetIndex >= 0) target.splice(targetIndex, 1);
        current.collection.splice(current.index, 0, previous);
      }
      return;
    }
    const editedId = editingId;
    stopEditing();
    render();
    showToast(date.startsWith(`${monthPicker.value}-`)
      ? `${type === "saving" ? "Saving" : "Expense"} updated.`
      : `Transaction updated and moved to ${formatMonth(date.slice(0, 7))}.`);
    (editButtonFor(editedId) || document.querySelector("#expense-name")).focus();
    return;
  }
  const transaction = {
    id: crypto.randomUUID(),
    name,
    amount: Math.round(amount * 100) / 100,
    category,
    date,
    createdAt: Date.now(),
  };
  const collection = transactionCollection(type);
  collection.push(transaction);
  if (!saveState()) {
    collection.pop();
    return;
  }
  formMessage.textContent = "";
  expenseForm.reset();
  document.querySelector("#submit-label").textContent = "Add expense";
  document.querySelector("#expense-date").value = defaultTransactionDate();
  showToast(`${type === "saving" ? "Saving" : "Expense"} added and saved on this device.`);
  render();
  document.querySelector("#expense-name").focus();
});

expenseRows.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    const found = findTransaction(editButton.dataset.editId);
    if (found) startEditing(found.transaction, found.type);
    return;
  }
  const button = event.target.closest("[data-delete-id]");
  if (!button) return;
  const found = findTransaction(button.dataset.deleteId);
  if (!found) return;
  const [removed] = found.collection.splice(found.index, 1);
  if (!saveState()) {
    found.collection.splice(found.index, 0, removed);
    return;
  }
  if (removed.id === editingId) stopEditing();
  render();
  showToast(`${found.type === "saving" ? "Saving" : "Expense"} removed.`);
});

cancelEditButton.addEventListener("click", () => {
  const editedId = editingId;
  stopEditing();
  render();
  (editButtonFor(editedId) || document.querySelector("#expense-name")).focus();
});

expenseForm.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editingId) cancelEditButton.click();
});

document.querySelector("#export-button").addEventListener("click", exportMonth);
window.addEventListener("storage", (event) => {
  if (event.storageArea !== localStorage) return;
  // event.key is null when localStorage was cleared entirely
  if (event.key !== null && event.key !== STORAGE_KEY) return;

  state = loadState();
  currencySelect.value = state.currency;

  if (editingId && !findTransaction(editingId)) {
    stopEditing();
    showToast("The transaction you were editing was removed in another tab.");
  }
  render();
});