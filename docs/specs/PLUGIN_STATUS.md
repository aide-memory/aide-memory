# AIDE Memory Plugin/Marketplace Status

**Document Date**: April 8, 2026  
**Status**: Research Complete

---

## Executive Summary

AIDE Memory (as an MCP server) can be distributed through multiple channels:
1. **Official MCP Registry** - Available and actively accepting submissions
2. **Claude Code Marketplace** - Available through official Anthropic marketplace submission
3. **Cursor Marketplace** - Available and actively accepting plugin submissions

All three platforms support MCP servers/extensions and have documented submission processes.

---

## 1. Claude Code Marketplace

### Status
**AVAILABLE** - Active and operational

### Platform Details
- Official marketplace: `claude-plugins-official` (automatically available)
- Maintained by Anthropic
- Browse at: [claude.com/plugins](https://claude.com/plugins)

### Submission Process

#### Option A: Submit to Official Marketplace (Recommended)
Submit through one of these official forms:
- **Claude.ai**: [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit)
- **Console**: [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit)

#### Option B: Distribute Independently
Create your own marketplace as a `.claude-plugin/marketplace.json` file and distribute via:
- GitHub repositories (`owner/repo` format)
- Git URLs (GitLab, Bitbucket, self-hosted)
- Local paths
- Remote URLs

### Key Features
- Plugins can bundle MCP servers, skills, agents, hooks, and rules
- Support for language server protocol (LSP) plugins
- External integrations with popular services
- Development workflow plugins
- Automatic marketplace discovery via `/plugin` command
- Auto-update capability for installed plugins

### Requirements
- Plugin must be packaged with `.claude-plugin/marketplace.json`
- Documentation recommended in plugin's homepage/description
- Must meet quality and security standards for official marketplace approval

### Documentation
- [Discover and install plugins guide](https://code.claude.com/docs/en/discover-plugins)
- [Plugin creation reference](https://code.claude.com/docs/en/plugins)

---

## 2. Cursor Marketplace

### Status
**AVAILABLE** - Active and accepting community submissions

### Platform Details
- Official marketplace: [cursor.com/marketplace](https://cursor.com/marketplace)
- Active blog with new plugin announcements
- Community-driven submissions accepted
- Supports skills, subagents, MCP servers, hooks, and rules

### Submission Process

1. **Access Submission Portal**: [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)

2. **Plugin Structure Requirements**
   - `.cursor-plugin/plugin.json` - Plugin manifest
   - `skills/` directory - Skill definitions
   - `.mdc` files - Cursor rules
   - MCP server definitions
   - `README.md` - Documentation
   - `CHANGELOG.md` - Version history
   - `LICENSE` file - License information

3. **Testing**: Plugins must be tested locally before submission

4. **Ownership**: Submitting as an individual using your Cursor account email

### Plugin Components Supported
- **Skills**: Domain-specific prompts and code
- **Subagents**: Specialized agents for parallel task completion
- **MCP Servers**: Services connecting Cursor to external tools/data
- **Hooks**: Custom scripts for observing/controlling agent behavior
- **Rules**: System-level instructions for coding standards

### Reference Implementation
- Cursor Team Kit (CI, code review, testing workflows) publicly available as reference

### Documentation
- [Plugins documentation](https://cursor.com/docs/plugins)
- [Plugins reference](https://cursor.com/docs/reference/plugins)

---

## 3. Official MCP Registry

### Status
**AVAILABLE** - Community-driven registry in active use

### Platform Details
- Official registry: [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/)
- GitHub repository: [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)
- Launched as open catalog for publicly available MCP servers
- Community owned, backed by Anthropic, GitHub, Microsoft, and others

### Submission Process

#### Step 1: Install mcp-publisher CLI
```bash
# Via Homebrew
brew install mcp-publisher

# Or download from GitHub releases
# Or build from source
```

#### Step 2: Initialize Your Server
```bash
mcp-publisher init
```
This creates a `server.json` template in your project with:
- Server name (must follow naming convention)
- Package metadata
- Configuration details

#### Step 3: Publish Your Package to a Supported Registry
Before publishing to MCP Registry, publish your actual package to one of these:
- **npm** (Node.js packages) - `npm publish --access public`
- **PyPI** (Python packages)
- **NuGet.org** (.NET packages)
- **GitHub Container Registry (GHCR)**
- **Docker Hub**
- **MCPB** (MCP Bundle format)

#### Step 4: Authenticate with GitHub
```bash
mcp-publisher login github
```
**Note**: For servers using GitHub-based namespaces (`io.github.username/*`), GitHub authentication is required.

#### Step 5: Publish to MCP Registry
```bash
mcp-publisher publish
```

Optional flags:
- `--dry-run` - Validate without publishing
- `--file <path>` - Custom server.json location

### Key Requirements
- **Naming Convention**: Server names must follow format `io.github.your-username/your-server-name`
- **Package Location**: The actual MCP server package must be published to a supported external registry
- **Metadata**: `server.json` file with complete server information
- **GitHub Account**: Required for authentication and server naming

### Features
- Provides CLI tool for publishing and authentication
- Open API with endpoints like `GET /v0/servers` for discovering servers
- OpenAPI specification for building compatible sub-registries
- Central hub for discoverability and implementation

### Documentation
- [MCP Registry Quickstart](https://modelcontextprotocol.io/registry/quickstart)
- [Publishing Guide](https://modelcontextprotocol.info/tools/registry/publishing/)
- [Registry CLI Tool Reference](https://modelcontextprotocol.info/tools/registry/cli/)
- [FAQ](https://modelcontextprotocol.info/tools/registry/faq/)
- [GitHub Registry Repository](https://github.com/modelcontextprotocol/registry)

---

## Comparison Matrix

| Feature | Claude Code | Cursor | MCP Registry |
|---------|------------|--------|--------------|
| **Status** | Available | Available | Available |
| **Type** | Plugin Marketplace | Plugin Marketplace | MCP Server Registry |
| **Submission Method** | Form submission or self-host | Direct publish portal | CLI tool (mcp-publisher) |
| **Package Format** | `.claude-plugin/` | `.cursor-plugin/` | `server.json` + external package |
| **MCP Server Support** | Yes | Yes | Yes (primary focus) |
| **Skills Support** | Yes | Yes | No (MCP only) |
| **Authentication** | Form-based | Cursor account | GitHub |
| **Auto-discovery** | Via `/plugin` command | Via marketplace | API/CLI discovery |
| **Community/Official** | Both options | Community submissions | Community-owned |
| **Documentation** | Comprehensive | Good | Comprehensive |

---

## Recommended Next Steps for AIDE Memory

### Immediate Actions
1. **Create MCP Server Manifest**: Prepare `server.json` for MCP Registry submission
2. **Package for External Registry**: Publish AIDE as an npm package (or appropriate language package)
3. **CLI Tool Setup**: Install and configure mcp-publisher locally

### Phase 1: MCP Registry (Primary Distribution)
1. Publish AIDE Memory package to npm as public
2. Create `server.json` with complete metadata
3. Authenticate with `mcp-publisher login github`
4. Submit with `mcp-publisher publish`
5. Update MCP Registry documentation/examples

### Phase 2: Claude Code Marketplace
1. Create `.claude-plugin/marketplace.json`
2. Package AIDE as a Claude Code plugin
3. Submit via [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit)
4. Consider self-hosting marketplace on GitHub for alternative distribution

### Phase 3: Cursor Marketplace
1. Create `.cursor-plugin/plugin.json` manifest
2. Package skills and documentation
3. Test locally
4. Submit via [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)

---

## Additional Resources

- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **Claude Code Docs**: [code.claude.com/docs](https://code.claude.com/docs)
- **Cursor Docs**: [cursor.com/docs](https://cursor.com/docs)
- **Anthropic Plugins**: [claude.com/plugins](https://claude.com/plugins)
- **Cursor Plugins**: [cursor.com/marketplace](https://cursor.com/marketplace)

---

## Claude Code Marketplace Research (April 10, 2026)

### Current Status & Marketplace Maturity

As of April 2026, the Claude Code plugin ecosystem has achieved significant maturity:
- **101+ plugins** available in official Anthropic marketplace
- **33 internal Anthropic plugins** spanning language servers (12), dev workflows (10), and setup tools (5)
- **500+ total extensions** across all ecosystem marketplaces
- Plugin system remains actively developed with ongoing improvements

### Plugin Submission - Updated Process

#### Official Submission Forms (2026)
Two official submission endpoints are now available:
1. **Claude.ai**: [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit)
2. **Console**: [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit)

#### Submission Method
- GitHub repository link OR zip file upload containing plugin structure
- Each submission/update requires re-submission and automated scanning
- Plugins with "Anthropic Verified" badge have additional quality review

#### Requirements for AIDE Memory
- `.claude-plugin/plugin.json` manifest (required)
- Optional: `skills/`, `agents/`, `hooks/`, `.mcp.json` directories
- Recommended: `README.md`, `LICENSE` file
- MCP server definition files

#### Review Timeline
- Automated review performed on all submissions
- Additional manual review for "Anthropic Verified" badge eligibility
- Marketplace inclusion after review completion

### MCP Registry Status (April 2026)

The official MCP Registry at [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/) remains the primary distribution mechanism for MCP servers:
- Community-owned, backed by Anthropic, GitHub, PulseMCP, Microsoft
- API frozen at v0.1 (launched September 8, 2025)
- Hosts metadata pointing to packages in npm, PyPI, Docker Hub, GHCR
- Supports API queries: `curl "https://registry.modelcontextprotocol.io/v0/servers"`

### Claude Code MCP Integration (April 2026)

Per Anthropic documentation at [docs.anthropic.com/en/docs/claude-code/mcp](https://docs.anthropic.com/en/docs/claude-code/mcp):
- MCP remains the recommended approach for tool integration
- Three configuration options: HTTP (recommended for remote), local processes, SDK integration
- Use case: Eliminate data copying from other tools by direct MCP connection

### Key Findings

1. **Dual-Path Distribution Strategy** works best:
   - Publish AIDE to npm as public package
   - Submit to MCP Registry via mcp-publisher CLI (primary for MCP-focused users)
   - Submit to Claude Code marketplace via submission form (reaches broader audience)

2. **Marketplace Maturity**: Claude Code ecosystem has stabilized with documented processes, though the existing file noted "rough edges" may persist with plugin conflicts and limited documentation

3. **No Breaking Changes**: Submission processes documented in April 8 file remain current as of April 10, 2026

### Recommended Next Steps (Unchanged)

For AIDE Memory v0 launch:
1. Publish to npm as public package
2. Create server.json for MCP Registry
3. Submit to Claude Code marketplace via platform.claude.com/plugins/submit
4. Document in multiple marketplaces for discovery

---

## MCP Registry Submission Prep (April 10, 2026)

### Repository Structure and Format

The MCP Registry at [github.com/modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry) uses a standardized `server.json` format for server metadata and discovery. Servers are published to external package managers (npm, PyPI, NuGet, GHCR, Docker Hub) with metadata registered in the central registry.

**Key Components**:
- **Schema Definition**: `server.schema.json` (version 2025-12-11) validates all server.json files
- **Publishing Tool**: `mcp-publisher` CLI handles authentication and submission
- **Namespace Format**: `io.github.username/server-name` for GitHub-authenticated servers
- **Package Ownership**: npm `mcpName` field verifies package ownership

### server.json Structure and AIDE Memory Entry

**Standard server.json template** (applies to AIDE Memory):

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.aide-memory/aide-memory",
  "title": "AIDE Memory",
  "description": "Persistent, path-scoped memory for AI coding agents with graph-based knowledge retrieval",
  "version": "0.2.0",
  "repository": {
    "url": "https://github.com/aide-memory/aide-memory",
    "source": "github"
  },
  "packages": [
    {
      "registryType": "npm",
      "identifier": "aide-memory",
      "version": "0.2.0",
      "transport": {
        "type": "stdio"
      }
    }
  ]
}
```

**Core Required Fields**:
- `$schema`: JSON schema version reference (fixed URL)
- `name`: Unique identifier in reverse DNS notation (`io.github.username/server-name`)
- `description`: One-line functional description
- `version`: Semantic version matching npm package version
- `packages`: Array of package configurations (registryType, identifier, version, transport)

**Optional but Recommended**:
- `title`: Human-readable display name
- `repository`: Source code location with URL and source type (github/gitlab/etc)
- `environmentVariables`: Configuration parameters documentation
- `packageArguments`: Fixed CLI arguments for server startup

### Package.json Update Required

Add the `mcpName` field to `/aide-v0/package.json` for npm ownership verification:

```json
{
  "name": "aide-memory",
  "version": "0.2.0",
  "mcpName": "io.github.aide-memory/aide-memory",
  "description": "AIDE V0 - Local project-aware AI coding assistant with graph-based retrieval",
  ...
}
```

This field allows the MCP Registry to verify that the npm package owner matches the registering entity.

### Step-by-Step User Instructions for Registration

#### Pre-Registration Checklist

1. **Verify Local Setup**:
   ```bash
   npm run build
   npm test
   npx aide-memory serve  # Confirm server starts on stdio
   ```

2. **Update package.json** with the `mcpName` field shown above

#### Phase 1: Publish to npm (One-time)

```bash
# 1. Build distribution
npm run build

# 2. Authenticate (if not already)
npm adduser  # or npm login

# 3. Publish as public package
npm publish --access public

# 4. Verify publication
npm view aide-memory
```

#### Phase 2: Register with MCP Registry

**Step 1: Install mcp-publisher**
```bash
# Option A: Homebrew (if available)
brew install mcp-publisher

# Option B: Download from GitHub
# https://github.com/modelcontextprotocol/registry/releases
# Extract binary and add to PATH
```

**Step 2: Create server.json**
```bash
# Option A: Interactive initialization
mcp-publisher init
# Follow prompts for:
# - Server name: io.github.aide-memory/aide-memory
# - Description: Persistent, path-scoped memory for AI coding agents...
# - Execute command: npx aide-memory serve
# - Repository: https://github.com/aide-memory/aide-memory

# Option B: Manual creation
# Save the server.json template above to .mcp/server.json in project root
```

**Step 3: Authenticate with GitHub**
```bash
mcp-publisher login github
# Opens browser for device flow authentication
# Verify io.github.aide-memory namespace ownership via GitHub account
# Returns auth token valid for 30 days
```

**Step 4: Validate and Publish**
```bash
# Test without publishing
mcp-publisher publish --dry-run

# If successful, publish to registry
mcp-publisher publish
```

**Step 5: Verify Registration**
```bash
# Query registry API (may take a few minutes to propagate)
curl "https://registry.modelcontextprotocol.io/v0/servers?q=aide-memory"

# Check web registry
# https://registry.modelcontextprotocol.io/
```

### Important Considerations

**Naming & Ownership**:
- Server name must follow `io.github.username/server-name` format
- GitHub OAuth verifies you own the namespace
- Mismatch between GitHub account and io.github.* namespace causes auth failure

**Version Management**:
- server.json version must exactly match npm package version
- Update both files when releasing new versions
- Re-publish to MCP Registry after each npm publish

**Transport Type**:
- AIDE Memory uses `stdio` (standard input/output)
- Configured in packages[0].transport.type field

**Documentation**:
- Add MCP Registry badge to README after approval:
  ```markdown
  [![MCP Registry](https://img.shields.io/badge/MCP%20Registry-listed-blue)](https://registry.modelcontextprotocol.io/)
  ```

### Reference Documentation

- **MCP Registry**: https://registry.modelcontextprotocol.io/
- **Publishing Quickstart**: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx
- **server.json Reference**: https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md
- **Package Types Guide**: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx
- **mcp-publisher CLI**: https://github.com/modelcontextprotocol/registry/tree/main/tools/publisher

---

## Notes

- All three platforms actively support MCP servers
- MCP Registry is the most focused on MCP server discoverability
- Claude Code and Cursor marketplaces support broader plugin ecosystems beyond MCP
- No marketplace is yet fully mature but all are actively developed and accepting submissions
- GitHub authentication for MCP Registry provides good alignment with developer workflows
- As of April 2026, Claude Code marketplace submission process is stable and documented
- MCP Registry uses CLI-based submission (mcp-publisher), not GitHub PR workflow
- Server.json schema uses fixed version URL; do not manually version the schema reference
