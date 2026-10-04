

| Assessment item | Deliverable | File |
|---|---|---|
| Test Plan document | Detailed test plan doc | `docs/1_Test Plan Document.docx` |
| Test Cases | Categorized test cases | `docs/2_TestCases.xlsx`|
| Bug Reports Submission | Template + suspicions | `docs/3_BugReport.xlsx` |
| 3a. Update amount, rate, tenure using sliders | Slider drag helper + scenarios | `src/pages/EmiCalculatorPage.ts`, `tests/ui/emi-calculation.spec.ts` |
| 3b. Capture EMI, validate with formula in test code | Independent oracle | `src/emi.ts`, `tests/ui/emi-calculation.spec.ts` |
| 3c. Chart and table match year-wise | 3-way reconciliation | `tests/ui/schedule-and-chart.spec.ts` |
| 3d. Download Excel and add checks | Excel parser + checks | `src/utils/excel.ts`, `tests/ui/excel-download.spec.ts` |
| CI/CD with GitHub Actions | Workflow | `.github/workflows/playwright.yml` |