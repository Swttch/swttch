# Permission Dialog UI - Implementation Guide

## Overview

Phase 2.3 구현: Tool use 권한 요청을 위한 모달 다이얼로그 및 배너 UI

## Design Direction: INDUSTRIAL PRECISION

신뢰와 명확성을 위한 실용적이고 기능적인 디자인:

- **Risk Communication**: 색상 코드로 즉각적인 위험도 인지 (Low/Medium/High)
- **Hierarchy**: 중요 정보를 시각적 최상위에 배치
- **Keyboard Support**: Enter/Esc 단축키로 빠른 승인/거부
- **Typography**: 모노스페이스 폰트로 기술적 신뢰감 강조

## Components

### 1. PermissionDialog (Modal)

전체 화면 모달 다이얼로그로 상세 권한 요청 표시.

**Features:**
- Risk level indicator (Low/Medium/High) with color coding
- Tool name and description
- Detailed explanation of operation
- Input parameters (JSON formatted)
- Three action buttons:
  - Allow (Enter key)
  - Deny (Esc key)
  - Allow for this session
- Keyboard shortcuts support

**Risk Levels:**
| Risk Level | Color | Icon | Triggers |
|------------|-------|------|----------|
| Low | Green | ✓ | read_file, list_directory |
| Medium | Amber | ⚠ | write_file, network_request |
| High | Red | ⛔ | bash, execute_command, delete_file (system paths) |

**Usage:**
```tsx
import { PermissionDialog } from './components';

<PermissionDialog
  request={permissionRequest}
  onApprove={(allowForSession) => approvePermission(id, allowForSession)}
  onDeny={() => denyPermission(id)}
/>
```

### 2. PermissionBanner (Inline)

컴팩트한 인라인 배너로 빠른 승인 제공.

**Features:**
- Compact one-line design
- Risk indicator with icon
- Tool name and description
- Quick Allow/Deny buttons
- Expand button to show full dialog

**Usage:**
```tsx
import { PermissionBanner } from './components';

<PermissionBanner
  request={permissionRequest}
  onApprove={() => approvePermission(id)}
  onDeny={() => denyPermission(id)}
  onExpand={() => setShowDialog(true)}
/>
```

### 3. usePermissions Hook

Permission 상태 관리 및 자동 위험도 평가.

**Features:**
- Automatic risk assessment based on tool type
- Session-level permissions (allow for session)
- Human-readable descriptions
- Integration with useTools

**API:**
```tsx
const {
  pendingRequests,        // PermissionRequest[]
  sessionPermissions,     // SessionPermission[]
  requestPermission,      // (toolUse: ToolUse) => void
  approvePermission,      // (toolId: string, allowForSession?: boolean) => void
  denyPermission,         // (toolId: string) => void
  hasSessionPermission,   // (toolName: string) => boolean
  clearSessionPermissions,// () => void
} = usePermissions(approveToolUse, denyToolUse);
```

## Integration Example

```tsx
// ChatPanel.tsx or similar component

import { useTools, usePermissions } from '../hooks';
import { PermissionDialog } from '../components';

function ChatPanel() {
  const { toolUses, approveToolUse, denyToolUse } = useTools();
  const {
    pendingRequests,
    approvePermission,
    denyPermission,
    requestPermission,
    hasSessionPermission,
  } = usePermissions(approveToolUse, denyToolUse);

  // Auto-request permissions for new pending tools
  useEffect(() => {
    toolUses
      .filter(t => t.status === 'pending')
      .forEach(tool => {
        // Check if we already have session permission
        if (hasSessionPermission(tool.name)) {
          approveToolUse(tool.id);
        } else {
          requestPermission(tool);
        }
      });
  }, [toolUses, hasSessionPermission, requestPermission, approveToolUse]);

  return (
    <div>
      {/* Main chat UI */}
      <MessageList messages={messages} />

      {/* Permission Dialog (only show first pending) */}
      {pendingRequests.length > 0 && (
        <PermissionDialog
          request={pendingRequests[0]}
          onApprove={(allowForSession) => {
            approvePermission(pendingRequests[0].toolUse.id, allowForSession);
          }}
          onDeny={() => {
            denyPermission(pendingRequests[0].toolUse.id);
          }}
        />
      )}
    </div>
  );
}
```

## File Structure

```
webview/src/
├── components/
│   ├── PermissionDialog.tsx       # Modal dialog component
│   ├── PermissionBanner.tsx       # Inline banner component
│   ├── PermissionDemo.tsx         # Demo/example component
│   └── index.ts                   # Updated exports
├── hooks/
│   ├── usePermissions.ts          # Permission state management
│   └── index.ts                   # Updated exports
└── types/
    └── index.ts                   # Existing types (ToolUse)
```

## Risk Assessment Logic

### High Risk Operations
- `bash`, `execute_command`: Shell command execution
- `delete_file`: File deletion
- `write_file`: Writing to system paths (/etc/, /System/, C:\Windows\)

### Medium Risk Operations
- `write_file`: Normal file writes
- `network_request`, `fetch`: External network access

### Low Risk Operations
- `read_file`: Read-only file access
- `list_directory`: Directory listing
- Other read-only operations

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Approve permission |
| Esc | Deny permission |

## Visual Design Details

### Colors
- **Green** (Low Risk): `bg-green-500/10`, `border-green-500/30`, `text-green-400`
- **Amber** (Medium Risk): `bg-amber-500/10`, `border-amber-500/30`, `text-amber-400`
- **Red** (High Risk): `bg-red-500/10`, `border-red-500/30`, `text-red-400`

### Typography
- Headers: Bold, tight tracking
- Tool names: Mono font, uppercase
- Descriptions: Medium weight, relaxed leading
- JSON parameters: Mono font, small size

### Animations
- Dialog entrance: `animate-fade-in` + `animate-scale-in`
- Pending tools: `animate-pulse-subtle`
- Buttons: `hover:scale-105` + `active:scale-95`

## Testing

Run the demo component to test permission UI:

```tsx
import { PermissionDemo } from './components/PermissionDemo';

// In your dev route or storybook
<PermissionDemo />
```

The demo provides:
- Button to trigger dialog with high-risk tool
- Button to trigger banner with medium-risk tool
- Example integration code

## Next Steps

1. Integrate permission UI into ChatPanel
2. Wire up actual tool use approval flow
3. Persist session permissions to localStorage
4. Add unit tests for risk assessment logic
5. Add e2e tests for permission workflow

## Files Created/Updated

### Created
- `/Users/yonghyun/Projects/Swttch/swttch/webview/src/hooks/usePermissions.ts`
- `/Users/yonghyun/Projects/Swttch/swttch/webview/src/components/PermissionDialog.tsx`
- `/Users/yonghyun/Projects/Swttch/swttch/webview/src/components/PermissionBanner.tsx`
- `/Users/yonghyun/Projects/Swttch/swttch/webview/src/components/PermissionDemo.tsx`
- `/Users/yonghyun/Projects/Swttch/swttch/webview/PERMISSION_UI.md`

### Updated
- `/Users/yonghyun/Projects/Swttch/swttch/webview/src/components/ToolCard.tsx` - Added pulse animation for pending state
- `/Users/yonghyun/Projects/Swttch/swttch/webview/src/components/index.ts` - Exported new components
- `/Users/yonghyun/Projects/Swttch/swttch/webview/src/hooks/index.ts` - Exported new hook
- `/Users/yonghyun/Projects/Swttch/swttch/webview/tailwind.config.js` - Added custom animations
