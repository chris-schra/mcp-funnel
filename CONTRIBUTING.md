# Contributing to MCP Funnel

## Git Workflow for Multi-Agent Development

This project uses a sophisticated branch hierarchy optimized for parallel AI agent development using git worktrees.

### Branch Hierarchy

```
main                                    # Production releases only
├── develop                            # Integration and beta testing
    ├── feat/feature-name-hub          # Feature coordination branch
        ├── feat/feature-name/agent-task-1    # Agent 1 isolated work
        ├── feat/feature-name/agent-task-2    # Agent 2 parallel work
        └── feat/feature-name/agent-task-3    # Agent 3 parallel work
```

### Core Branches

1. **main**
   - Production-ready releases only
   - Only receives squash-merged features from `develop`
   - Never contains granular commits
   - Tagged for version releases

2. **develop**
   - Integration branch for completed features
   - Runs full test suite before merging to `main`
   - Used for beta/latest builds
   - All features must pass CI here

### Feature Development with Hub Pattern

For each feature, create a hub branch and agent branches:

1. **Feature Hub Branch**
   - Name: `feat/feature-name-hub`
   - Purpose: Coordination point for parallel agent work
   - Branch from: `develop`
   - Merge to: `develop` (squash merge)

2. **Agent Work Branches**
   - Name: `feat/feature-name/specific-task`
   - Purpose: Isolated workspace for individual agents
   - Branch from: `feat/feature-name-hub`
   - Merge to: `feat/feature-name-hub` (regular merge)

### Git Worktree Setup

Each agent operates in its own worktree for true parallel development:

```bash
# Create feature hub
git checkout -b feat/tool-registry-hub develop

# Agent 1 creates worktree
git worktree add ../mcp-funnel-agent1 -b feat/tool-registry/docs-update feat/tool-registry-hub

# Agent 2 creates worktree
git worktree add ../mcp-funnel-agent2 -b feat/tool-registry/api-impl feat/tool-registry-hub

# Agent 3 creates worktree
git worktree add ../mcp-funnel-agent3 -b feat/tool-registry/tests feat/tool-registry-hub
```

### Merge Flow

```
Agent branches → Feature hub → Develop → Main
     ↓              ↓            ↓         ↓
  Isolated      Coordinated   Tested   Released
```

#### 1. Agent → Hub Merge (Regular Merge)

```bash
# In hub worktree
git checkout feat/tool-registry-hub
git merge feat/tool-registry/docs-update
```

- Preserves agent's granular commits for context
- Allows tracking individual agent contributions
- Maintains development history during active work

#### 2. Hub → Develop Merge (Squash Merge)

```bash
git checkout develop
git merge --squash feat/tool-registry-hub
git commit -m "feat: implement tool registry with GitHub discovery

- Added registry interface definitions
- Implemented GitHub-based discovery
- Created comprehensive test suite
- Updated documentation

Closes #123"
```

- Creates single atomic commit in `develop`
- Clean, searchable history
- Easy to revert if needed

##### File Filtering During Squash Merge

Feature branches may contain temporary coordination files that should not reach `develop`. Use the `.feature/` folder for such files:

```bash
.feature/
├── TASK.md           # Agent coordination
├── NOTES.md          # Development notes
├── hub-status.json   # Merge planning
└── agent-logs/       # Debug outputs
```

**Implementation Options:**

1. **Primary Method - Automated Script**:
   ```bash
   # Use the provided squash script
   scripts/squash-merge.sh feat/your-feature-hub
   ```

2. **GitHub Integration**:
   - Branch protection blocks PRs containing `.feature/` files
   - Comment `/merge` on PR to trigger automated squash via GitHub Action
   - Provides audit trail and eliminates human error

**Benefits:**
- **Deterministic**: Clear `.feature/` convention
- **Error prevention**: Automated filtering prevents typos/missed steps
- **Hybrid safety**: Multiple methods ensure files never leak to develop
- **Audit trail**: GitHub Actions provide better logs than local troubleshooting

#### 3. Develop → Main Merge (Squash Merge)

```bash
git checkout main
git merge --squash develop
git commit -m "release: v1.2.0

Features:
- Tool registry with GitHub discovery
- Enhanced validation system
- Performance improvements

See CHANGELOG for details"
```

### Branch Naming Rules for AI Agents

**IMPORTANT**: Follow these exact patterns. AI agents must use deterministic branch names.

#### Hierarchy Levels

1. **Feature Hub**: `feat/{feature-name}-hub`
2. **Task Hub**: `feat/{feature-name}/{task-name}-hub`
3. **Agent Branch**: `feat/{feature-name}/{task-name}/{specific-work}-agent-{id}`

#### Naming Components

