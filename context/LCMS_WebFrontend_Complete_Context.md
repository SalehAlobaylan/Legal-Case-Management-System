<!-- ========================================
File: LCMS_WebFrontend_Complete_Context.md
======================================== -->

# LCMS — Web Frontend Complete Context (Next.js 14)
**Priority Context for Web Development - Includes Full PRD + Implementation Backlog**  
*Generated: 2026-01-03 | Use this for web-focused AI agents*

---

## PART 1: PRODUCT REQUIREMENTS (CANONICAL PRD)

### 1.1 Product Vision & Market

**Product Name**: Legal Case Management System (LCMS) - Web Application  
**Target Market**: Saudi Arabian legal practitioners (law firms, legal departments)  
**Primary Language**: Arabic (default) + English (secondary)  
**Primary Differentiator**: AI-powered regulation suggestions + realtime change monitoring

**Core Value Proposition**:
> "Manage legal cases efficiently while AI automatically finds relevant Saudi regulations and alerts you when they change"

### 1.2 User Personas

#### Persona 1: Senior Lawyer (Primary)
- **Role**: senior_lawyer
- **Goals**: 
  - Quickly find relevant regulations for new cases
  - Stay updated on regulation changes affecting active cases
  - Verify AI suggestions before relying on them
- **Pain Points**: 
  - Manual regulation research takes hours
  - Missing regulation updates that affect cases
  - Inconsistent case documentation across team
- **Tech Comfort**: Medium (uses MS Office, basic legal software)

#### Persona 2: Paralegal (Secondary)
- **Role**: paralegal
- **Goals**:
  - Input case data accurately
  - Organize case documents
  - Prepare regulation summaries for lawyers
- **Pain Points**:
  - Can't distinguish AI suggestion quality
  - Limited permissions cause bottlenecks
- **Tech Comfort**: High (digital native)

#### Persona 3: Admin (Supporting)
- **Role**: admin
- **Goals**:
  - Manage firm user accounts
  - Monitor system usage
  - Configure firm-wide settings
- **Pain Points**:
  - Need visibility into who's using what
  - Want to control feature access per user
- **Tech Comfort**: High

### 1.3 Core Features (Priority Ordered)

**P0 (Must-Have for v1)**:
1. ✅ User authentication (login/register/logout)
2. ✅ Case CRUD (create, read, update, list with filters)
3. ✅ AI regulation suggestions (auto-generated on case create)
4. ✅ Verify/dismiss AI suggestions
5. ✅ Regulation library (list, search, view details)
6. ✅ Real-time notifications (WebSocket-based)
7. ✅ Document upload/download per case
8. ✅ Arabic RTL support across all pages
9. ✅ Dark mode toggle
10. ✅ Role-based access control (RBAC)

**P1 (Nice-to-Have for v1)**:
1. Regulation version history comparison
2. Advanced case search (full-text + semantic)
3. Bulk document upload
4. Regulation monitoring subscription UI
5. Analytics dashboard (case stats, AI accuracy)
6. Export case reports (PDF)

**P2 (Future Versions)**:
1. Calendar integration (court dates)
2. Team collaboration (comments, @mentions)
3. Mobile-optimized responsive views
4. Offline mode with sync
5. Custom regulation tagging/categorization

---

## PART 2: TECHNICAL STACK (MANDATORY)

### 2.1 Framework & Architecture

**Framework**: Next.js 14 with App Router (NOT Pages Router, NOT Vite)

**Why Next.js 14 App Router**:
- ✅ Server Components for better performance
- ✅ Built-in loading/error states
- ✅ Route groups for clean auth/dashboard separation
- ✅ Streaming SSR for faster perceived load
- ✅ Image optimization out-of-the-box

**Architecture Pattern**: 
```
Route Groups → Layouts → Pages → Components → Hooks → Services
```

### 2.2 UI Library Stack

**Core UI**: shadcn/ui + Radix UI primitives

**Why shadcn/ui**:
- ✅ Copy-paste components (full control)
- ✅ Built on Radix (accessibility by default)
- ✅ Tailwind-first (consistent styling)
- ✅ TypeScript-native
- ✅ Customizable via CVA (class-variance-authority)

**Styling**: Tailwind CSS v3.4+

**Icons**: lucide-react (consistent with shadcn)

### 2.3 State Management

**Server State**: TanStack Query v5 (formerly React Query)

**Why TanStack Query**:
- ✅ Built-in caching (reduces API calls)
- ✅ Auto-refetching on window focus
- ✅ Optimistic updates (instant UI feedback)
- ✅ Loading/error states handled
- ✅ Query invalidation for realtime sync

**Client State**: Zustand v4

**Why Zustand**:
- ✅ Simple API (no boilerplate)
- ✅ TypeScript-friendly
- ✅ Persist middleware (localStorage sync)
- ✅ No Provider hell (unlike Context API)

**State Responsibilities**:
```
TanStack Query → Cases, Regulations, AI Links (server data)
Zustand → Auth, Theme, Locale, Sidebar (client preferences)
```

### 2.4 Authentication

**Method**: JWT (JSON Web Tokens)

**Flow**:
```
1. User submits login → POST /api/auth/login
2. Backend returns: { user: {...}, token: "eyJhbG..." }
3. Frontend stores token in Zustand auth store (persisted to localStorage)
4. All API requests attach: Authorization: Bearer {token}
5. On 401 response → Clear store + redirect to /login
```

**Security**:
- Token stored in memory (Zustand) + localStorage (persistence)
- HTTPS only in production
- Token expiry: 24 hours (refresh token P1 feature)
- Middleware protects all `/dashboard/*` routes

### 2.5 Real-time Updates

**Technology**: Socket.IO client

**Connection Management**:
```typescript
// Connects on login, disconnects on logout
// Automatically joins org room: org:{organizationId}
// Receives events: case_created, case_links_refreshed, regulation_updated
```

