# Phase 10 Invoice Regression Checklist

1. Invoice number is sequential and unique in the same financial year.
2. Same-state invoice uses CGST + SGST only.
3. Different-state invoice uses IGST only.
4. Generated invoice is locked and re-generation returns the same invoice.
5. Duplicate payment webhook does not create a second invoice.
6. Custom invoice fields appear in generated invoice snapshot.
7. Round-off value on invoice matches order round-off.
