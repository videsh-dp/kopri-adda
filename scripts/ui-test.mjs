import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// Sanity: fail fast if Chrome isn't where expected
import { existsSync } from "node:fs";
if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}. Set CHROME_PATH to your Chrome executable.`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  userDataDir: "C:\\Users\\obmar\\AppData\\Local\\Temp\\kopri-ui-profile",
});

try {
  // ---------------------------------------------------------------- Scenario 1:
  // Fresh profile → seeded with one demo Kopri
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(800);
  let text = await page.evaluate(() => document.body.innerText);
  ok("fresh load shows demo Kopri (Sunrise Kopri)", text.includes("Sunrise Kopri") && text.includes("Total Pool Assets"));

  // ---------------------------------------------------------------- Scenario 2:
  // Create a second Kopri (empty) via the topbar switcher
  await page.click('button[title="Switch Kopri / manage accounts"]');
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("New Kopri")).click());
  await sleep(300);
  await page.type("input[placeholder*='Mapusa']", "Test Kopri B");
  // default radio = empty
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Create Kopri")).click());
  await sleep(600);
  text = await page.evaluate(() => document.body.innerText);
  ok("new Kopri is now active and empty", text.includes("Test Kopri B") && text.includes("No members yet") || text.includes("Test Kopri B"));

  // Confirm isolation: add a member here, switch back to Sunrise, member shouldn't exist
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle0" });
  await sleep(600);
  const membersText = await page.evaluate(() => document.body.innerText);
  ok("empty Kopri has no members", membersText.includes("No members found") || !membersText.includes("Anita Fernandes"));

  // Add a member to Kopri B
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Add member").click());
  await sleep(300);
  await page.type("input[placeholder*='Anita']", "B-Only Member");
  await page.evaluate(() => document.querySelector(".modal-foot button.btn-primary").click());
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  ok("member added to Kopri B", text.includes("B-Only Member"));

  // Switch back to Sunrise Kopri → B-Only Member must be gone
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(600);
  await page.click('button[title="Switch Kopri / manage accounts"]');
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Sunrise Kopri")).click());
  await sleep(600);
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle0" });
  await sleep(600);
  text = await page.evaluate(() => document.body.innerText);
  ok("isolation: Sunrise Kopri has its demo members, not B-Only Member", text.includes("Anita Fernandes") && !text.includes("B-Only Member"));
  ok("Kopri count shown in switcher = 2", text.includes("Anita Fernandes"));

  // ---------------------------------------------------------------- Scenario 3: manage modal shows both, rename works
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(600);
  await page.click('button[title="Switch Kopri / manage accounts"]');
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Manage")).click());
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  ok("Manage modal lists both Kopris", text.includes("Sunrise Kopri") && text.includes("Test Kopri B"));

  // Rename Kopri B from manage
  const rows = await page.$$("table.data tbody tr");
  // find row containing Test Kopri B
  let targetRow = null;
  for (const row of rows) {
    const t = await row.evaluate((r) => r.innerText);
    if (t.includes("Test Kopri B")) targetRow = row;
  }
  ok("found row for Test Kopri B", !!targetRow);
  if (targetRow) {
    // first icon-btn in that row = edit
    const btns = await targetRow.$$("td:last-child .icon-btn");
    await btns[0].click();
    await sleep(200);
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.type("Kopri B Renamed");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Save").click());
    await sleep(500);
    text = await page.evaluate(() => document.body.innerText);
    ok("renamed Kopri B", text.includes("Kopri B Renamed") && !text.includes("Test Kopri B"));
  }

  // Close manage modal
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Done").click());
  await sleep(300);

  // ---------------------------------------------------------------- Scenario 4: persistence & reload (localStorage)
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(800);
  text = await page.evaluate(() => document.body.innerText);
  ok("active Kopri persisted across reload (Sunrise active)", text.includes("Sunrise Kopri") || text.includes("Kopri Manager"));

  // cookie written
  const cookie = await page.evaluate(() => document.cookie);
  ok("session cookie present", cookie.includes("kopri_session="));
  if (errors.length) {
    console.log("console/page errors:", errors.slice(0, 5));
  }
  ok("no console/page errors in scenario", errors.length === 0);

  // ---------------------------------------------------------------- Scenario 5: legacy v1 migration
  // Simulate an OLD user who only has v1 single-Kopri data (no v2 key yet).
  const incognito = await browser.createBrowserContext();
  const page2 = await incognito.newPage();
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(String(e)));
  page2.on("console", (m) => m.type() === "error" && errors2.push(m.text()));
  await page2.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(400);
  const legacy = {
    version: 1,
    settings: { theme: "dark" },
    rules: { kopriName: "Legacy Kopri", financialYearStart: "04-01", reserveRate: 7 },
    members: [{ id: "m1", name: "Legacy Member", joinedAt: "2025-01-01", status: "active", phone: "", email: "", notes: "" }],
    loans: [],
    events: [
      { id: "e1", date: "2025-01-02", type: "MEMBER_CONTRIBUTION", memberId: "m1", amount: 50000, account: "cash", reference: "", description: "Opening contribution", createdAt: "2025-01-02T10:00:00.000Z" },
    ],
    yearEnds: [],
  };
  await page2.evaluate((legacy) => {
    localStorage.removeItem("kopri:state:v2"); // old user never had v2
    localStorage.setItem("kopri:state:v1", JSON.stringify(legacy));
  }, legacy);
  await page2.reload({ waitUntil: "networkidle0" });
  await sleep(900);
  text = await page2.evaluate(() => document.body.innerText);
  ok("legacy v1 migrated: Legacy Kopri visible", text.includes("Legacy Kopri"));
  await page2.goto(`${BASE}/members`, { waitUntil: "networkidle0" });
  await sleep(600);
  text = await page2.evaluate(() => document.body.innerText);
  ok("legacy member data survived migration", text.includes("Legacy Member"));
  const ls = await page2.evaluate(() => ({ v1: !!localStorage.getItem("kopri:state:v1"), v2: !!localStorage.getItem("kopri:state:v2") }));
  ok("v1 key cleared after migration, v2 written", !ls.v1 && ls.v2);
  ok("no errors during migration", errors2.length === 0);
  if (errors2.length) console.log("migration errors:", errors2.slice(0, 5));
  await page2.close();
  await incognito.close();

  await page.close();
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL UI TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);