**Event Handling Pattern**:
```typescript
socket.on('case_links_refreshed', (data) => {
  // 1. Invalidate TanStack Query cache
  queryClient.invalidateQueries(['ai-links', data.caseId]);

  // 2. Show toast notification
  toast({
    title: 'AI Suggestions Updated',
    description: 'New regulation links available'
  });

  // 3. Update UI badge count (Zustand)
  updateBadgeCount(data.count);
});
```

---

## PART 3: PROJECT STRUCTURE (COMPLETE FILE TREE)

```
web-frontend/
├── src/
│   ├── app/                              # Next.js 14 App Router
│   │   ├── layout.tsx                    # Root layout (providers, fonts)
│   │   ├── page.tsx                      # ❌ MISSING: Landing page
│   │   ├── globals.css                   # Tailwind imports + CSS vars
│   │   │
│   │   ├── (auth)/                       # Auth route group (public)
│   │   │   ├── layout.tsx                # Centered layout for auth pages
│   │   │   ├── login/
│   │   │   │   └── page.tsx              # ✅ EXISTS: Login page
│   │   │   └── register/
│   │   │       └── page.tsx              # ❌ MISSING: Register page
│   │   │
│   │   └── (dashboard)/                  # Dashboard route group (protected)
│   │       ├── layout.tsx                # Sidebar + header layout
│   │       ├── dashboard/
│   │       │   └── page.tsx              # ✅ EXISTS: Dashboard with stats
│   │       ├── cases/
│   │       │   ├── page.tsx              # ✅ EXISTS: Cases list
│   │       │   ├── new/
│   │       │   │   └── page.tsx          # ✅ EXISTS: Create case form
│   │       │   └── [id]/
│   │       │       └── page.tsx          # ✅ EXISTS: Case details (tabs)
│   │       │                             #   - Details tab ✅
│   │       │                             #   - AI Suggestions tab ✅
│   │       │                             #   - Documents tab ⚠️ INCOMPLETE
│   │       ├── regulations/
│   │       │   ├── page.tsx              # ❌ MISSING: Regulations list
│   │       │   └── [id]/
│   │       │       └── page.tsx          # P1: Regulation details
│   │       ├── profile/
│   │       │   └── page.tsx              # ❌ MISSING: User profile
│   │       └── settings/
│   │           └── page.tsx              # ❌ MISSING: App settings
│   │
│   ├── components/
│   │   ├── ui/                           # shadcn/ui components
│   │   │   ├── button.tsx                # ✅ Base components
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── select.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── label.tsx
│   │   │   ├── dialog.tsx                # ❌ MISSING
│   │   │   ├── table.tsx                 # ❌ MISSING
│   │   │   ├── toast.tsx                 # ❌ MISSING
│   │   │   ├── dropdown-menu.tsx         # ❌ MISSING
│   │   │   ├── avatar.tsx                # ❌ MISSING
│   │   │   ├── separator.tsx             # ❌ MISSING
│   │   │   ├── switch.tsx                # ❌ MISSING
│   │   │   └── checkbox.tsx              # ❌ MISSING
│   │   │
│   │   ├── features/                     # Feature-specific components
│   │   │   ├── auth/
│   │   │   │   ├── login-form.tsx        # ❌ MISSING: Extracted form logic
│   │   │   │   └── register-form.tsx     # ❌ MISSING: Extracted form logic
│   │   │   ├── cases/
│   │   │   │   ├── case-card.tsx         # ✅ Card component for list
│   │   │   │   ├── case-form.tsx         # ✅ Create/edit form
│   │   │   │   ├── case-list.tsx         # ⚠️ REFACTOR: Extract from page
│   │   │   │   ├── ai-suggestions.tsx    # ✅ AI links panel
│   │   │   │   │                         #   ❌ MISSING: Dismiss action
│   │   │   │   └── document-manager.tsx  # ❌ MISSING: Upload/list docs
│   │   │   ├── dashboard/
│   │   │   │   ├── stats-card.tsx        # ✅ Metric cards
│   │   │   │   └── recent-cases.tsx      # ✅ Recent list widget
│   │   │   └── regulations/
│   │   │       ├── regulation-card.tsx   # P1: For list page
│   │   │       └── version-history.tsx   # P1: Compare versions
│   │   │
│   │   └── layout/                       # Layout components
│   │       ├── header.tsx                # ✅ Top nav with search
│   │       ├── sidebar.tsx               # ✅ Side nav with links
│   │       ├── theme-toggle.tsx          # ❌ MISSING: Dark mode switch
│   │       └── footer.tsx                # ❌ MISSING: Optional footer
│   │
│   ├── lib/
│   │   ├── api/                          # API client layer
│   │   │   ├── client.ts                 # ✅ Axios instance with interceptors
│   │   │   ├── endpoints.ts              # ❌ MISSING: Centralized URLs
│   │   │   ├── cases.ts                  # ❌ MISSING: Cases API methods
│   │   │   ├── regulations.ts            # ❌ MISSING: Regulations API
│   │   │   └── ai-links.ts               # ❌ MISSING: AI links API
│   │   │
│   │   ├── hooks/                        # Custom React hooks
│   │   │   ├── use-auth.ts               # ✅ Login, register, logout
│   │   │   ├── use-cases.ts              # ✅ TanStack Query hooks
│   │   │   ├── use-regulations.ts        # ⚠️ BASIC: Needs search
│   │   │   ├── use-ai-links.ts           # ⚠️ BASIC: Missing dismiss
│   │   │   ├── use-websocket.ts          # ⚠️ BASIC: Needs reconnect
│   │   │   └── use-toast.ts              # ✅ Toast notifications
│   │   │
│   │   ├── store/                        # Zustand stores
│   │   │   ├── auth-store.ts             # ✅ User, token, login/logout
│   │   │   ├── ui-store.ts               # ❌ MISSING: Theme, locale, sidebar
│   │   │   └── websocket-store.ts        # ❌ MISSING: Connection state
│   │   │
│   │   ├── types/                        # TypeScript types
│   │   │   ├── auth.ts                   # ❌ MISSING: User, LoginInput
│   │   │   ├── case.ts                   # ✅ Case, CaseStatus enums
│   │   │   ├── regulation.ts             # ❌ MISSING: Regulation types
│   │   │   └── document.ts               # ❌ MISSING: Document types
│   │   │
│   │   └── utils/                        # Utility functions
│   │       ├── cn.ts                     # ✅ Class name merger (Tailwind)
│   │       ├── format.ts                 # ❌ MISSING: Date/number format
│   │       ├── validators.ts             # ❌ MISSING: Zod schemas
│   │       └── rtl.ts                    # ❌ MISSING: RTL helpers
│   │
│   ├── providers/
│   │   └── query-provider.tsx            # ✅ TanStack Query setup
│   │
│   └── middleware.ts                     # ✅ Auth route protection
│
├── public/                               # Static assets
│   ├── fonts/                            # Arabic fonts (optional)
│   └── images/
│
├── .env.local                            # Environment variables
├── .env.example                          # Template for .env
├── next.config.js                        # Next.js configuration
├── tailwind.config.ts                    # Tailwind + shadcn theme
├── tsconfig.json                         # TypeScript config
├── components.json                       # shadcn/ui config
├── package.json
└── README.md
```

