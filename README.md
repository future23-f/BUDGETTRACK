# Daybook budget tracker

Daybook is a small, private budget tracker that runs in your browser.

## Get started

On Windows, double-click `start.bat`. Daybook will start on `http://127.0.0.1:3000` and open in your browser. Keep the terminal window open while using the app; press Ctrl+C to stop the local server. You can also run `.\start.ps1` from PowerShell.

If port 3000 is already in use, stop the other process or choose another port by setting `$env:PORT=3001` before running `.\start.ps1`.

Use **Plan budget** to set a monthly or weekly budget and allocate amounts to expense categories and savings goals (Saving and Investment). The dashboard reflects planned amounts and current spending and savings for the selected period. Monthly and weekly plans are tracked separately: choose a month or an ISO week (Monday through Sunday) and see expenses and savings for that period, including weeks that cross months. Add an expense or saving with a description, amount, date, and one of the shared categories. The category snapshot and recent transactions follow the selected month or week. Use the currency menu to change how amounts are displayed.

Your expenses, savings, monthly and weekly budgets, and category allocations are saved in the browser on this device. Savings are tracked separately from expenses, but count toward the budget and reduce the dashboard's remaining amount. The local server only serves the app files and does not receive or store your budget data. Use **Export Excel** to download the selected month as `daybook-YYYY-MM.xlsx`; each workbook includes an overview, monthly category plans and spending, and an expense-and-savings transaction list. Export each month you want to keep as an Excel file.

Because data is stored in this browser, it is not automatically backed up or shared with other devices. Export your monthly workbooks to keep a separate copy.
