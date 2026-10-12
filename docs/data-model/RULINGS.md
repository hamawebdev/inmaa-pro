# Coordinator's rulings on RULINGS-NEEDED.md (revision 2)

Given on 2026-10-12. Item numbers are those of RULINGS-NEEDED.md. "Default" means the default that the revision already builds in.

## A. Before the builders start

1. Wages in expenses: default. An expense is money out, posted on the day of each payout and split by the payslip's minutes per division; the payout that completes a payslip posts its contributions. Closing a run posts nothing.
2. A renewal is a new file: default.
3. A first deep clean followed by a periodic contract: default. One file; the contract's amount is the periodic part; one extra due of kind INITIAL_JOB from the accepted quote; one visit of origin INITIAL.
4. Numbers that already exist on paper: default (typed numbers behind a capability, counters that can start from a setting, an opening gap declared once for invoices and receipts).
5. The merged tables: confirmed as merged.
6. The wilaya list has **69** entries, not 58. Checked on the web on 2026-10-12: the Council of Ministers created eleven wilayas on 16 November 2025. Numbers as reported in the press (not yet checked against the Journal officiel): 59 أفلو Aflou, 60 الأبيض سيدي الشيخ El Abiodh Sidi Cheikh, 61 العريشة El Aricha, 62 القنطرة El Kantara, 63 بريكة Barika, 64 بوسعادة Bou Saâda, 65 بئر العاتر Bir El Ater, 66 قصر البخاري Ksar El Boukhari, 67 قصر الشلالة Ksar Chellala, 68 عين وسارة Aïn Oussara, 69 مسعد Messaad. Keep the list as a data file with a comment saying where it came from.
7. A client's «متوقف / معاقب» lives only in People's Sanction rows: default.
8. "Buildings and complexes are contract only" and "a pay run is monthly" are validator rules, not database constraints: default.
9. Contacts keep their five flags: default, with the stated rule for who is the person on site.
10. A worker's zone is People's column, changed from Operations' screen through the exported function: default.
11. A worker who leaves or is sanctioned loses her future seats at once and those visits return to «بانتظار التأكيد»: default.
12. A sanctioned client with visits already planned: default (visits stay; orders need a release unless the manager's yes covered that sanction).
13. Leave and absence: all four defaults.
14. Which minutes count when a typed order has no work times: default.
15. Closing an on-demand file: default (Operations closes it in the same transaction when its last visit is done and nothing is open).
16. Seats a payslip paid (PayslipSeat): default.

## B. Settled by default

17 to 22: accepted as written. 23: each owner writes the Arabic, French and English for its own code lists as it builds the screens that show them; wording follows the client's documents where he has a word.

## C. For the developer (ruled by the coordinator under the approved scope)

24. Foundation's first job is the Rust test on the shipped SQLite.
25. Pool options and connect-time pragmas as BUILD-NOTES section 1: required.
26. The two database commands accept one statement from the allow-list; only migrations change the schema: required.
27. The clock guards: default.
28. A second PC: default (empty legal series). One PC is the decision in force.
29. How far the log records consultations: default.
30. Erasure against ten-year keeping: default (nothing erased; the columns exist for later).
31. Printing a filled worker form needs the capability and a typed reason, and is logged: default.
32. Seven seeded roles and the default matrix: default.

## D. For the client or his accountant

33 to 45: the defaults stand and every one of them is a setting or a seed row. The coordinator passes these questions to the developer; nothing waits for the answers. 43 (the communes of أم البواقي, written from memory) stays flagged as unverified until checked against an official list.

## E. Notes

46 to 48: no objection. 47 matters to every builder: a save sends only the columns that changed.