**Legend**:
- ✅ EXISTS: Implemented and working
- ⚠️ INCOMPLETE: Exists but missing features
- ❌ MISSING: Not implemented yet (BACKLOG)

---

## PART 4: CRITICAL MISSING FEATURES (IMPLEMENTATION BACKLOG)

### 4.1 Missing Pages (P0 - Must Implement)

#### ❌ Landing Page (`src/app/page.tsx`)

**Purpose**: Public home page (unauthenticated users)

**Requirements**:
- Hero section with product tagline (Arabic + English)
- Feature highlights (3-4 cards):
  - "AI-Powered Suggestions" with icon
  - "Real-time Updates" with icon
  - "Arabic-First Design" with icon
  - "Secure & Compliant" with icon
- CTA buttons:
  - Primary: "Get Started" → `/register`
  - Secondary: "Sign In" → `/login`
- Responsive layout (mobile/tablet/desktop)
- No authentication required

**Implementation Notes**:
```tsx
// Recommended structure
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <nav>Logo + Login/Register links</nav>
      <section>Hero + CTAs</section>
      <section>Features grid (3-4 cards)</section>
      <section>How it works (3 steps)</section>
      <footer>Copyright + links</footer>
    </div>
  );
}
```

**Dependencies**: Button, Card components (already exist)

---

#### ❌ Register Page (`src/app/(auth)/register/page.tsx`)

**Purpose**: User registration form

**Requirements**:
- Form fields:
  - Full Name (required, min 2 chars)
  - Email (required, valid email format)
  - Organization ID (required, integer)
    - Optional: Dropdown of existing orgs (P1)
  - Password (required, min 8 chars, 1 uppercase, 1 number)
  - Confirm Password (required, must match)
- Validations:
  - Real-time validation on blur
  - Show error messages below fields
  - Disable submit while invalid
- On success:
  - Store JWT token
  - Redirect to `/dashboard`
- Error handling:
  - "Email already exists"
  - "Organization not found"
  - "Server error"
- UI:
  - Card layout (matching login page style)
  - Link to login: "Already have an account?"

**Implementation Pattern**:
```tsx
// Use react-hook-form + zod for validation
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const registerSchema = z.object({
  fullName: z.string().min(2, 'Name too short'),
  email: z.string().email('Invalid email'),
  organizationId: z.number().min(1, 'Required'),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema)
  });
  const { mutate: registerUser, isPending } = useRegister();

  const onSubmit = (data) => registerUser(data);

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Fields with error displays */}
      </form>
    </Card>
  );
}
```

**Dependencies**: RegisterForm component (extract logic to `components/features/auth/register-form.tsx`)

---

#### ❌ Regulations Page (`src/app/(dashboard)/regulations/page.tsx`)

**Purpose**: Browse and search regulations library

**Requirements**:
- List view:
  - Table or grid of regulations
  - Columns: Title, Number, Category, Status, Last Updated
- Search:
  - Text input (debounced, 300ms)
  - Searches: title, number, category
- Filters:
  - Status dropdown: All, Active, Amended, Repealed, Draft
  - Category filter (P1)
  - Jurisdiction filter (P1)
- Actions per row:
  - "View" → `/regulations/[id]` (P1 page)
  - "Monitor" → Subscribe to updates (P1 feature)
- Pagination (if backend supports it)
- Loading skeleton while fetching
- Empty state: "No regulations found"

**Implementation Notes**:
```tsx
export default function RegulationsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: regulations, isLoading } = useRegulations({
    search: searchQuery,
    status: statusFilter !== 'all' ? statusFilter : undefined
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1>Regulations</h1>
        <Input 
          placeholder="Search regulations..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <Table>
        {/* Render regulations */}
      </Table>
    </div>
  );
}
```

**Dependencies**: Table component (shadcn, MISSING), useRegulations hook (needs enhancement)

---

#### ❌ Profile Page (`src/app/(dashboard)/profile/page.tsx`)

**Purpose**: View/edit user profile

**Requirements**:
- Display current user info:
  - Full Name
  - Email (read-only)
  - Role badge (admin, lawyer, etc.)
  - Organization ID
  - Created date
- Edit form:
  - Update full name
  - Update phone (optional)
  - Update bio (optional)
  - Change password (P1)
