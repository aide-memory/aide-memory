---
name: Model Edit Capability
overview: Allow the model to propose and make code edits, with options for auto-apply, user confirmation, or review mode.
todos:
  - id: read-file-tool
    content: Add read_file tool to retrieval tools
    status: pending
  - id: propose-edit-tool
    content: Add propose_edit tool that returns diff
    status: pending
  - id: edit-manager
    content: Create editManager.ts for handling edits
    status: pending
  - id: cli-edit-ui
    content: Add edit review UI to CLI (show diff, approve/reject)
    status: pending
  - id: web-edit-ui
    content: Add edit review UI to web (diff view, buttons)
    status: pending
---

# Model Edit Capability

## Overview

Enable the model to not just answer questions but also propose and apply code changes.

## Options to Consider

### Edit Modes

| Mode | Description | Use Case |

|------|-------------|----------|

| **Review** | Model proposes edits, user reviews diff, confirms | Safe, most control |

| **Auto** | Model applies edits directly | Fast, trusted operations |

| **Hybrid** | Small/safe changes auto, large changes need review | Balance speed + safety |

### Architecture Options

| Option | Description | Pros | Cons |

|--------|-------------|------|------|

| **Single Model** | Same model explores + answers + edits | Simple, context preserved | May be slow, expensive |

| **Dual Model** | One explores, one implements | Can use different models (fast for explore, smart for edit) | Context passing complexity |

| **Agent Loop** | Model plans → executes → reviews → iterates | Most powerful | Most complex |

---

## Recommended: Single Model + Edit Tools

Add edit tools to the existing tool-based retrieval, reusing the same architecture.

### New Tools

```typescript
// Propose an edit (review mode)
{
  name: 'propose_edit',
  description: 'Propose a code change for user review',
  parameters: {
    filePath: { type: 'string', description: 'File to edit' },
    startLine: { type: 'number', description: 'Start line' },
    endLine: { type: 'number', description: 'End line' },
    oldCode: { type: 'string', description: 'Code to replace' },
    newCode: { type: 'string', description: 'Replacement code' },
    reason: { type: 'string', description: 'Why this change' }
  }
}

// Read file content (needed for edits)
{
  name: 'read_file',
  description: 'Read full content of a file',
  parameters: {
    filePath: { type: 'string', description: 'File path to read' }
  }
}

// Apply edit (auto mode only)
{
  name: 'apply_edit',
  description: 'Apply a code change directly',
  parameters: { /* same as propose_edit */ }
}
```

### Edit Flow

```
User: "Fix the tab closing bug"
     ↓
Model explores codebase (existing tools)
     ↓
Model identifies issue in web/src/App.tsx
     ↓
Model calls read_file("web/src/App.tsx")
     ↓
Model calls propose_edit({
  filePath: "web/src/App.tsx",
  startLine: 150,
  endLine: 155,
  oldCode: "...",
  newCode: "...",
  reason: "Fix tab state cleanup"
})
     ↓
User sees diff, approves/rejects
     ↓
If approved: Apply edit to file
```

---

## Implementation Phases

### Phase 1: Review Mode (Safe)

1. Add `read_file` tool to retrieval tools
2. Add `propose_edit` tool that returns a diff for display
3. CLI/Web shows diff, prompts for approval
4. Apply edit on approval

### Phase 2: Undo/History

1. Track all edits in session
2. Allow undo last edit
3. Show edit history

### Phase 3: Auto Mode (Optional)

1. Add `apply_edit` tool for trusted operations
2. Add CLI flag `--auto-edit` to enable
3. Add safety checks (file size, diff size limits)

### Phase 4: Multi-Step Edits

1. Model can chain multiple edits
2. Batch review/apply
3. Rollback entire batch on failure

---

## UI Considerations

### Terminal (CLI)

```
┌─────────────────────────────────────────┐
│ Proposed Edit: web/src/App.tsx          │
├─────────────────────────────────────────┤
│ - const closeTab = (id) => {            │
│ -   tabs.filter(t => t.id !== id);      │
│ + const closeTab = (id) => {            │
│ +   setTabs(tabs.filter(t => t.id !== id)); │
│ +   if (activeTab === id) {             │
│ +     setActiveTab(tabs[0]?.id);        │
│ +   }                                   │
├─────────────────────────────────────────┤
│ Reason: Fix tab state not updating      │
├─────────────────────────────────────────┤
│ [A]pply  [R]eject  [E]dit  [Q]uit       │
└─────────────────────────────────────────┘
```

### Web UI

- Side-by-side diff view
- Syntax highlighting
- Apply/Reject buttons
- Edit history panel

---

## Files to Create/Modify

| File | Changes |

|------|---------|

| `src/retrieval/toolBasedRetrieval.ts` | Add `read_file`, `propose_edit` tools |

| `src/edit/editManager.ts` | New: Handle edit proposals, diffs, apply |

| `src/cli/repl.ts` | Show edit prompts, handle approval |

| `web/src/App.tsx` | Edit diff component, approval UI |

---

## Questions for User

1. Start with Review mode only, or include Auto mode from start?
2. Scope of edits: Single file only, or multi-file?
3. Should model explain each edit, or just show diff?
