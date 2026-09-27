// localStorage keys. The stored strings are unchanged from v1, so existing values survive updates.
export const ACTIVE_SESSION = 'activeSessionId';
export const LAST_BACKUP = 'lastExport';
// v1 only: marked the starter routines as seeded. Retired in v2 (seeding happens on a fresh
// install); boot and Erase-all remove it.
export const LEGACY_STARTER_SEEDED = 'starterRoutinesSeeded';
