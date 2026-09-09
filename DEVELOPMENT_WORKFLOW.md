# RideSafe — Developer & AI Assistant Workflow Guide

> **CRITICAL DIRECTIVE FOR ALL AI AGENTS (Antigravity, OpenAI Codex CLI, etc.)**:
> 1. All active development, code edits, and feature implementations **MUST** be performed exclusively on the **`test`** branch.
> 2. **NEVER** push directly to **`main`**.
> 3. **NEVER** merge `test` into `main` without explicit, direct confirmation from the human developer.

---

## 1. Repository & Git Identity

- **GitHub Account**: [`Sanjai-200`](https://github.com/Sanjai-200)
- **Repository URL**: `https://github.com/Sanjai-200/ridesafe.git`
- **Default / Active Working Branch**: `test`
- **Production Stable Branch**: `main`

### Mandatory Git Commands Before Any Work:
```powershell
# Verify current branch is 'test' before touching any files:
git branch

# If you are not on 'test', switch to it immediately:
git checkout test

# Pull latest updates on test before starting:
git pull origin test
```

### Commit Convention:
Follow the strict Conventional Commits standard defined in `.agents/rules/git-commits.md`:
```
<type>(<scope>): <clear, concise description>
```
- **Allowed Types**: `feat`, `fix`, `refactor`, `perf`, `chore`, `test`, `docs`
- **Examples**:
  - `feat(parent): add real-time ETA countdown badge`
  - `fix(driver): resolve offline attendance sync race condition`
  - `chore(deps): update prisma client to latest patch`

### Pushing Code:
```powershell
git add .
git commit -m "feat(scope): your descriptive change"
git push origin test
```

---

## 2. Deployment Architecture & Dual-Branch Hosting

Both branches are continuously built and hosted on **Vercel** with dedicated, permanent URLs:

| Environment | Branch | Permanent Live URL | Role / Purpose |
|---|---|---|---|
| **Production (Stable)** | `main` | `https://ridesafe-pied.vercel.app` | Public live system. Untouched during development. |
| **Testing (Staging)** | `test` | `https://ridesafe-test.vercel.app` | Auto-deploys every push to `test` for review & testing. |

### Database Infrastructure (Neon PostgreSQL):
- **Provider**: [Neon Serverless PostgreSQL](https://neon.tech)
- **Host**: `ep-plain-brook-aex9vfim-pooler.c-2.us-east-2.aws.neon.tech`
- **Database Name**: `neondb`
- **ORM**: Prisma (`5.22.0`)
- **Schema Management**:
  ```powershell
  # Synchronize Prisma schema changes to Neon:
  npx.cmd prisma db push
  
  # Regenerate Prisma Client:
  npx.cmd prisma generate
  ```

---

## 3. The 5 User Roles & System Architecture

RideSafe serves **5 distinct user profiles** governed by role-based routing in `src/middleware.ts`:

```
Role Enum: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT']
```

| Role | Route | Key Responsibilities |
|---|---|---|
| **`SUPER_ADMIN`** | `/super-admin` | Multi-tenant SaaS owner. Tenant provisioning, subscription tiers (`FREE`, `BASIC`, `PREMIUM`), quotas (`maxBuses`, `maxStudents`, `maxUsers`), global audit logs. |
| **`SCHOOL_ADMIN`** | `/school-admin` | School leadership / Principal. Student/parent directories, academic calendar, school-wide announcements, attendance KPIs. |
| **`ADMIN`** | `/admin` | Transport operations desk: overview, fleet and routes/stops, bus attendance, live trips, scheduling, trip history, maintenance, lost & found, announcements, analytics, and messages. Student management, user management, AI route optimization, and academic calendar management are outside this module. |
| **`DRIVER`** | `/driver` | Frontline mobile console. Trip start/stop lifecycle, stop-by-stop check-in (`PICKED_UP`, `DROPPED_OFF`, `ABSENT`), QR scanning, delay reporting, panic button. |
| **`PARENT`** | `/parent` | Mobile-first guardian dashboard. Real-time bus tracking with live ETA & proximity alerts, two-way boarding confirmation, trip rating, messaging, gamification streaks. |

### Default Seed Accounts (Password: `password123`):
- **Super Admin**: `admin@ridesafe.com`
- **School Admin**: `schooladmin@ridesafe.com`
- **Desk Admin**: `deskadmin@ridesafe.com`
- **Driver**: `driver@ridesafe.com`
- **Parent**: `parent1@ridesafe.com`

*(Note: In `src/app/api/auth/login/route.ts`, demo accounts self-provision into Neon on first login automatically if not present).*

---

## 4. Design System & UI Consistency Rules

All profiles must follow the **High-Contrast Dark Luxury** design system:

```javascript
const HC = {
  bg:         '#08080A',           // Deep obsidian main background
  bgSoft:     '#0E0E11',           // Slightly elevated background
  surface:    '#141417',           // Main card surface
  surface2:   '#1C1C21',           // Secondary elevated card/input
  line:       '#26262C',           // Subtle border line
  lineStrong: '#3A3A43',           // Strong/hover border line
  text:       '#FFFFFF',           // Primary text
  text2:      '#A6A6B2',           // Muted body text
  text3:      '#6E6E7A',           // Dim text / labels
  yellow:     '#FFD60A',           // Brand energetic gold/yellow
  yellowGlow: 'rgba(255,214,10,0.25)',
  success:    '#2FD16B',
  danger:     '#FF453A',
  warning:    '#FF9F0A',
  r:          '14px',
  pill:       '9999px',
}
```

- **Typography**: Google Font `'Plus Jakarta Sans'`, system-ui, sans-serif.
- **Micro-interactions**: Smooth transitions via `framer-motion`.
- **Responsive Layout**: Desktop views must expand gracefully (1100px–1280px container); mobile views (<768px) must use floating glassmorphism bottom navigation.
- **No Generic Styles**: Avoid plain blue/gray MVP layouts; preserve the dark luxury obsidian aesthetic across all components.

---

## 5. Promotion Workflow (Promoting `test` to `main`)

When features built on `test` are finalized, verified on `https://ridesafe-test.vercel.app`, and the user explicitly requests to deploy to production:

```powershell
# 1. Ensure test is committed and pushed
git status
git push origin test

# 2. Switch to main and update
git checkout main
git pull origin main

# 3. Merge test into main
git merge test

# 4. Push to main (Triggers live Production deployment on Vercel)
git push origin main

# 5. IMMEDIATELY switch back to test for future work:
git checkout test
```
