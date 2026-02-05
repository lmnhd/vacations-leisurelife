# GitHub Copilot Instructions - Vacations LeisureLife

##  PROJECT PURPOSE

**Project Name**: Vacations LeisureLife
**Framework**: Next.js 14
**Description**: Vacation booking platform with cruise and destination management capabilities.

**CRITICAL**: This project inherits universal coding standards from the Master Workspace while maintaining project-specific patterns and conventions.

---

## Environment
- **OS**: Windows 11
- **Shell**: PowerShell (use ; for command chaining, never &&)
- **Runtime**: Node.js with npm
- **Framework**: Next.js 14

---

##  CRITICAL PLATFORM RULES (NO EXCEPTIONS)

### 1. NEVER START/STOP/MANAGE DEV SERVERS
**This is non-negotiable.** Agents must NEVER:
- Run 
pm run dev, 
pm start, or any development server commands
- Start Python servers, Node servers, .NET servers, etc.
- Manage processes with pm2, orever, or similar tools
- Kill, stop, or restart any running services

**USER ONLY**: The user starts and manages all development servers. If a task requires running a server, tell the user what command to run and let them execute it.

**Exception**: Running one-off commands (build, test, linting) in a fresh terminal is acceptable. Background dev servers are NOT.

### 2. Core Development Rules (Inherited from Master Workspace)

#### Universal TypeScript Standards
- **NEVER use ny types** - all types must be explicitly defined
- **No type scattering** - avoid duplicate type definitions across files
- **Strongly typed objects/classes only** - prefer interfaces and Zod schemas
- Keep files under 500 lines - split into multiple modules if needed

#### Git Workflow
- **Always create checkpoints before significant changes**: git add .; git commit -m "checkpoint: before [change]"
- Use descriptive commit messages that explain the "why"
- Confirm multi-step plans with user before executing

#### AI-First Development Philosophy
- Prefer AI/LLM solutions over programmatic approaches when applicable
- Keep LLM prompts separate from core business logic
- Never write mock/fallback implementations unless explicitly requested
- Use "Not Implemented" placeholders for incomplete features

#### PowerShell Syntax (Windows)
- Use ; for command chaining (NEVER &&)
- Native PowerShell cmdlets preferred
- Example: git add .; git commit -m "message"

---

## Project-Specific Guidelines

### Database
- **Type**: Prisma (on PostgreSQL)
- **Connection**: Use environment variables in .env.local or .env
- **Schema**: See PDR.md and prisma/schema.prisma for data models

### Services
- **Integrations**: OpenAI, Clerk, Crisp, Stripe
- **API Keys**: Store in environment variables, never commit to git

### File Organization
- Core logic: lib/
- Components: components/
- API routes: pp/api/
- Test files: 	ests/ or framework-specific test directories

---

## Common Commands (PowerShell)

`powershell
# Navigate to project
cd C:\Users\cclem\Dropbox\Source\Projects-24\vacations-leisurelife

# Install dependencies
npm install

#  DO NOT RUN - User starts the dev server
# npm run dev
#  Tell the user what command to run; they execute it in their terminal

# Git checkpoint (use semicolon, not &&)
git add .; git commit -m "checkpoint: before refactor"

# Run tests (one-off command, acceptable)
npm test

# Run build (one-off command, acceptable)
npm run build
`

---

## Testing Strategy

### Test Convention
- Create test files in 	ests/ directory
- For Next.js: Create test pages in pp/tests/ for rapid iteration
- Follow framework-specific testing patterns

### Integration Testing
- Test API endpoints thoroughly
- Verify database connections
- Validate external service integrations

---

## Portfolio Context

**Note**: This project is part of a comprehensive portfolio demonstrating:
- Modern development practices
- Clean architecture patterns
- Production-ready code quality

When explaining this project:
- Emphasize technical decisions and trade-offs
- Reference architectural patterns in PDR.md
- Highlight problem-solving approaches

---

## Related Documentation

- **Master Workspace Rules**: C:\Users\cclem\Dropbox\Source\.github\copilot-instructions.md
- **Project Design Record**: PDR.md (architecture and design decisions)
- **README**: README.md (setup instructions and project overview)
- **Agent Guidance**: CLAUDE.md (detailed rules for AI agents)

---

## Important Notes

- **Reference PDR.md** for architectural patterns and design decisions
- **Reference \'brand-identity\' skill** for styling and UI consistency
- **Maintain strong typing** throughout the codebase
- **Follow PowerShell syntax** (; not &&)
- **Test incrementally** - create test pages/files as you develop
- **Git checkpoints** before major changes
- **Ask before structural changes** - confirm with user

---

**Project Type**: Next.js 14
**Status**: Active
**Updated**: Manually updated to project-setup standards
