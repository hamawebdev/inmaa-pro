# Clients and contracts: handover

For whoever continues this folder. Features 1, 2, 3, 4, 5, 6, 26, 29, 40. Read `CLAUDE.md` and `docs/scope.md` first; this page only says where this owner's work stands.

## What exists

| What                                                                                                                                                                                                                                               | Where                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| His six forms as data: every label, blank and option in his order, and the tables that carry them on paper. Checked against the Checker's facts                                                                                                    | `forms/definitions/`, `forms/types.ts`, `forms/definitions.test.ts` |
| What a sheet says about a file (`FormValues`, in the data model's units) and how a row reads it (ticks, blanks, dates, amounts)                                                                                                                    | `forms/values.ts`, `forms/answers.ts`                               |
| Where each answer is kept (`Client`, `Site`, `File`, `FileDescription`, `FileService`, `Resident`) and the way back; the party snapshot of a signed file                                                                                           | `forms/stored-values.ts`                                            |
| The cards and label keys of the form screen                                                                                                                                                                                                        | `forms/screen-labels.ts`                                            |
| Option lists: Foundation's shared ones re-exported, ours beside them; form kinds, office-only lists                                                                                                                                                | `validators/option-lists.ts`                                        |
| The service-side schema of a sheet (built from its definition), the office blocks, residents                                                                                                                                                       | `validators/file-values.ts`                                         |
| What is typed on the screen, to and from the model's units                                                                                                                                                                                         | `validators/file-screen.ts`                                         |
| Pure rules: status ticks, stage moves, registration number, contract terms, what «قديم» copies                                                                                                                                                     | `rules/`                                                            |
| Services: `registerFile`, `saveFileForm`, `moveFileStage` (emits `file.contracted`, `file.termsChanged`, `file.ended`, `site.changed`), `closeFile` (a refused quote; JOB_DONE from Operations ends a signed on-demand job and emits `file.ended`) | `services/files.ts`                                                 |
| For other owners (CONTRACTS.md section 3): `getFileForScheduling`, `getSiteForOrder`, with the field names Operations already reads in its `services/upstream.ts`                                                                                  | `services/exports.ts`                                               |
| Reads: `listFiles`, `getFileHub`, `getFileForm`, `openResidentList`, `openFileSheet`, `recordFileOpened`, `recordFilePrint`                                                                                                                        | `services/file-reads.ts`                                            |
| The handler of `zone.remapped`                                                                                                                                                                                                                     | `events.ts`, `services/sites.ts`                                    |
| One renderer for the six sheets and the residents page                                                                                                                                                                                             | `sheets/file-form-sheet.tsx`                                        |
| What a day's start does: a live contract past «تاريخ النهاية» reaches «انتهاء التعاقد» (EXPIRED, or RENEWED when its successor is signed)                                                                                                          | `daily.ts`, `services/files.ts` (`endExpiredContracts`)             |
| The home tile «عروض أسعار تنتظر المتابعة» (feature 29, `quote.followUp`)                                                                                                                                                                           | `alerts.ts`, `services/alerts.ts`                                   |
| Demo data: seven files through the services, on their own dates (see "Round 2")                                                                                                                                                                    | `demo.ts`                                                           |
| Screens: the list, the new file (with «قديم» and the sanction gate), the hub, the form, the print pages, the empty forms                                                                                                                           | `src/pages/dashboard/files/`                                        |
| «قديم» (feature 40): `findReturningClients`, `getReturningFill`; `registerFile({ returning, notTheSamePerson, decisionId })` runs People's `checkSanction` and spends the manager's yes                                                            | `services/returning.ts`, `services/files.ts`                        |
| «الزيارة الأولية» (feature 3): `getFirstVisits`, `saveFirstVisit`, `removeFirstVisit`, `addFirstVisitPhoto`, `getInspectionSheet`, `recordInspectionPrint`; the sheet «بطاقة المعاينة»                                                             | `services/first-visits.ts`, `sheets/inspection-sheet.tsx`           |
| «الدراسة المالية» (feature 4, behind `cost.read`): `getCostStudy` (logged), `saveCostStudy`; the arithmetic in `rules/pricing.ts`                                                                                                                  | `services/cost-study.ts`                                            |
| «عرض السعر» (features 5, 29): `saveQuote`, `submitQuote`, `decideQuote` (`quote.approve`), `issueQuote`, `reviseQuote`, `cancelQuote`, `recordQuoteResult` (`contract: true` takes the file to «متعاقد»), `addQuoteFollowUp`; the quote sheet      | `services/quotes.ts`, `sheets/quote-sheet.tsx`                      |
| «العقد وتجديده» (feature 6): `getContractPart`, `renewFile` (emits `file.renewed`), `endContract`, `saveFileClauses`; the annex sheet; `countResidents`                                                                                            | `services/contracts.ts`, `sheets/clauses-sheet.tsx`                 |
| «العملاء» (feature 1): `listClients`, `openClientCard` (logged once a day), `saveClientIdentifiers` (RC, NIS, NIF, article, legal form, billing name and address, second phone, e-mail, note)                                                      | `services/clients.ts`, `rules/client-identifiers.ts`                |
| For Money: `getAcceptedQuote`, `getFileEstimate`                                                                                                                                                                                                   | `services/exports.ts`                                               |

Placeholder still: the tab `rep-visits/` (feature 40's rep visits, «زيارات المندوب التجاري»).

## Conventions followed here

- A form is data. The screen, the sheet, the validator and the storage mapping are all drawn from `FORM_DEFINITIONS`; nothing lists his fields a second time. A form writes only the answers it prints.
- Arabic on screen is his wording: labels are checked against the definitions (`messages.test.ts`); options read from the definition in Arabic and from code labels in French and English.
- A save sends only changed columns (`changedColumns`); every write of personal data is logged in the same transaction.
- A signed file (`lockedAt`) prints from `File.partySnapshot`. Changing its sheet needs `file.editLocked` and a typed reason, and changes the snapshot, not the client's record. Office-only answers stay free.
- The residents list needs `residents.read`; every reading and print is logged; removing a line needs a typed reason. Ruling: the first registration of a file carries its list with the section's WRITE level alone, each line a COLLECT.
- The cost study's figures never reach the log (`CostStudy` is withheld); a quote's cost and margin are shown only with `cost.read`, never on its sheet.
- Message files are generated once from the definitions (the script is not in the repository); edit the JSON by hand from now on, and run `messages.test.ts`.

## Rulings received

- Nothing prints over his letterhead or footer pictures.
- Screen wording: his words without the stretching character and the closing colon.
- The office-only work fields (forbidden places, same worker, women only, security text, who receives the service) live once, on the site.
- Money is written one way on screen and on paper: «195.650,00 دج».
- Shared option lists come from `src/lib/options`; the sheet's faces from the print kit's `SHEET_FONT`.
- Save is `success` in `PageActions` at the form's foot, cancel `outline` beside it; a tab page is headed with its tab's label.
- The first registration of a building or a complex carries its residents with WRITE alone (above).

## Decisions of mine to confirm

- A signed file does not go back to an earlier stage (nothing tells Operations and Money to take visits and dues back).
- A contract becomes «متعاقد» once his sheet's terms and the office's amount basis are filled; an on-demand file once its quote is accepted too.
- Name, phone, address and commune are required to register a file (the columns are NOT NULL).
- An accepted quote gives a request on demand its whole total as «المبلغ إجمالي» (basis WHOLE_CONTRACT); a contract takes the quote without its INITIAL_JOB lines (RULINGS 3), the discount off the periodic part.
- Issuing a quote moves a file at «جديد» or «الزيارة» to «عرض سعر»; planning its first visit moves a new file to «الزيارة»; a done first visit writes the form's «تاريخ الزيارة» while the file is unsigned.
- A quote's new version keeps its number; issuing it supersedes the one the client held. An issued quote is never cancelled.
- Buildings' and complexes' first-visit recommendations are the organisations' seven plus the five D8 adds.
- A renewal copies the form with its dates following on (start the day after the old end, end and first due date to type), the clauses too; an early ending needs its kind, a day not after today, and a reason.
- The clauses print as an annex; they are typed until the file is signed. Clause templates (`ClauseTemplate`) have no screen.

## Round 1: done (files end to end)

A file is registered from any of his six forms, saved again, moved through its stages, read for the list, the hub, the form and the printed sheet, and printed from what is stored. Checked at the end of the round: `npx tsc --noEmit` (no error in these paths), `npx eslint` and `npx prettier --check` on these paths (clean), `npx vitest run src/features/clients` (17 files, 159 tests), the whole suite, 97 screenshots in `.harness/shots/clients-r1/` (Arabic and French, light and dark, both sizes; two as the accountant), 12 PDFs in `.harness/pdf/clients-r1/` (stored files 2, 2, 2, 3, 3 pages; residents 1; empty forms 2, 2, 2, 2, 3, 3).

What a reader should know about it:

- Screens follow the reader's level: a role that only reads «طلبات الخدمة» sees no «ملف جديد», no stage move and no save; the services refuse them anyway.
- «متوقف» and «معاقب» are ticked from People's `getSanctionStates` on the sheet and on the form.
- The print pages use the kit's `<PrintButton onPrint>`: the disclosure is logged first, and nothing prints if it cannot be.
- The list reads `?ids=a,b` (exactly those files, for a home tile) and `?stage=QUOTE`.
- Table positions on paper follow the Checker's corrected facts (leading-edge tables −2.7 mm, centred ones −2.6 mm from the right margin): right edges print 7.3 mm from the paper edge, left edges about 10.0 mm (the target is 10.1 to 10.2; the difference is the border's own width).
- Page 1 of the building contract is the fullest page of all: it ends 6 mm above the end of the text area when every answer is one line long.

## Round 2: done (request to contract)

A file goes جديد → الزيارة (its first visit planned, printed, typed in) → عرض سعر (cost study, quote approved by the manager, issued, printed) → متعاقد (the client's yes, which emits `file.contracted`; Operations makes the visits, Money the dues). A returning client is found and filled in («قديم»), and the registration passes People's sanction gate. The clients list and card hold an organisation's RC, NIS and NIF; the hub of an organisation without its RC says so. A contract is renewed or ended early from «العقد وتجديده»; «القاطنون» shows the list to who may read it and its count to anybody.

Demo: `housingRequest` (first visit done, study, quote issued and waiting), `housingJob` and `orgJob` (on demand, quote accepted, «متعاقد», visits on 13, 14 and 15 October), with `…Quote` and `…FirstVisit` names. Pictures in `.harness/shots/clients-r2/`, sheets in `.harness/pdf/clients-r2/`.

## Open

1. «زيارات المندوب التجاري» (`RepVisit`, the tab `rep-visits/`).
2. `getFileBillingTerms`, `getClientForInvoice` (CONTRACTS.md section 3): Money reads the tables directly for now.
3. A screen for `ClauseTemplate`; contacts (`Contact`) on the client card; `claimNumber` for a client number already on paper.

Known gaps in what is built:

- A ticked radio button is given its look in `pages/dashboard/files/_components/sheet-fields.tsx` (`RADIO_CHECKED`): the shared `RadioGroupItem` and `Checkbox` style their ticked state with `data-checked:`, which matches nothing (asked of Foundation).
- A site's zone is set to its commune's zone at every save of an unsigned file; once a site can be put in another zone by hand, the form must stop doing that.
- The quote and inspection sheets follow his client forms' letterhead and faces; he gave no form for either (scope F1).