- `{feature-name}`: Kebab-case feature identifier (e.g., `github-discovery`, `tool-registry`)
- `{task-name}`: Task category (e.g., `documentation`, `implementation`, `tests`)
- `{specific-work}`: What the agent is doing (e.g., `api-docs`, `core-logic`, `e2e-tests`)
- `{id}`: Sequential agent number (1, 2, 3...)

### Practical Example

Feature: GitHub Discovery with 2 parallel task streams and 3 agents per task.

```bash
# Level 1: Feature coordination
feat/github-discovery-hub

# Level 2: Task coordination (branches from feature hub)
feat/github-discovery/documentation-hub
feat/github-discovery/implementation-hub

# Level 3: Agent work (branches from respective task hub)
# Documentation agents:
feat/github-discovery/documentation/api-docs-agent-1
feat/github-discovery/documentation/user-guide-agent-2
feat/github-discovery/documentation/examples-agent-3

# Implementation agents:
feat/github-discovery/implementation/core-logic-agent-1
feat/github-discovery/implementation/api-endpoints-agent-2
feat/github-discovery/implementation/validation-agent-3
```

#### Merge Flow for This Example

```
Agent branches → Task hub → Feature hub → Develop
                    ↓            ↓           ↓
              (regular)     (regular)    (squash)

Specifically:
api-docs-agent-1 → documentation-hub → github-discovery-hub → develop
```

Each agent:
1. Works in their own worktree
2. Makes granular commits
3. Creates PR against their task hub (NOT feature hub)
4. Task hub coordinator merges agent work
5. Feature hub coordinator merges task hubs

### Branch Lifecycle

1. **Agent branches**: Delete immediately after merging to hub
   ```bash
   git branch -d feat/tool-registry/docs-update
   git push origin --delete feat/tool-registry/docs-update
   ```

2. **Hub branches**: Delete after squash-merging to develop
   ```bash
   git branch -d feat/tool-registry-hub
   git push origin --delete feat/tool-registry-hub
   ```

3. **Worktree cleanup**:
   ```bash
   git worktree remove ../mcp-funnel-agent1
   git worktree prune
   ```

## Development Process

### Starting a Feature

1. **Create hub branch**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/your-feature-hub
   ```

2. **Agents create worktrees**:
   ```bash
   git worktree add ../mcp-funnel-task -b feat/your-feature/task feat/your-feature-hub
   cd ../mcp-funnel-task
   ```

### During Development

1. **Agent work**:
   - Make granular, logical commits
   - Keep branch updated with hub:
     ```bash
     git fetch origin
     git rebase feat/your-feature-hub
     ```

2. **Hub coordination**:
   - Review and merge agent PRs
   - Resolve conflicts between agent work
   - Ensure feature completeness
   - Store coordination files in `.feature/` folder (excluded from develop)

### Before Merging

1. **Run validation** (in each worktree):
   ```bash
   yarn validate
   yarn test
   ```

2. **Update from hub** (for agents):
   ```bash
   git fetch origin
   git rebase feat/your-feature-hub
   ```

3. **Update from develop** (for hub):
   ```bash
   git fetch origin
   git rebase develop
   ```

## Pull Request Process

### Agent → Hub PR

1. Title: `feat(feature-name): specific task description`
2. Target branch: `feat/feature-name-hub`
3. Review focus: Task completion and integration
4. Merge method: Regular merge (preserves commits)

### Hub → Develop PR

1. Title: `feat: complete feature description`
2. Target branch: `develop`
3. Review focus: Feature completeness and quality
4. Merge method: Use `scripts/squash-merge.sh` or comment `/merge` for automated squash
5. Description should include:
   - All agent contributions
   - Testing performed
   - Breaking changes (if any)
6. **Important**: Ensure `.feature/` files are excluded from final merge

### Develop → Main PR

1. Title: `release: vX.Y.Z`
2. Target branch: `main`
3. Review focus: Release readiness
4. Merge method: Squash and merge
5. Include CHANGELOG updates

## Code Standards

### TypeScript

- Strict mode enabled
- No `any` types without justification
- Use generics appropriately
- Follow existing patterns in codebase

### Testing

- Write tests for new features
- Update tests when modifying existing code
- E2E tests for critical paths
- Unit tests for utilities and pure functions

### Commits

Use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Formatting, no code change
- `refactor:` Code change that neither fixes nor adds
- `test:` Adding missing tests
- `chore:` Maintenance
- `release:` Version releases (main branch only)

### Agent-Specific Commit Prefixes

When working in agent branches, prefix commits with your task:
- `feat(api):` for API-related work
- `feat(ui):` for UI-related work
- `test(e2e):` for E2E test work
- `docs(api):` for API documentation

## Conflict Resolution

When multiple agents modify the same files:

1. **Hub coordinator** identifies conflicts early
2. **Agents** rebase their branches on updated hub
3. **Resolution** happens at hub level, not develop
4. **Communication** through PR comments

## Questions?

Open an issue for discussion about development process or architecture decisions.
