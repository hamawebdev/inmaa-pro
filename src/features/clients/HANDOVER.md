# Clients and contracts: handover

For whoever continues this folder. Features 1, 2, 3, 4, 5, 6, 26, 29, 40. Read `CLAUDE.md` and `docs/scope.md` first; this page only says where this owner's work stands.

## What exists

| What                                                                                                                                                     | Where                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| His six forms as data: every label, blank and option in his order, and the tables that carry them on paper. Checked against the Checker's facts          | `forms/definitions/`, `forms/types.ts`, `forms/definitions.test.ts` |
| What a sheet says about a file (`FormValues`, in the data model's units) and how a row reads it (ticks, blanks, dates, amounts)                          | `forms/values.ts`, `forms/answers.ts`                               |
| Where each answer is kept (`Client`, `Site`, `File`, `FileDescription`, `FileService`, `Resident`) and the way back; the party snapshot of a signed file | `forms/stored-values.ts`                                            |
| The cards and label keys of the form screen                                                                                                              | `forms/screen-labels.ts`                                            |
| Option lists: Foundation's shared ones re-exported, ours beside them; form kinds, office-only lists                                                      | `validators/option-lists.ts`                                        |
| The service-side schema of a sheet (built from its definition), the office blocks, residents                                                             | `validators/file-values.ts`                                         |
| What is typed on the screen, to and from the model's units                                                                                               | `validators/file-screen.ts`                                         |
| Pure rules: status ticks, stage moves, registration number, contract terms, what «قديم» copies                                                           | `rules/`                                                            |
| Services: `registerFile`, `saveFileForm`, `moveFileStage` (emits `file.contracted`, `file.termsChanged`, `file.ended`, `site.changed`)                   | `services/files.ts`                                                 |
| Reads: `listFiles`, `getFileHub`, `getFileForm`, `openResidentList`, `openFileSheet`, `recordFileOpened`, `recordFilePrint`                              | `services/file-reads.ts`                                            |
| The handler of `zone.remapped`                                                                                                                           | `events.ts`, `services/sites.ts`                                    |
| One renderer for the six sheets and the residents page                                                                                                   | `sheets/file-form-sheet.tsx`                                        |
| Demo data: five files through the services, on their own dates                                                                                           | `demo.ts`                                                           |
| Screens: the list, the new file, the hub, the form, the two print pages, the empty forms                                                                 | `src/pages/dashboard/files/`                                        |

Placeholders still: the parts `inspection`, `financial-study`, `quote`, `contract`, `residents`; the tabs `clients/` and `rep-visits/`.

## Conventions followed here

- A form is data. The screen, the sheet, the validator and the storage mapping are all drawn from `FORM_DEFINITIONS`; nothing lists his fields a second time. A form writes only the answers it prints.
- Arabic on screen is his wording: labels are checked against the definitions (`messages.test.ts`); options read from the definition in Arabic and from code labels in French and English.
- A save sends only changed columns (`changedColumns`); every write of personal data is logged in the same transaction.
- A signed file (`lockedAt`) prints from `File.partySnapshot`. Changing its sheet needs `file.editLocked` and a typed reason, and changes the snapshot, not the client's record. Office-only answers stay free.
- The residents list needs `residents.read`; every reading and print is logged; removing a line needs a typed reason.
- Message files are generated once from the definitions (the script is not in the repository); edit the JSON by hand from now on, and run `messages.test.ts`.

## Rulings received

- Nothing prints over his letterhead or footer pictures.
- Screen wording: his words without the stretching character and the closing colon.
- The office-only work fields (forbidden places, same worker, women only, security text, who receives the service) live once, on the site.
- Money is written one way on screen and on paper: «195.650,00 دج».
- Shared option lists come from `src/lib/options`; the sheet's faces from the print kit's `SHEET_FONT`.

## Decisions of mine to confirm

- A signed file does not go back to an earlier stage (nothing tells Operations and Money to take visits and dues back).
- A contract becomes «متعاقد» once his sheet's terms and the office's amount basis are filled; an on-demand file once its quote is accepted too.
- Name, phone, address and commune are required to register a file (the columns are NOT NULL).

## Open (end of round 1)

Not built yet, in the order planned:

1. Round 2: «العملاء» list and the client card (contacts, sites, tax identifiers, sanction chip); the «قديم» dialog (`rules/returning-client.ts` has the copy rules) with People's `checkSanction` / `SanctionGate` before a registration; the part «القاطنون» (office columns: apartment, building, left date); the list's `?ids=` view for Money's contract-ending tile.
2. Then: «الزيارة الأولية», «الدراسة المالية», «عرض السعر» (an on-demand file cannot reach «متعاقد» before its quote is accepted), «العقد وتجديده» (`closeFile`, `endContract`, `renewFile`, the day-start ending at `endDate`), «زيارات المندوب التجاري».
3. The read functions CONTRACTS.md section 3 names for other owners (`getFileForScheduling`, `getSiteForOrder`, `getFileBillingTerms`, `getClientForInvoice`, `getFileEstimate`, `getAcceptedQuote`): Operations and Money read the tables directly for now.

Known gaps in what is built:

- «متوقف» and «معاقب» are never ticked: they wait for People's `getSanctionStates` (`services/file-reads.ts`, `openFileSheet`; the form page passes "NONE").
- The print pages use their own button (`pages/dashboard/files/_components/logged-print-button.tsx`) because the kit's `PrintButton` has no hook to log the disclosure first.
- A ticked radio button is given its look in `sheet-fields.tsx` (`RADIO_CHECKED`): the shared `RadioGroupItem` and `Checkbox` style their ticked state with `data-checked:`, which matches nothing.
- The client's number («رقم الملف») is always given by the program; a number already on paper (`claimNumber`, capability `file.setNumber`) has no field yet.
- A site's zone is set to its commune's zone at every save of an unsigned file; once a site can be put in another zone by hand, the form must stop doing that.

Needed from others: see the last report to the coordinator.
