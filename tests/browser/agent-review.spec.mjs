import { test, expect } from "@playwright/test";

const readDocument = (page) => page.evaluate(() => window.paperdom.getDocument());
const proposal = (revision, text = "Reviewed architecture") => ({
  expectedRevision: revision, description: "Clarify the title", actor: { id: "test", name: "Design assistant", type: "agent" },
  operations: [{ op: "replaceText", pageId: "page_architecture", elementId: "title_arch", text }],
});
const title = (document) => document.pages[0].elements.find((element) => element.id === "title_arch").content.text;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Boolean(window.paperdom))).toBe(true);
  await expect(page.locator(".revision-pill")).toContainText("14");
});

test("review previews without mutation, accepts, and supports undo/redo", async ({ page }) => {
  const before = await readDocument(page);
  await page.getByRole("button", { name: "Review changes", exact: true }).click();
  await page.getByLabel("Transaction JSON").fill(JSON.stringify(proposal(before.revision)));
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review proposed changes" });
  await expect(dialog.getByText("Before", { exact: true })).toBeVisible();
  await expect(dialog.getByText("After", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Reviewed architecture", { exact: true })).toBeVisible();
  expect(await readDocument(page)).toEqual(before);
  await page.getByRole("button", { name: "Accept changes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(title(await readDocument(page))).toBe("Reviewed architecture");
  await page.getByTitle("Undo", { exact: true }).click();
  expect(title(await readDocument(page))).toBe(title(before));
  await page.getByTitle("Redo", { exact: true }).click();
  expect(title(await readDocument(page))).toBe("Reviewed architecture");
});

test("reject and Escape preserve document and restore focus", async ({ page }) => {
  const before = await readDocument(page);
  const open = page.getByRole("button", { name: "Review changes", exact: true });
  await open.click();
  await page.getByLabel("Transaction JSON").fill(JSON.stringify(proposal(before.revision)));
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await page.getByRole("button", { name: "Reject / close", exact: true }).click();
  expect(await readDocument(page)).toEqual(before);
  await open.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(open).toBeFocused();
  expect(await readDocument(page)).toEqual(before);
});

test("invalid proposals and stale previews cannot commit", async ({ page }) => {
  const before = await readDocument(page);
  await page.getByRole("button", { name: "Review changes", exact: true }).click();
  await page.getByLabel("Transaction JSON").fill('{"operations":[]}');
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("non-empty");
  await expect(page.getByRole("button", { name: "Accept changes", exact: true })).toBeDisabled();
  await page.getByLabel("Transaction JSON").fill(JSON.stringify(proposal(before.revision)));
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await page.evaluate((payload) => window.paperdom.transaction(payload), proposal(before.revision, "Concurrent edit"));
  await expect(page.getByRole("alert")).toContainText("document changed");
  await expect(page.getByRole("button", { name: "Accept changes", exact: true })).toBeDisabled();
  expect(title(await readDocument(page))).toBe("Concurrent edit");
});

test("back-to-back API transactions retain individual undo states and fresh scene reads", async ({ page }) => {
  const before = await readDocument(page);
  const result = await page.evaluate((payload) => {
    const api = window.paperdom;
    const first = api.transaction(payload);
    const scene = api.sceneSummary();
    const second = api.transaction({ ...payload, expectedRevision: first.revision, operations: [{ ...payload.operations[0], text: "Second change" }] });
    return { first, second, scene };
  }, proposal(before.revision, "First change"));
  expect(result.first.ok).toBe(true);
  expect(result.second.ok).toBe(true);
  expect(result.scene.elements.find((element) => element.id === "title_arch").text).toBe("First change");
  await page.getByTitle("Undo", { exact: true }).click();
  expect(title(await readDocument(page))).toBe("First change");
  await page.getByTitle("Undo", { exact: true }).click();
  expect(title(await readDocument(page))).toBe(title(before));
});

test("page commands add, duplicate, reorder, delete, and persist", async ({ page }) => {
  const before = await readDocument(page);
  await page.getByRole("button", { name: "Add page", exact: true }).first().click();
  await expect(page.locator(".page-item")).toHaveCount(before.pages.length + 1);
  await page.locator(".page-item.active").getByTitle("Duplicate", { exact: true }).click();
  await expect(page.locator(".page-item")).toHaveCount(before.pages.length + 2);
  const pages = page.locator(".page-item");
  const copy = (await readDocument(page)).pages.at(-1).id;
  await pages.last().dragTo(pages.first());
  await expect.poll(async () => (await readDocument(page)).pages[0].id).toBe(copy);
  await page.locator(".page-item.active").getByTitle("Delete", { exact: true }).click();
  await expect(page.locator(".page-item")).toHaveCount(before.pages.length + 1);
  const expected = await readDocument(page);
  await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem(`paperdom:${id}`) ?? "null")?.revision, expected.id)).toBe(expected.revision);
  await page.reload();
  await expect.poll(async () => (await readDocument(page)).pages.map((page) => page.id)).toEqual(expected.pages.map((page) => page.id));
});

test("propose opens notes review without committing and isolates returned values", async ({ page }) => {
  const before = await readDocument(page);
  await page.evaluate(() => {
    const result = window.paperdom.propose({ description: "Add presenter guidance", operations: [{ op: "patchPage", pageId: "page_architecture", patch: { notes: "Explain each boundary." } }] });
    result.payload.operations[0].patch.notes = "Tampered";
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Notes: Explain each boundary.", { exact: true })).toBeVisible();
  expect(await readDocument(page)).toEqual(before);
  await page.getByRole("button", { name: "Accept changes", exact: true }).click();
  expect((await readDocument(page)).pages[0].notes).toBe("Explain each boundary.");
});