- Save button:
  - Shows loading state
  - Success toast notification
- Avatar display:
  - Shows initials (if no photo)
  - Upload photo (P1)

**Implementation Pattern**:
```tsx
export default function ProfilePage() {
  const { user } = useAuthStore();
  const { mutate: updateProfile } = useUpdateProfile();

  const { register, handleSubmit } = useForm({
    defaultValues: {
      fullName: user?.fullName,
      phone: user?.phone || '',
      bio: user?.bio || ''
    }
  });

  const onSubmit = (data) => {
    updateProfile(data, {
      onSuccess: () => {
        toast({ title: 'Profile updated successfully' });
      }
    });
  };

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Form fields */}
      </form>
    </Card>
  );
}
```

**Dependencies**: Avatar component (shadcn, MISSING)

---

#### ❌ Settings Page (`src/app/(dashboard)/settings/page.tsx`)

**Purpose**: App preferences and configuration

**Requirements**:
- **Appearance Section**:
  - Theme toggle: Light / Dark / System
  - Language selector: Arabic / English
  - Shows current selections
- **Notifications Section**:
  - Toggle switches:
    - "Case updates" (default: on)
    - "AI suggestions" (default: on)
    - "Regulation updates" (default: on)
  - Saves to Zustand + backend (optional)
- **Data & Privacy Section** (P1):
  - "Share usage analytics" toggle
  - "Export my data" button
- **About Section**:
  - App version
  - Link to docs/support

**Implementation Pattern**:
```tsx
export default function SettingsPage() {
  const { theme, setTheme, locale, setLocale, notifications, setNotifications } = useUIStore();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label>Theme</Label>
            <ThemeToggle />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label>Language</Label>
            <Select value={locale} onValueChange={setLocale}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Case Updates</Label>
            <Switch 
              checked={notifications.caseUpdates}
              onCheckedChange={(checked) => 
                setNotifications({ ...notifications, caseUpdates: checked })
              }
            />
          </div>
          {/* More toggles */}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Dependencies**: Switch, Separator, ThemeToggle (all MISSING), useUIStore (MISSING)

---

### 4.2 Missing Components (P0)

#### ❌ Auth Forms (`src/components/features/auth/`)

**Login Form** (`login-form.tsx`):
- Extract form logic from login page
- Props: `onSuccess?: () => void`
- Handles email/password validation
- Shows error states
- Returns reusable component

**Register Form** (`register-form.tsx`):
- Extract form logic from register page
- Props: `onSuccess?: () => void`
- Handles all field validations
- Shows error states
- Returns reusable component

**Why Extract**: Reusability (e.g., modal login, embedded forms)

---

#### ❌ Document Manager (`src/components/features/cases/document-manager.tsx`)

**Purpose**: Upload/list/download case documents

**Requirements**:
- **Upload Section**:
  - Drag-and-drop zone
  - File input button
  - Accepts: .pdf, .doc, .docx, .txt, .jpg, .png
  - Shows upload progress (P1)
  - Max file size: 10MB (configurable)
- **Documents List**:
  - Table with columns: Name, Size, Uploaded By, Date
  - Actions per row:
    - Download button
    - Delete button (with confirmation)
- **Empty State**: "No documents uploaded yet"
- **Loading State**: Skeleton while fetching

**Implementation Pattern**:
```tsx
interface DocumentManagerProps {
  caseId: number;
}

