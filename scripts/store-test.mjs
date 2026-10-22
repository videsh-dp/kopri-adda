// Unit tests for the pure multi-Kopri store (no browser needed).
// Run with:  npm run test:store
import { seedRoot, rootReducer, migrateRoot, activeBook } from "../src/state/kopriStore.js";

let failures = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// 1. seed -> one demo kopri
let root = seedRoot();
ok("seeded with one demo Kopri", root.kopris.length === 1 && activeBook(root).members.length === 8);

// 2. add a second (empty) Kopri -> becomes active
root = rootReducer(root, { type: "ADD_KOPRI", name: "Mapusa Welfare Kopri", template: "empty" });
ok("second Kopri added & active", root.kopris.length === 2 && activeBook(root).name === "Mapusa Welfare Kopri" && activeBook(root).members.length === 0);

// 3. add a member + opening contribution to active Kopri
root = rootReducer(root, { type: "ADD_MEMBER", member: { name: "Test Member" }, openingContribution: 25000 });
ok("member + contribution event added to active book", activeBook(root).members.length === 1 && activeBook(root).events.length === 1);

// 4. switch back to demo Kopri -> data is isolated
const demoId = root.kopris.find((k) => k.name === "Sunrise Kopri").id;
root = rootReducer(root, { type: "SET_ACTIVE_KOPRI", id: demoId });
ok("switching back isolates data (8 demo members, no Test Member)", activeBook(root).members.length === 8 && !activeBook(root).members.some((m) => m.name === "Test Member"));
ok("other book keeps its own member", root.kopris.find((k) => k.name === "Mapusa Welfare Kopri").members.length === 1);

// 5. rename syncs name + rules.kopriName
root = rootReducer(root, { type: "RENAME_KOPRI", id: demoId, name: "Sunrise Kopri Fund" });
const renamed = root.kopris.find((k) => k.id === demoId);
ok("rename updates book + rules", renamed.name === "Sunrise Kopri Fund" && renamed.rules.kopriName === "Sunrise Kopri Fund");

// 6. deleting the active Kopri auto-switches to another
root = rootReducer(root, { type: "DELETE_KOPRI", id: demoId });
ok("delete active auto-switches", root.kopris.length === 1 && activeBook(root).name === "Mapusa Welfare Kopri");

// 7. cannot delete the last Kopri
const only = activeBook(root).id;
root = rootReducer(root, { type: "DELETE_KOPRI", id: only });
ok("guard: last Kopri cannot be deleted", root.kopris.length === 1);

// 8. legacy v1 single-Kopri state migrates into root shape
const legacy = {
  version: 1,
  settings: { theme: "dark" },
  rules: { kopriName: "Old Kopri", reserveRate: 10 },
  members: [{ id: "m1", name: "A" }],
  loans: [],
  events: [{ id: "e1", type: "MEMBER_CONTRIBUTION", memberId: "m1", amount: 100 }],
  yearEnds: [],
};
const migrated = migrateRoot(legacy);
ok("v1 migrates to one named Kopri", migrated.kopris.length === 1 && migrated.kopris[0].name === "Old Kopri");
ok("migration keeps theme + active id", migrated.settings.theme === "dark" && migrated.kopris[0].id === migrated.activeKopriId);

// 9. root round-trips through migrateRoot unchanged
ok("root round-trip stable", migrateRoot(migrated).activeKopriId === migrated.activeKopriId);

// 10. theme is global across all Kopris
root = rootReducer(root, { type: "SET_THEME", theme: "dark" });
ok("theme is global", root.settings.theme === "dark");

// 11. null/empty roots are rejected by migration
ok("malformed roots rejected", migrateRoot(null) === null && migrateRoot({ kopris: [] }) === null);

// 12. managers: each gets their own fresh Kopri; usernames are unique
let r2 = seedRoot();
r2 = rootReducer(r2, { type: "ADD_MANAGER", name: "Anthony", username: "anthony", password: "pw1", kopriName: "Mapusa Kopri" });
const mgr = r2.managers[0];
const mBook = r2.kopris.find((k) => k.id === mgr.kopriId);
ok("manager created with a fresh empty Kopri", r2.managers.length === 1 && mBook.name === "Mapusa Kopri" && mBook.members.length === 0 && mBook.events.length === 0);
ok("duplicate username (any case) rejected", rootReducer(r2, { type: "ADD_MANAGER", name: "X", username: "ANTHONY", password: "z" }).managers.length === 1);
ok("blank password rejected", rootReducer(r2, { type: "ADD_MANAGER", name: "X", username: "bob", password: "" }).managers.length === 1);
ok("manager's Kopri can't be deleted on its own", rootReducer(r2, { type: "DELETE_KOPRI", id: mgr.kopriId }).kopris.length === 2);
r2 = rootReducer(r2, { type: "UPDATE_MANAGER", id: mgr.id, patch: { password: "pw2" } });
ok("password reset", r2.managers[0].password === "pw2");

// 13. actions pinned to a Kopri don't touch the others
const adminId = r2.kopris.find((k) => k.id !== mgr.kopriId).id;
r2 = rootReducer(r2, { type: "ADD_MEMBER", kopriId: mgr.kopriId, member: { name: "Only Mine" } });
ok("kopriId-pinned action lands in the manager's Kopri only",
  r2.kopris.find((k) => k.id === mgr.kopriId).members.length === 1 && !r2.kopris.find((k) => k.id === adminId).members.some((m) => m.name === "Only Mine"));

// 14. clear a Kopri / clear demo data
const emptied = rootReducer(r2, { type: "RESET_KOPRI_EMPTY", id: mgr.kopriId });
ok("clearing a Kopri empties it but keeps name + rules", emptied.kopris.find((k) => k.id === mgr.kopriId).members.length === 0 && emptied.kopris.find((k) => k.id === mgr.kopriId).name === "Mapusa Kopri");
const wiped = rootReducer(r2, { type: "WIPE_ALL" });
ok("clear demo data drops the sample Kopri, keeps managers + their Kopris",
  wiped.managers.length === 1 && wiped.kopris.length === 2 && !wiped.kopris.some((k) => k.name === "Sunrise Kopri") && wiped.kopris.find((k) => k.id === mgr.kopriId).members.length === 1);
ok("wiped admin Kopri starts empty", wiped.kopris.find((k) => k.id === wiped.activeKopriId).members.length === 0);

// 15. deleting a manager removes their Kopri; managers survive a save/load
const del = rootReducer(r2, { type: "DELETE_MANAGER", id: mgr.id, deleteKopri: true });
ok("deleting a manager removes their Kopri", del.managers.length === 0 && del.kopris.length === 1);
ok("managers survive migrateRoot", migrateRoot(JSON.parse(JSON.stringify(r2))).managers.length === 1);

console.log(failures === 0 ? "\nALL STORE TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);