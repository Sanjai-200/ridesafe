# Git Commit Conventions

All future Git commits in this repository must follow strict, descriptive Conventional Commit standards:

## Format
`<type>(<scope>): <clear, concise description>`

## Allowed Types
- `feat`: New feature or user-facing capability (e.g. `feat(super-admin): add role-based export filter`)
- `fix`: Bug fix (e.g. `fix(auth): handle expired token redirect correctly`)
- `refactor`: Code restructuring without changing behavior (e.g. `refactor(analytics): optimize aggregate query`)
- `perf`: Performance improvement (e.g. `perf(cache): memoize health ping responses`)
- `chore`: Maintenance, dependencies, or repository configs (e.g. `chore(deps): update prisma client`)
- `test`: Adding or updating test suites (e.g. `test(security): add RBAC boundary tests`)
- `docs`: Documentation updates only

## Guidelines
- Always base the commit message directly on the user's specific question, prompt, and exact requested instructions.
- Clearly describe what was requested and what changed, never use vague messages like "update", "changes", "fix", or "New".
- Always identify the affected component or scope in parentheses: e.g. `feat(parent): ...`, `docs(workflow): ...`.
- Keep the title imperative and under 72 characters.