export function DocumentManager({ caseId }: DocumentManagerProps) {
  const { data: documents, isLoading } = useDocuments(caseId);
  const { mutate: uploadDocument, isPending: isUploading } = useUploadDocument(caseId);
  const { mutate: deleteDocument } = useDeleteDocument();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    uploadDocument(formData, {
      onSuccess: () => {
        toast({ title: 'Document uploaded successfully' });
      }
    });
  };

  return (
    <Card>
      <div className="border-dashed border-2 rounded-lg p-8 text-center">
        <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
        <p>Drag files here or click to browse</p>
        <input type="file" onChange={handleFileUpload} hidden />
      </div>

      {documents.length > 0 && (
        <Table>
          {documents.map(doc => (
            <tr key={doc.id}>
              <td>{doc.fileName}</td>
              <td>{formatFileSize(doc.fileSize)}</td>
              <td>{doc.uploadedBy.fullName}</td>
              <td>{formatDate(doc.createdAt)}</td>
              <td>
                <Button variant="ghost" onClick={() => downloadDocument(doc.id)}>
                  <Download />
                </Button>
                <Button variant="ghost" onClick={() => deleteDocument(doc.id)}>
                  <Trash />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
```

**Dependencies**: 
- API endpoints: `GET /api/cases/:id/documents`, `POST /api/cases/:id/documents`, `DELETE /api/documents/:id`
- Table component (MISSING)

---

#### ❌ AI Suggestions - Dismiss Action

**Current State**: AI suggestions panel exists, but "Dismiss" button does nothing

**Required Enhancement**: Implement dismiss functionality

**Location**: `src/components/features/cases/ai-suggestions.tsx`

**Implementation**:
```tsx
// Add to existing component
const { mutate: dismissLink } = useDismissLink();

// Update button onClick
<Button 
  variant="ghost" 
  onClick={() => dismissLink(link.id, {
    onSuccess: () => {
      queryClient.invalidateQueries(['ai-links', caseId]);
      toast({ title: 'Suggestion dismissed' });
    }
  })}
>
  ✗ Dismiss
</Button>
```

**New Hook Required** (`src/lib/hooks/use-ai-links.ts`):
```typescript
export function useDismissLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: number) => {
      await apiClient.delete(`/api/ai-links/${linkId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['ai-links']);
    }
  });
}
```

---

#### ❌ Theme Toggle (`src/components/layout/theme-toggle.tsx`)

**Purpose**: Switch between light/dark/system themes

**Requirements**:
- Shows current theme icon (Sun/Moon)
- Click toggles: light ↔ dark
- Updates Zustand store + applies to DOM
- Persists across sessions

**Implementation**:
```tsx
import { Moon, Sun } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useUIStore();

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <Button variant="outline" size="sm" onClick={toggleTheme}>
      {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </Button>
  );
}
```

**Dependencies**: useUIStore (MISSING)

---

### 4.3 Missing UI Primitives (P0)

**Install Command**:
```bash
npx shadcn@latest add dialog table toast dropdown-menu avatar separator switch checkbox alert-dialog progress skeleton
```

**Usage Locations**:
- `dialog` → Modals (delete confirmation, add regulation)
- `table` → Regulations list, documents list
- `toast` → Notifications (success/error messages)
- `dropdown-menu` → User menu, row actions
- `avatar` → Profile page, user badge
- `separator` → Settings sections divider
- `switch` → Settings toggles
- `checkbox` → Bulk actions (P1)

---

### 4.4 Missing State/Types/Utils (P0)

#### ❌ API Endpoints (`src/lib/api/endpoints.ts`)

**Purpose**: Centralize all API URLs (avoid hardcoding)

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export const endpoints = {
  // Auth
  auth: {
    login: `${API_BASE}/api/auth/login`,
    register: `${API_BASE}/api/auth/register`,
    logout: `${API_BASE}/api/auth/logout`,
    me: `${API_BASE}/api/auth/me`,
  },
  // Cases
  cases: {
    list: `${API_BASE}/api/cases`,
    detail: (id: number) => `${API_BASE}/api/cases/${id}`,
    create: `${API_BASE}/api/cases`,
    update: (id: number) => `${API_BASE}/api/cases/${id}`,
    delete: (id: number) => `${API_BASE}/api/cases/${id}`,
  },
  // Regulations
  regulations: {
    list: `${API_BASE}/api/regulations`,
    detail: (id: number) => `${API_BASE}/api/regulations/${id}`,
    search: `${API_BASE}/api/regulations/search`,
    subscribe: `${API_BASE}/api/regulations/subscribe`,
  },
  // AI Links
  aiLinks: {
    list: (caseId: number) => `${API_BASE}/api/ai-links/${caseId}`,
    generate: (caseId: number) => `${API_BASE}/api/ai-links/${caseId}/generate`,
    verify: (linkId: number) => `${API_BASE}/api/ai-links/${linkId}/verify`,
    dismiss: (linkId: number) => `${API_BASE}/api/ai-links/${linkId}`,
  },
  // Documents
  documents: {
    list: (caseId: number) => `${API_BASE}/api/cases/${caseId}/documents`,
    upload: (caseId: number) => `${API_BASE}/api/cases/${caseId}/documents`,
    download: (docId: number) => `${API_BASE}/api/documents/${docId}/download`,
    delete: (docId: number) => `${API_BASE}/api/documents/${docId}`,
  },
} as const;
```

---

#### ❌ UI Store (`src/lib/store/ui-store.ts`)

**Purpose**: Manage client-side UI preferences

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Notifications {
  caseUpdates: boolean;
  aiSuggestions: boolean;
  regulationUpdates: boolean;
}

interface UIState {
  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Locale
  locale: 'en' | 'ar';
  setLocale: (locale: 'en' | 'ar') => void;

  // Layout
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Notifications
  notifications: Notifications;
  setNotifications: (notifications: Notifications) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Defaults
      theme: 'system',
      locale: 'ar', // Arabic default
      sidebarCollapsed: false,
      notifications: {
        caseUpdates: true,
        aiSuggestions: true,
        regulationUpdates: true,
      },

      // Actions
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => {
        set({ locale });
        // Update DOM
        document.documentElement.lang = locale;
        document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
      },
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setNotifications: (notifications) => set({ notifications }),
    }),
    {
      name: 'ui-storage', // localStorage key
    }
  )
);
```

---

#### ❌ Format Utilities (`src/lib/utils/format.ts`)

**Purpose**: Consistent date/number/currency formatting

```typescript
import { format as dateFnsFormat, formatDistance, formatRelative } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';

// Date formatting
export const format = {
  date: (date: Date | string, formatStr = 'PPP', locale: 'ar' | 'en' = 'en') => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateFnsFormat(dateObj, formatStr, {
      locale: locale === 'ar' ? ar : enUS,
    });
  },

  relative: (date: Date | string, locale: 'ar' | 'en' = 'en') => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return formatDistance(dateObj, new Date(), {
      addSuffix: true,
      locale: locale === 'ar' ? ar : enUS,
    });
  },

  fileSize: (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },

  currency: (amount: number, locale: 'ar' | 'en' = 'en'): string => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
      style: 'currency',
      currency: 'SAR',
    }).format(amount);
  },

  caseNumber: (number: string | number): string => {
    return `#${number}`;
  },
};
```

---

#### ❌ RTL Utilities (`src/lib/utils/rtl.ts`)

**Purpose**: Helper functions for RTL layout

```typescript
export function isRTL(locale: string): boolean {
  return locale === 'ar';
}

export function getDirection(locale: string): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

// Direction-aware class names
export function rtl(locale: string, ltrClass: string, rtlClass: string): string {
  return isRTL(locale) ? rtlClass : ltrClass;
}

// CSS logical properties helpers
export const logical = {
  marginStart: (value: string) => ({ marginInlineStart: value }),
  marginEnd: (value: string) => ({ marginInlineEnd: value }),
  paddingStart: (value: string) => ({ paddingInlineStart: value }),
  paddingEnd: (value: string) => ({ paddingInlineEnd: value }),
  start: (value: string) => ({ insetInlineStart: value }),
  end: (value: string) => ({ insetInlineEnd: value }),
};
```

---

## PART 5: DOMAIN MODEL ALIGNMENT (CRITICAL)

### 5.1 Case Statuses (MUST MATCH BACKEND)

**TypeScript Enum**:
```typescript
export enum CaseStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  PENDING_HEARING = 'pending_hearing',
  CLOSED = 'closed',
  ARCHIVED = 'archived'
}
```

**UI Display**:
```typescript
export const CASE_STATUS_CONFIG = {
  open: {
    label: { ar: 'مفتوح', en: 'Open' },
    color: 'blue',
    icon: FolderOpen,
  },
  in_progress: {
    label: { ar: 'قيد التنفيذ', en: 'In Progress' },
    color: 'yellow',
    icon: Clock,
  },
  pending_hearing: {
    label: { ar: 'في انتظار الجلسة', en: 'Pending Hearing' },
    color: 'orange',
    icon: Calendar,
  },
  closed: {
    label: { ar: 'مغلق', en: 'Closed' },
    color: 'green',
    icon: CheckCircle,
  },
  archived: {
    label: { ar: 'مؤرشف', en: 'Archived' },
    color: 'gray',
    icon: Archive,
  },
};
```

**Badge Component Usage**:
```tsx
<Badge variant={CASE_STATUS_CONFIG[case.status].color}>
  {CASE_STATUS_CONFIG[case.status].label[locale]}
</Badge>
```

### 5.2 RBAC Roles (MUST MATCH BACKEND)

**TypeScript Enum**:
```typescript
export enum UserRole {
  ADMIN = 'admin',
  SENIOR_LAWYER = 'senior_lawyer',
  LAWYER = 'lawyer',
  PARALEGAL = 'paralegal',
  CLERK = 'clerk'
}
```

**Permissions Check Hook**:
```typescript
// src/lib/hooks/use-permission.ts
import { useAuthStore } from '@/lib/store/auth-store';

const PERMISSIONS = {
  admin: ['*'], // All permissions
  senior_lawyer: ['cases.*', 'regulations.read', 'ai-links.verify'],
  lawyer: ['cases.*', 'regulations.read', 'ai-links.verify'],
  paralegal: ['cases.create', 'cases.read', 'cases.update', 'regulations.read'],
  clerk: ['cases.create', 'cases.read', 'regulations.read'],
} as const;

export function usePermission() {
  const user = useAuthStore(state => state.user);

  const can = (permission: string): boolean => {
    if (!user) return false;
    const userPerms = PERMISSIONS[user.role] || [];
    return userPerms.includes('*') || userPerms.includes(permission);
  };

  return { can };
}
```

**Usage in Components**:
```tsx
const { can } = usePermission();

{can('ai-links.verify') && (
  <Button onClick={() => verifyLink(linkId)}>
    ✓ Verify
  </Button>
)}

{can('cases.delete') && (
  <Button variant="destructive" onClick={() => deleteCase(caseId)}>
    Delete
  </Button>
)}
```

---

## PART 6: ARABIC/RTL REQUIREMENTS (NON-NEGOTIABLE)

### 6.1 RTL Layout Rules

**1. Default Direction**: All pages load with `dir="rtl"` when locale is Arabic

**2. Logical Properties**: Use CSS logical properties instead of left/right

```css
/* ❌ Wrong - Hardcoded direction */
.sidebar {
  margin-left: 1rem;
  border-right: 1px solid gray;
  text-align: left;
}

/* ✅ Correct - Direction-agnostic */
.sidebar {
  margin-inline-start: 1rem;
  border-inline-end: 1px solid gray;
  text-align: start;
}
```

**3. Icon Mirroring**: Chevrons and arrows should flip in RTL

```tsx
// Use Tailwind's rtl: prefix
<ChevronRight className="rtl:rotate-180" />

// Or conditionally render
{locale === 'ar' ? <ChevronLeft /> : <ChevronRight />}
```

**4. Table Reading Order**: Tables read right-to-left in Arabic

```tsx
<Table dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <thead>
    <tr>
      <th>العنوان</th>  {/* Rightmost in Arabic */}
      <th>الحالة</th>
      <th>التاريخ</th>  {/* Leftmost in Arabic */}
    </tr>
  </thead>
</Table>
```

**5. Form Alignment**: Labels and inputs align correctly per direction

```tsx
<div className="flex items-center gap-2">
  <Label className="text-start">{t('name')}</Label>
  <Input className="text-start" />
</div>
```

### 6.2 Translation Strategy

**Rule**: NO hardcoded text in components

**Approach**: Translation keys only

```tsx
// ❌ Wrong
<Button>Create Case</Button>

// ✅ Correct
<Button>{t('cases.create')}</Button>

// Translation files (simplified)
// src/locales/ar.json
{
  "cases": {
    "create": "إنشاء قضية",
    "list": "القضايا",
    "details": "تفاصيل القضية"
  }
}

// src/locales/en.json
{
  "cases": {
    "create": "Create Case",
    "list": "Cases",
    "details": "Case Details"
  }
}
```

**Implementation** (Simplified - P1 for full i18n):
```typescript
// src/lib/utils/i18n.ts
import { useUIStore } from '@/lib/store/ui-store';
import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

const translations = { ar, en };

export function useTranslation() {
  const locale = useUIStore(state => state.locale);

  const t = (key: string): string => {
    const keys = key.split('.');
    let value: any = translations[locale];
    for (const k of keys) {
      value = value?.[k];
    }
    return value || key; // Fallback to key if missing
  };

  return { t, locale };
}
```

### 6.3 RTL QA Checklist

Before marking a page "done", verify:

- [ ] Page direction (`dir="rtl"`) applied when Arabic
- [ ] Text alignment is start-aligned (not left/right)
- [ ] Margins/padding use logical properties
- [ ] Icons (arrows, chevrons) flip correctly
- [ ] Tables read right-to-left in Arabic
- [ ] Forms labels align with inputs
- [ ] Sidebar on correct side (right in RTL)
- [ ] Dropdown menus open in correct direction
- [ ] Tooltips position correctly
- [ ] Modal dialogs center correctly

---

## PART 7: REALTIME UX PATTERNS (SOCKET.IO)

### 7.1 WebSocket Connection Setup

**Initialization** (`src/lib/hooks/use-websocket.ts`):
```typescript
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';

let socket: Socket | null = null;

export function useWebSocket() {
  const token = useAuthStore(state => state.token);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    // Connect socket
    socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection events
    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected us, reconnect manually
        socket?.connect();
      }
    });

    // Business events
    socket.on('case_created', (data) => {
      queryClient.invalidateQueries(['cases']);
      toast({
        title: 'New Case Created',
        description: `Case #${data.caseNumber} added`,
      });
    });

    socket.on('case_updated', (data) => {
      queryClient.invalidateQueries(['cases']);
      queryClient.invalidateQueries(['case', data.caseId]);
    });

    socket.on('case_links_refreshed', (data) => {
      queryClient.invalidateQueries(['ai-links', data.caseId]);
      toast({
        title: 'AI Suggestions Updated',
        description: `${data.count} new regulation links available`,
        action: {
          label: 'View',
          onClick: () => window.location.href = `/cases/${data.caseId}?tab=ai`,
        },
      });
    });

    socket.on('regulation_updated', (data) => {
      queryClient.invalidateQueries(['regulations']);
      toast({
        title: 'Regulation Updated',
        description: `"${data.title}" has a new version`,
      });
    });

    socket.on('document_uploaded', (data) => {
      queryClient.invalidateQueries(['documents', data.caseId]);
    });

    // Cleanup on unmount
    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token, queryClient]);
}
```

**Usage in Root Layout**:
```tsx
// src/app/(dashboard)/layout.tsx
'use client';

