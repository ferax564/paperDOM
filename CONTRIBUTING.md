# Contributing to PaperDOM

## Development

Requirements are Node.js 22.13 or newer and Linux for the bundled verified-build scripts.

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm run audit:prod
npm test
```

## Change expectations

- Keep the JSON document model deterministic and backward-compatible within version 0.1.
- Put state-independent behavior in a pure module and add Node tests.
- Add browser-level coverage when changing pointer, keyboard, contenteditable, persistence, clipboard, or drag-and-drop behavior.
- Preserve stable element IDs and atomic revision semantics.
- Update the document-format and agent-API guides when their contracts change.
- Do not commit secrets, local environment files, build output, or browser storage exports containing private content.

## Pull requests

Explain what changed, why, user-visible impact, migration implications, and the checks run. Keep unrelated refactors separate from behavior changes.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
