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

const monthPicker = document.querySelector("#month-picker");
const weekPicker = document.querySelector("#week-picker");
const currencySelect = document.querySelector("#currency-select");
const budgetInput = document.querySelector("#budget-input");
const weekBudgetInput = document.querySelector("#week-budget-input");
const expenseForm = document.querySelector("#expense-form");
const expenseRows = document.querySelector("#expense-rows");
const toast = document.querySelector("#toast");
const formMessage = document.querySelector("#form-message");
const cancelEditButton = document.querySelector("#cancel-edit");
let state = loadState();
let toastTimeout;
let editingId = null;

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

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { expenses: [], budgets: {}, weekBudgets: {}, currency: "EUR" };
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.expenses) || !parsed.budgets || typeof parsed.budgets !== "object" ||
      (parsed.weekBudgets !== undefined && (!parsed.weekBudgets || typeof parsed.weekBudgets !== "object"))) {
      throw new Error("Saved budget data has an invalid format.");
    }
    const expenses = parsed.expenses.filter((expense) =>
      expense &&
      typeof expense.id === "string" &&
      typeof expense.name === "string" &&
      typeof expense.category === "string" &&
      typeof expense.date === "string" &&
      Number.isFinite(expense.amount) &&
      expense.amount > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(expense.date)
    );
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
    const currency = Object.hasOwn(CURRENCIES, parsed.currency) ? parsed.currency : "EUR";
    return { expenses, budgets, weekBudgets, currency };
  } catch (error) {
    console.error("Could not load saved budget data:", error);
    return { expenses: [], budgets: {}, weekBudgets: {}, currency: "EUR" };
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
  const expenses = monthExpenses();
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const budget = state.budgets[monthPicker.value] ?? 0;
  const remaining = budget - total;
  const weekExpenses = selectedWeekExpenses();
  const weekTotal = weekExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const weekBudget = state.weekBudgets[weekPicker.value] ?? 0;
  const weekRemaining = weekBudget - weekTotal;
  const currency = CURRENCIES[state.currency];

  document.querySelector("#total-spent").textContent = formatMoney(total);
  document.querySelector("#expense-count").textContent =
    `${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"} this month`;
  document.querySelector("#budget-currency").textContent = currency.symbol;
  document.querySelector("#amount-currency").textContent = currency.symbol;
  document.querySelector("#week-budget-currency").textContent = currency.symbol;
  document.querySelector("#remaining-amount").textContent = formatMoney(Math.max(0, remaining));
  document.querySelector("#budget-progress-label").textContent = !budget
    ? "Set a budget to track your progress"
    : remaining >= 0
      ? `${Math.round((total / budget) * 100)}% of your budget used`
      : `${formatMoney(Math.abs(remaining))} over your budget`;

  if (document.activeElement !== budgetInput) {
    budgetInput.value = state.budgets[monthPicker.value] ?? "";
  }
  if (document.activeElement !== weekBudgetInput) {
    weekBudgetInput.value = state.weekBudgets[weekPicker.value] ?? "";
  }

  const progress = budget > 0 ? Math.min((total / budget) * 100, 100) : 0;
  const progressFill = document.querySelector("#budget-progress");
  progressFill.style.width = `${progress}%`;
  progressFill.classList.toggle("over-budget", budget > 0 && total > budget);
  document.querySelector("#transaction-month-label").textContent = formatMonth(monthPicker.value);

  const weekStart = weekStartDate(weekPicker.value);
  const weekEnd = weekEndDate(weekPicker.value);
  document.querySelector("#week-range").textContent = `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
  document.querySelector("#week-spent-amount").textContent = formatMoney(weekTotal);
  document.querySelector("#week-expense-count").textContent =
    `${weekExpenses.length} ${weekExpenses.length === 1 ? "expense" : "expenses"} this week`;
  document.querySelector("#week-remaining-amount").textContent = formatMoney(Math.max(0, weekRemaining));
  document.querySelector("#week-budget-progress-label").textContent = !weekBudget
    ? "Set a budget to track your progress"
    : weekRemaining >= 0
      ? `${Math.round((weekTotal / weekBudget) * 100)}% of your budget used`
      : `${formatMoney(Math.abs(weekRemaining))} over your budget`;
  const weekProgress = weekBudget > 0 ? Math.min((weekTotal / weekBudget) * 100, 100) : 0;
  const weekProgressFill = document.querySelector("#week-budget-progress");
  weekProgressFill.style.width = `${weekProgress}%`;
  weekProgressFill.classList.toggle("over-budget", weekBudget > 0 && weekTotal > weekBudget);

  expenseRows.replaceChildren();
  for (const expense of expenses) {
    const row = document.createElement("tr");
    row.classList.toggle("editing", expense.id === editingId);
    row.innerHTML = `
      <td>${escapeXml(expense.name)}</td>
      <td><span class="expense-category"><span aria-hidden="true">${CATEGORY_ICONS[expense.category] || "✦"}</span>${escapeXml(expense.category)}</span></td>
      <td>${formatDate(expense.date)}</td>
      <td class="amount-cell">${formatMoney(expense.amount)}</td>
      <td class="action-cell"><button class="edit-button" type="button" data-edit-id="${escapeXml(expense.id)}" aria-label="Edit ${escapeXml(expense.name)}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6 4 4M4.5 19.5l1-4.5L15.3 5.2a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L9 18.5l-4.5 1Z" /></svg></button><button class="delete-button" type="button" data-delete-id="${escapeXml(expense.id)}" aria-label="Delete ${escapeXml(expense.name)}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button></td>`;
    expenseRows.append(row);
  }

  const isEmpty = expenses.length === 0;
  document.querySelector("#expenses-empty").hidden = !isEmpty;
  document.querySelector("#table-expense-count").textContent =
    `${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"}`;

  const totalsByCategory = new Map();
  for (const expense of expenses) {
    totalsByCategory.set(expense.category, (totalsByCategory.get(expense.category) || 0) + expense.amount);
  }
  const categories = [...totalsByCategory.entries()].sort((a, b) => b[1] - a[1]);
  const categoryList = document.querySelector("#category-list");
  categoryList.replaceChildren();
  for (const [category, amount] of categories) {
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <span class="category-name">${escapeXml(CATEGORY_ICONS[category] || "✦")} &nbsp;${escapeXml(category)}</span>
      <span class="category-track"><span class="category-fill" style="display:block;width:${(amount / total) * 100}%;background:${CATEGORY_COLORS[category] || CATEGORY_COLORS.Other}"></span></span>
      <span class="category-total">${formatMoney(amount)}</span>`;
    categoryList.append(row);
  }
  document.querySelector("#category-empty").hidden = categories.length > 0;
  document.querySelector("#snapshot-footer-text").textContent = categories.length
    ? `${categories.length} ${categories.length === 1 ? "category" : "categories"} · ${formatMoney(total)} total`
    : "Categories update as you add expenses";
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

function startEditing(expense) {
  editingId = expense.id;
  document.querySelector("#expense-name").value = expense.name;
  document.querySelector("#expense-amount").value = expense.amount.toFixed(2);
  document.querySelector("#expense-date").value = expense.date;
  document.querySelector("#expense-category").value = expense.category;
  document.querySelector("#form-kicker").textContent = "FIX A DETAIL";
  document.querySelector("#form-heading").textContent = "Edit expense";
  document.querySelector("#submit-label").textContent = "Save changes";
  cancelEditButton.hidden = false;
  formMessage.textContent = "";
  render();
  document.querySelector("#expense-name").focus();
}

function stopEditing() {
  editingId = null;
  expenseForm.reset();
  document.querySelector("#expense-date").value = defaultExpenseDate();
  document.querySelector("#form-kicker").textContent = "KEEP A DAILY NOTE";
  document.querySelector("#form-heading").textContent = "Add an expense";
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
  const budget = state.budgets[month] ?? 0;
  const overviewRows = [
    ["Monthly budget summary", formatMonth(month)],
    ["Currency", state.currency],
    ["Total spent", total],
    ["Monthly budget", budget],
    ["Remaining", budget - total],
    ["Number of expenses", expenses.length],
  ];
  const detailRows = [
    ["Date", "Expense", "Category", `Amount (${state.currency})`],
    ...expenses
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
      .map((expense) => [expense.date, expense.name, expense.category, expense.amount]),
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

monthPicker.value = currentMonth();
weekPicker.value = isoWeekForDate();
let lastValidWeek = weekPicker.value;
currencySelect.value = state.currency;
document.querySelector("#expense-date").value = defaultExpenseDate();
render();

monthPicker.addEventListener("change", () => {
  if (editingId) stopEditing();
  document.querySelector("#expense-date").value = defaultExpenseDate();
  render();
});
weekPicker.addEventListener("change", () => {
  if (!weekStartDate(weekPicker.value)) {
    showToast("Choose a valid week.");
    weekPicker.value = lastValidWeek;
    return;
  }
  lastValidWeek = weekPicker.value;
  render();
});
currencySelect.addEventListener("change", () => {
  state.currency = currencySelect.value;
  saveState();
  render();
});

budgetInput.addEventListener("change", () => {
  const amount = Number(budgetInput.value);
  if (budgetInput.value === "" || !Number.isFinite(amount) || amount < 0) {
    formMessage.textContent = "Enter a budget of zero or more.";
    render();
    return;
  }
  state.budgets[monthPicker.value] = Math.round(amount * 100) / 100;
  formMessage.textContent = "";
  if (saveState()) render();
});

weekBudgetInput.addEventListener("change", () => {
  const amount = Number(weekBudgetInput.value);
  if (weekBudgetInput.value === "" || !Number.isFinite(amount) || amount < 0) {
    showToast("Enter a weekly budget of zero or more.");
    render();
    return;
  }
  state.weekBudgets[weekPicker.value] = Math.round(amount * 100) / 100;
  if (saveState()) render();
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(expenseForm);
  const name = String(formData.get("name") || "").trim();
  const amount = Number(formData.get("amount"));
  const date = String(formData.get("date") || "");
  const category = String(formData.get("category") || "");
  if (!name || name.length > 80 || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    formMessage.textContent = "Add a description, a positive amount, and a valid date.";
    return;
  }
  if (editingId) {
    const index = state.expenses.findIndex((expense) => expense.id === editingId);
    if (index < 0) {
      stopEditing();
      render();
      showToast("That expense no longer exists.");
      return;
    }
    const previous = state.expenses[index];
    state.expenses[index] = { ...previous, name, amount: Math.round(amount * 100) / 100, category, date };
    if (!saveState()) {
      state.expenses[index] = previous;
      return;
    }
    const editedId = editingId;
    stopEditing();
    render();
    showToast(date.startsWith(`${monthPicker.value}-`)
      ? "Expense updated."
      : `Expense updated and moved to ${formatMonth(date.slice(0, 7))}.`);
    (editButtonFor(editedId) || document.querySelector("#expense-name")).focus();
    return;
  }
  const expense = {
    id: crypto.randomUUID(),
    name,
    amount: Math.round(amount * 100) / 100,
    category,
    date,
    createdAt: Date.now(),
  };
  state.expenses.push(expense);
  if (!saveState()) {
    state.expenses.pop();
    return;
  }
  formMessage.textContent = "";
  expenseForm.reset();
  document.querySelector("#expense-date").value = defaultExpenseDate();
  showToast("Expense added and saved on this device.");
  render();
  document.querySelector("#expense-name").focus();
});

expenseRows.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    const expense = state.expenses.find((item) => item.id === editButton.dataset.editId);
    if (expense) startEditing(expense);
    return;
  }
  const button = event.target.closest("[data-delete-id]");
  if (!button) return;
  const index = state.expenses.findIndex((expense) => expense.id === button.dataset.deleteId);
  if (index < 0) return;
  const [removed] = state.expenses.splice(index, 1);
  if (!saveState()) {
    state.expenses.splice(index, 0, removed);
    return;
  }
  if (removed.id === editingId) stopEditing();
  render();
  showToast("Expense removed.");
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