import { useWebSocket } from '@/lib/hooks/use-websocket';

export default function DashboardLayout({ children }) {
  useWebSocket(); // ← Initialize once at layout level

  return (
    <div className="flex">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}
```

### 7.2 Event Types (Must Listen For)

| Event Name | Trigger | Expected Action |
|------------|---------|-----------------|
| `case_created` | New case added | Invalidate cases list query, show toast |
| `case_updated` | Case metadata changed | Invalidate case detail query |
| `case_links_refreshed` | AI generated new suggestions | Invalidate ai-links query, show toast with "View" action |
| `regulation_updated` | Regulation version changed | Invalidate regulations query, show toast |
| `document_uploaded` | New document added | Invalidate documents query |
| `user_added` | New user invited (admin only) | Invalidate users query (P1) |

### 7.3 Toast Notification Patterns

**Success Toast** (green):
```typescript
toast({
  title: 'Success',
  description: 'Case created successfully',
  variant: 'default', // Green checkmark
});
```

**Info Toast** (blue):
```typescript
toast({
  title: 'AI Suggestions Ready',
  description: '8 new regulation links found',
  action: {
    label: 'View',
    onClick: () => router.push(`/cases/${caseId}?tab=ai`),
  },
});
```

**Warning Toast** (yellow):
```typescript
toast({
  title: 'Regulation Updated',
  description: 'Labor Law has a new version',
  variant: 'warning',
});
```

**Error Toast** (red):
```typescript
toast({
  title: 'Connection Lost',
  description: 'Reconnecting to server...',
  variant: 'destructive',
});
```

---

## PART 8: ACCEPTANCE CRITERIA (V1 RELEASE)

### Release Checklist

**Functionality** (All must work):
- [ ] User can register and login
- [ ] JWT token persists across browser refresh
- [ ] Protected routes redirect to login if not authenticated
- [ ] Cases list loads with correct data
- [ ] Case create form submits successfully
- [ ] Case details page shows all tabs (Details, AI, Documents)
- [ ] AI suggestions display with scores
- [ ] Verify button marks suggestion as verified
- [ ] Dismiss button removes suggestion from list
- [ ] Document upload works (shows in list)
- [ ] Document download triggers file download
- [ ] Regulations list loads and is searchable
- [ ] Settings page saves theme and locale
- [ ] Theme toggle switches between light/dark
- [ ] Locale switcher updates UI language
- [ ] WebSocket connection established on login
- [ ] Toast notifications appear on events
- [ ] Case list auto-refreshes on `case_created` event

**Arabic RTL** (All pages must work in Arabic):
- [ ] Landing page displays correctly in RTL
- [ ] Login/register forms align correctly
- [ ] Dashboard stats cards read right-to-left
- [ ] Cases list table reads right-to-left
- [ ] Case details tabs align correctly
- [ ] Sidebar is on the right side
- [ ] Dropdown menus open in correct direction
- [ ] Icons (chevrons, arrows) flip correctly

**Performance**:
- [ ] Initial page load < 3 seconds
- [ ] Case list renders within 500ms
- [ ] No console errors in browser
- [ ] No TypeScript compilation errors
- [ ] Images optimized (using next/image)

**Security**:
- [ ] JWT token not exposed in URLs
- [ ] API calls include Authorization header
- [ ] HTTPS enforced in production
- [ ] CORS configured correctly

**Mobile Responsive**:
- [ ] All pages usable on mobile (320px width)
- [ ] Sidebar collapses on mobile
- [ ] Forms stack vertically on small screens
- [ ] Tables scroll horizontally if needed

---

## PART 9: IMPLEMENTATION PRIORITY ORDER

### Week 1: Critical Pages (P0)
1. **Day 1-2**: Landing page + Register page
2. **Day 3-4**: Regulations page (list + search)
3. **Day 5**: Profile page + Settings page basic structure

### Week 2: Core Components (P0)
1. **Day 1**: Install missing shadcn components (dialog, table, etc.)
2. **Day 2-3**: Document manager component
3. **Day 4**: AI dismiss action
4. **Day 5**: Theme toggle + locale switcher

### Week 3: State & Utils (P0)
1. **Day 1**: API endpoints centralization
2. **Day 2**: UI store (Zustand)
3. **Day 3**: Format utilities
4. **Day 4**: RTL utilities
5. **Day 5**: Type definitions (auth, regulation, document)

### Week 4: Polish & Testing
1. **Day 1-2**: Arabic translations for all pages
2. **Day 3**: RTL QA on all pages
3. **Day 4**: Fix bugs, improve UX
4. **Day 5**: Final testing + documentation

---

## PART 10: REGULATION MONITORING UX (DETAILED)

### 10.1 User Flow

**Step 1: Discovery**
```
User → Regulations page → Search "Labor Law" → Find regulation
```

**Step 2: Subscribe**
```
User → Click "🔔 Monitor Updates" button → Modal appears:
  Title: Monitor Regulation Updates
  Fields:
    - Regulation: "Saudi Labor Law" (pre-filled, read-only)
    - Source URL: https://laws.moj.gov.sa/... (auto-filled by backend)
    - Check Interval: [Dropdown: 12h, 24h, 48h, Weekly]
    - Notifications: [Toggle: Browser, Email (P1)]
  Buttons: [Enable Monitoring] [Cancel]
```

**Step 3: Confirmation**
```
Toast: "Now monitoring updates for Saudi Labor Law"
Badge appears: "🔔 Monitored" on regulation card
```

**Step 4: Update Detection (Backend Automatic)**
```
Backend cron job detects change → Creates new version → Emits WebSocket
```

**Step 5: User Notification**
```
WebSocket event → Toast appears:
  Title: "Regulation Updated"
  Description: "Saudi Labor Law has a new version"
  Actions: [View Changes] [Dismiss]
```

**Step 6: View Changes (P1)**
```
User clicks "View Changes" → Regulation detail page:
  - Version dropdown: "v2 (Latest)" vs "v1"
  - Diff view: Shows added/removed/modified sections
  - Effective date: "Effective from: 2026-01-15"
```

### 10.2 UI Components Needed

**Regulations List Page** - Add monitor button per row:
```tsx
<Table>
  <tbody>
    {regulations.map(reg => (
      <tr key={reg.id}>
        <td>{reg.title}</td>
        <td>{reg.status}</td>
        <td>
          {reg.isMonitored ? (
            <Badge variant="outline">🔔 Monitored</Badge>
          ) : (
            <Button variant="ghost" onClick={() => openMonitorDialog(reg)}>
              🔔 Monitor
            </Button>
          )}
        </td>
      </tr>
    ))}
  </tbody>
</Table>
```

**Monitor Dialog** (using `<Dialog>` from shadcn):
```tsx
<Dialog open={showMonitorDialog} onOpenChange={setShowMonitorDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Monitor Regulation Updates</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div>
        <Label>Regulation</Label>
        <Input value={selectedRegulation.title} disabled />
      </div>
      <div>
        <Label>Check Interval</Label>
        <Select value={interval} onValueChange={setInterval}>
          <option value="12">Every 12 hours</option>
          <option value="24">Daily</option>
          <option value="168">Weekly</option>
        </Select>
      </div>
      <div className="flex items-center space-x-2">
        <Switch checked={notifyBrowser} onCheckedChange={setNotifyBrowser} />
        <Label>Browser notifications</Label>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowMonitorDialog(false)}>
        Cancel
      </Button>
      <Button onClick={handleMonitor}>
        Enable Monitoring
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Settings Page** - Manage subscriptions:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Monitored Regulations ({subscriptions.length})</CardTitle>
  </CardHeader>
  <CardContent>
    {subscriptions.length === 0 ? (
      <p className="text-muted-foreground">
        No regulations being monitored yet
      </p>
    ) : (
      <div className="space-y-2">
        {subscriptions.map(sub => (
          <div key={sub.id} className="flex items-center justify-between border p-3 rounded">
            <div>
              <p className="font-medium">{sub.regulation.title}</p>
              <p className="text-sm text-muted-foreground">
                Last checked: {formatRelative(sub.lastCheckedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={sub.isActive ? 'default' : 'secondary'}>
                {sub.isActive ? 'Active' : 'Paused'}
              </Badge>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => toggleSubscription(sub.id)}
              >
                {sub.isActive ? 'Pause' : 'Resume'}
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => deleteSubscription(sub.id)}
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </CardContent>
</Card>
```

### 10.3 Professional Terminology (Report-Ready)

When documenting regulation monitoring, use these terms:

| ❌ Avoid | ✅ Use Instead |
|----------|---------------|
| "web scraping" | "Automated source synchronization" |
| "checking for changes" | "Content integrity verification" |
| "scraping the website" | "Periodic resource fetching" |
| "using a bot" | "Scheduled synchronization agent" |
| "downloading files" | "Ingesting regulatory documents" |
| "searching the web" | "Intelligent resource discovery (Tavily API)" |
| "hashing content" | "Cryptographic integrity checks (SHA-256)" |
| "HEAD request" | "HTTP metadata validation" |

**Example Report Sentence**:
> "The system implements an automated source synchronization pipeline that performs periodic integrity checks using cryptographic hashing (SHA-256) to detect content changes, combined with intelligent resource discovery via the Tavily API for initial regulation URL identification."

---

**END OF WEB FRONTEND CONTEXT**

*This document provides complete web frontend implementation context including PRD requirements, technical stack, missing features backlog, and acceptance criteria. Use this as the primary reference for Next.js 14 development work.*
