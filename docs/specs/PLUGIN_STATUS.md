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

## Notes

- All three platforms actively support MCP servers
- MCP Registry is the most focused on MCP server discoverability
- Claude Code and Cursor marketplaces support broader plugin ecosystems beyond MCP
- No marketplace is yet fully mature but all are actively developed and accepting submissions
- GitHub authentication for MCP Registry provides good alignment with developer workflows
