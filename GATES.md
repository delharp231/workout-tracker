# GATES — manual QA before every deploy

Run `npm test` (node --test) first; it must pass. Then walk this checklist in the
browser preview (mobile viewport). A deploy is allowed only when every box is checked.

## Automated
- [ ] `node --test` passes (schema, exporter, importer).

## Storage & first run
- [ ] (Task 5b) Fresh load creates the DB; second load reuses it (data persists).

## (checklist items are appended by later tasks)
