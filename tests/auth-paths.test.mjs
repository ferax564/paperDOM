import assert from "node:assert/strict";
import test from "node:test";

import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  safeAuthReturnPath,
} from "../app/auth-paths.ts";

test("keeps a local return path with query and hash", () => {
  assert.equal(safeAuthReturnPath("/documents/42?mode=edit#comments"), "/documents/42?mode=edit#comments");
});

test("rejects absolute, protocol-relative, and backslash-normalized external URLs", () => {
  assert.equal(safeAuthReturnPath("https://example.com/steal"), "/");
  assert.equal(safeAuthReturnPath("//example.com/steal"), "/");
  assert.equal(safeAuthReturnPath("/\\example.com/steal"), "/");
});

test("rejects auth endpoints as return destinations", () => {
  assert.equal(safeAuthReturnPath("/signin-with-chatgpt"), "/");
  assert.equal(safeAuthReturnPath("/signout-with-chatgpt"), "/");
  assert.equal(safeAuthReturnPath("/callback"), "/");
});

test("sign-in and sign-out helpers encode only sanitized paths", () => {
  assert.equal(chatGPTSignInPath("/documents/42?mode=edit"), "/signin-with-chatgpt?return_to=%2Fdocuments%2F42%3Fmode%3Dedit");
  assert.equal(chatGPTSignOutPath("https://example.com"), "/signout-with-chatgpt?return_to=%2F");
});
