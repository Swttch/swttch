# Contributing to Swttch (ex - Claude Code with GUI)

Thank you for your interest in contributing! This guide will help you get started.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Architecture](#project-architecture)
- [Development Setup](#development-setup)
- [Build Commands](#build-commands)
- [Build-time Environment Injection](docs/build-env-injection.md)
- [Development Workflow](#development-workflow)
- [Working on Issues](#working-on-issues)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [AI-assisted Contributions](#ai-assisted-contributions)
- [License](#license)

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | >= 22.13 | Required for backend and webview development |
| **pnpm** | 11.17.0 | Package manager, pinned by `packageManager` in `package.json` (`npm install -g pnpm@11.17.0`) |
| **JDK** | 21 | Required for Kotlin plugin build |
| **Claude Code CLI** | >= 1.0.0 | Must be installed and authenticated (`claude --version`) |

## Project Architecture

The plugin consists of three layers:

```
swttch/
├── backend/         # Node.js + TypeScript — WebSocket server, Claude CLI runner
├── webview/         # React + Vite + Tailwind — Chat UI (runs in the IDE's JCEF or a normal browser)
├── src/             # Kotlin — JetBrains plugin shell (spawns Node.js, native IDE APIs)
└── cli/             # `swttch` command — runs the same product without an IDE
```

**Data flow:**

```
JetBrains IDE (Kotlin)
  └─ spawns Node.js backend (WebSocket server)
       └─ runs Claude Code CLI
       └─ serves WebView UI via WebSocket
```

- **Backend** is the only backend. All business logic (sessions, settings, CLI execution, file I/O) lives here.
- **WebView** is a pure client. It communicates with the backend over WebSocket, never directly with Kotlin.
- **Kotlin** is the IDE shell. It spawns the Node.js process and provides native IDE APIs (editor tabs, diff viewer) via a Bridge interface.

The product runs in two modes, and both are real product environments: **JetBrains mode**
(the IDE starts the backend) and **Standalone mode** (`swttch browser` starts the backend
and you use it in a normal browser). See [cli/README.md](cli/README.md).

## Development Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/Swttch/swttch.git
cd swttch

# Install backend dependencies
bash ./scripts/build.sh be-install

# Install webview dependencies
bash ./scripts/build.sh wv-install
```

### 2. Run in development mode

**Option A: Full plugin (in a sandboxed IDE)**

```bash
bash ./scripts/build.sh all
```

This builds everything and launches a sandboxed JetBrains IDE with the plugin loaded.

**Option B: WebView only (in browser)**

```bash
# Terminal 1: Start the backend dev server
bash ./scripts/build.sh be-dev

# Terminal 2: Start the webview dev server
bash ./scripts/build.sh wv-dev
```

Open the URL shown by Vite (usually `http://localhost:5173`). This runs the full product in the browser — it is not a mock environment.

### 3. Verify your setup

```bash
# Run webview tests
bash ./scripts/build.sh wv-test

# Run backend tests
bash ./scripts/build.sh be-test

# Type-check backend
bash ./scripts/build.sh be-lint

# Type-check webview
bash ./scripts/build.sh wv-lint

# Full plugin build
bash ./scripts/build.sh build
```

## Build Commands

All builds go through `bash ./scripts/build.sh`. Do **not** run `cd`, `pnpm`, or `./gradlew` directly.

Run `bash ./scripts/build.sh -h` for the full list. Key commands:

| Command | What it does |
|---------|-------------|
| `be-install` / `wv-install` | Install dependencies |
| `be-build` / `wv-build` | Build backend / webview |
| `be-lint` / `wv-lint` | Type-check backend / webview |
| `wv-test` | Run webview tests |
| `be-test` | Run backend tests |
| `test` | Run Kotlin tests |
| `cli-test` | Run the `swttch` command tests (bats) |
| `build` | Build the Gradle plugin |
| `full-build` | Build all three layers |
| `dist` | Build the distributable plugin zip |
| `verify-plugin` | Run the JetBrains Plugin Verifier |
| `run-ide` | Launch sandboxed IDE |
| `all` | Full build + launch IDE |
| `clear-cache` | Clean all build artifacts |

## Development Workflow

### Browser-first development

For UI and backend work, develop in the browser (`be-dev` + `wv-dev`). This gives you:
- Hot module replacement for instant feedback
- Browser DevTools for debugging
- No need to rebuild the Kotlin plugin on every change

Only switch to `run-ide` when you need to test IDE-specific features (editor tabs, diff viewer, native dialogs).

### Running tests

```bash
# WebView unit tests
bash ./scripts/build.sh wv-test

# Watch mode (re-runs on file change)
bash ./scripts/build.sh wv-test-watch
```

## Working on Issues

Every change starts from an issue. Open an issue (or find an existing one) before you
start working on it. For new features or large changes, **discuss them in the issue**
before writing code.

### Taking an issue

An issue with an assignee is considered **in progress**. When you start working, please
assign yourself, so that nobody else does the same work.

| Comment on the issue | What happens |
|----------------------|--------------|
| `/assign` | You become the assignee. If the issue already has one, nothing changes and you get a reply. |
| `/unassign` | You give the issue back. It only removes you. |

Write the command as the first line of your comment. It works on open issues only. A 👍
reaction on your comment means it was applied.

### Stalled work

When an issue stays assigned for a long time without being resolved, the maintainer asks
about it in a comment, at a time when they can work on it themselves, and waits at least
one day for a reply.

In the following cases, however, the maintainer may change the assignee right away and do
the work:

- No reply for more than one day
- The fix is simple
- A patch is urgently needed

## Code Style

Most of the principles and direction that matter when working together are recorded in
files tracked by this repository:

- Agent instruction documents ([CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), and others)
- Comments in the codebase
- Skills (`.claude/skills/`), among others

### General

- **Language**: All code, comments, variable names, and commit messages must be in **English**.
- **Exports**: Use named exports. No `export default`.
- **Barrel files** (`index.ts`): Use `export * from './foo'` (wildcard re-export).

### React / TypeScript (WebView)

**Props declaration:**

```tsx
interface Props {
  className?: string;
}

export const MyComponent = (props: Props) => {
  const { className } = props;
  // ...
};
```

- Interface name is always `Props`
- Parameter is always `props: Props` (no destructuring in the signature)
- Destructure at the top of the component body

**Styling:** Use Tailwind CSS classes. No inline `style={{}}`.

**Domain models:** Use `class` (not `interface`) for domain objects. Convert plain objects to class instances at system boundaries with `plainToInstance()`.

**File size:** If a component file exceeds ~100 lines, extract it into a folder:

```
MyComponent/
├── index.tsx        # Main component (named export matching folder name)
├── SubPart.tsx      # Extracted sub-component
└── types.ts         # Shared types
```

### Commit Messages

- Written in **English**
- Follow conventional style: `fix:`, `feat:`, `refactor:`, `docs:`, `chore:`, etc.
- Keep the first line under 72 characters

## Core Principles

These principles are non-negotiable and take priority over convenience. See
[CLAUDE.md](CLAUDE.md) for the full rationale.

- **CLI equivalence & no official-SDK dependency.** Anything a user can do from
  the `claude` CLI must be doable from the GUI, and features must be built on the
  public CLI contract — never on the official SDK library or undocumented internal
  protocols. Reference apps (Cursor, etc.) are copied for their **UX only**, not
  for their internal implementation means.
- **Preserve original data structures.** Claude Code's original data (JSONL
  entries, session metadata) must reach the WebView with its per-entry structure
  unedited: no field renaming, no dropping fields the current UI doesn't use.
  Range-splitting (pagination / active-chain view) is allowed as long as each
  entry stays structurally intact and the full data remains reachable.
- **Consistent naming.** The same action uses the same verb everywhere (method,
  IPC message type, handler). All IPC message `type`s use the `MessageType` enum
  (mirrored in `webview/src/shared` ↔ `backend/src/shared`), never plain string
  literals.
- **The Bridge is the only path between an environment and the backend.** Everything
  between a host environment (JetBrains, a browser) and the backend goes through the
  Bridge, in both directions, and every Bridge implementation provides every feature of
  the interface. A no-op is right only for something that exists inside an IDE alone.

## Submitting Changes

### Pull request process

Every pull request is cross-checked and reviewed by the maintainer. Please **allow edits
by maintainers** on your pull request, so the maintainer can push commits to it and edit
its description. The repository ships a
[PR checklist skill](.claude/skills/pr-checklist/SKILL.md); following it as far as you
can is recommended.

1. Fork the repository and create a branch from `main`
2. Make your changes following the code style and core principles above
   - **Add tests with your change.** Development here is test-first: write the test,
     see it fail, then implement.
   - **Translate every new UI string into all locales** under
     `webview/src/i18n/locales/` (12 today). A test fails when a locale misses a key.
3. **Rebase onto the latest `main` before opening the PR.** Always pull the newest
   `main` and rebase your branch on top of it so the PR applies cleanly on the
   current tip — do not open a PR from a stale base. Please keep it rebased while the
   PR is open.
   ```bash
   git fetch origin
   git rebase origin/main
   ```
4. **Write feature docs for feature PRs.** Any user-facing feature must ship with a
   doc under `docs/features/NNN-feature_name/` (per-language `en.md` / `ko.md`,
   …) plus one index line in `docs/features/CLAUDE.md`. See
   [docs/features/CLAUDE.md](docs/features/CLAUDE.md) for the index and
   [docs/CLAUDE.md](docs/CLAUDE.md) for the writing rules. If the feature touches the
   UI at all, include screenshots, taken with the UI in English, in the feature
   folder's `assets/`.
5. **Do not use marketplace-forbidden APIs.** JetBrains **Internal** APIs
   (`@ApiStatus.Internal`, anything under an `impl` package) are forbidden — they
   fail the Marketplace Plugin Verifier. Avoid **Deprecated** APIs too (they raise
   warnings). When a native capability needs a risky API, gate it behind reflection
   or a public alternative.
6. **Ensure cross-platform safety.** Any code that can touch the OS must work on
   Windows, macOS, and Linux. **Windows is not a single environment** — treat
   `cmd`, PowerShell, **WSL**, and **WSL2** as distinct shells. Use `path.join()`
   (not hardcoded `/`), `os.tmpdir()` (not `/tmp`); avoid Unix-only commands
   (`which`, `chmod`, POSIX pipes) and signals (`SIGKILL`); account for `\r\n`
   vs `\n`, `HOME` vs `USERPROFILE`, and PATH asymmetry on WSL (inherit it via a
   login shell, e.g. `bash -lic`).
7. Ensure all checks pass (tests cover all three layers — WebView / Backend / Kotlin):
   ```bash
   bash ./scripts/build.sh wv-test
   bash ./scripts/build.sh be-test
   bash ./scripts/build.sh wv-lint
   bash ./scripts/build.sh be-lint
   bash ./scripts/build.sh full-build
   ```
8. Write a clear PR title and description in **English**, explaining **what** you
   changed and **why**. If it resolves an issue, link it with a closing keyword such as
   `Closes #123`.
9. Submit the PR against `main`

### What to expect

- We aim to review PRs within a few days
- We may suggest changes — this is collaborative, not adversarial
- Once approved, we will merge your PR

## AI-assisted Contributions

There is no taboo against using AI in this project. It values productivity, and it is
grateful for the willingness to take part in improving it. Contribute in whatever style
suits you; if the result is good for users, that is what matters.

Please remove traces that say AI wrote the change, such as `Co-authored-by` or
`Generated with` lines, from commit messages and pull request descriptions. The project
considers them unnecessary information for delivering improvements to users and managing
them.

## License

The project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
Contributions you submit are licensed under the same terms.

## Questions?

- Open a [GitHub Issue](https://github.com/Swttch/swttch/issues) for bugs or feature requests
- Check existing issues for known problems or planned features

Thank you for helping make Swttch better!
