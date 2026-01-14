# 🎨 LCMS Web Frontend — Figma Design Refactoring Plan

**Document Type**: Design Integration & Refactoring Plan  
**Version**: 1.1  
**Date**: 2026-01-12  
**Source Design**: `context/LCMS - Test Locale after integration (1)/` (Figma Export)  
**Target**: Next.js 14 App Router + shadcn/ui + TanStack Query + Zustand

---

## 📋 Implementation Decisions Summary

| Decision           | Choice                | Notes                     |
| ------------------ | --------------------- | ------------------------- |
| **Brand Name**     | Madar / مدار          | May change later          |
| **Navigation**     | Bottom dock only      | Replace sidebar entirely  |
| **Clients Module** | Full implementation   | Complete CRUD             |
| **Settings**       | All tabs functional   | 6 tabs with full features |
| **RBAC Simulator** | Include in production | For demos                 |
| **Animations**     | Subtle transitions    | Performance-focused       |

---

## Executive Summary

This plan outlines the systematic refactoring of the current Next.js 14 website to match the new Figma-exported design specifications. The refactoring focuses on **design implementation only** — extracting visual language, interaction patterns, and UX specifications from the Figma code while maintaining the existing technical architecture (Next.js 14 App Router + shadcn/ui + TanStack Query + Zustand).

### Key Design Changes Overview

| Aspect         | Current Design               | New Figma Design               |
| -------------- | ---------------------------- | ------------------------------ |
| **Brand Name** | Legal CMS                    | **Madar** / **مدار**           |
| Navigation     | Left sidebar (fixed)         | Bottom floating dock           |
| Header         | Light with contextual titles | Dark navy with brand logo      |
| Color Primary  | Blue (#3b82f6)               | Navy (#0F2942)                 |
| Color Accent   | Blue variants                | Orange (#D97706)               |
| Typography     | System fonts                 | Serif headings + Sans body     |
| Cards          | Simple borders               | Rich shadows + rounded corners |
| Interactions   | Basic hover                  | Subtle transitions + tooltips  |

---

## Part 1: Design System Extraction

### 1.1 Color Palette (Design Tokens)

**Primary Colors** (from Figma `App.tsx` BRAND constants + `index.css`):

| Token Name           | Hex Value | CSS Variable                 | Usage                                                      |
| -------------------- | --------- | ---------------------------- | ---------------------------------------------------------- |
| `brand-primary`      | `#0F2942` | `--color-brand-primary`      | Headers, primary buttons, active states, navy accents      |
| `brand-accent`       | `#D97706` | `--color-brand-accent`       | CTAs, highlights, badges, hover accents, active indicators |
| `brand-accent-hover` | `#B45309` | `--color-brand-accent-hover` | Hover states for accent buttons                            |
| `brand-secondary`    | `#1E3A56` | `--color-brand-secondary`    | Darker backgrounds, borders, secondary elements            |
| `brand-tertiary`     | `#2A4D70` | `--color-brand-tertiary`     | Input focus borders, subtle dividers                       |
| `surface-background` | `#f8fafc` | `--color-surface-bg`         | Main page background (slate-50)                            |
| `surface-card`       | `#ffffff` | `--color-surface-card`       | Card backgrounds                                           |
| `text-primary`       | `#0F2942` | `--color-text-primary`       | Primary headings and text                                  |
| `text-muted`         | `#64748b` | `--color-text-muted`         | Secondary text, descriptions (slate-500)                   |

**Semantic Colors**:

| Purpose | Background               | Text                      | Border       |
| ------- | ------------------------ | ------------------------- | ------------ |
| Success | `green-50` / `green-100` | `green-600` / `green-700` | `green-200`  |
| Warning | `orange-50`              | `#D97706`                 | `orange-100` |
| Error   | `red-50`                 | `red-500` / `red-600`     | `red-200`    |
| Info    | `blue-50`                | `blue-600` / `blue-700`   | `blue-200`   |

### 1.2 Typography Scale

From the Figma design:

| Element       | Font Family | Size              | Weight         | Line Height | Notes                                     |
| ------------- | ----------- | ----------------- | -------------- | ----------- | ----------------------------------------- |
| Page Title    | Serif       | `text-3xl` (30px) | Bold (700)     | 1.2         | Used in page headers                      |
| Section Title | Sans-serif  | `text-xl` (20px)  | Bold (700)     | 1.3         | Card headers, section labels              |
| Card Title    | Sans-serif  | `text-lg` (18px)  | Semibold (600) | 1.4         | Stat cards, list items                    |
| Body Text     | Sans-serif  | `text-sm` (14px)  | Regular (400)  | 1.5         | General content                           |
| Small Text    | Sans-serif  | `text-xs` (12px)  | Medium (500)   | 1.4         | Timestamps, metadata                      |
| Micro Text    | Sans-serif  | `text-[10px]`     | Bold (700)     | 1.2         | Badges, labels, uppercase tracking-widest |
| Stat Value    | Serif       | `text-4xl` (36px) | Bold (700)     | 1.1         | Dashboard stat numbers                    |

**Font Families to Configure**:

```css
/* In src/app/globals.css */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');

:root {
  --font-serif: 'Playfair Display', Georgia, serif;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
}

/* Apply in Tailwind config */
fontFamily: {
  sans: ['var(--font-sans)'],
  serif: ['var(--font-serif)'],
}
```

### 1.3 Spacing & Border Radius

| Token         | Tailwind Class | Value  | Usage                                        |
| ------------- | -------------- | ------ | -------------------------------------------- |
| `radius-sm`   | `rounded-md`   | 6px    | Small buttons, inputs                        |
| `radius-md`   | `rounded-lg`   | 8px    | Standard cards                               |
| `radius-lg`   | `rounded-xl`   | 12px   | Navigation items, modals                     |
| `radius-xl`   | `rounded-2xl`  | 16px   | Main containers, stat cards                  |
| `radius-full` | `rounded-full` | 9999px | Avatars, circular buttons, pills, search bar |

### 1.4 Shadow System

```css
/* Design shadows from Figma - Add to globals.css or Tailwind config */
:root {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 /
          0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  --shadow-accent: 0 4px 14px -3px rgb(217 119 6 / 0.3); /* Orange shadow for accent buttons */
  --shadow-dock: 0 25px 50px -12px rgb(0 0 0 / 0.25); /* For navigation dock */
  --shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
}
```

### 1.5 Animation & Transition Specifications

**Note: Per Decision #6, we implement subtle transitions only (not complex animations)**

| Effect            | CSS                               | Usage                  | Priority   |
| ----------------- | --------------------------------- | ---------------------- | ---------- |
| Color Transition  | `transition-colors duration-200`  | Links, buttons, icons  | ✅ Include |
| All Properties    | `transition-all duration-300`     | Cards, containers      | ✅ Include |
| Opacity           | `transition-opacity duration-200` | Tooltips, hover states | ✅ Include |
| Scale on Click    | `active:scale-95`                 | Buttons                | ✅ Include |
| Subtle Hover Lift | `hover:-translate-y-0.5`          | CTA buttons only       | ✅ Include |
| ~~Fade In~~       | ~~`animate-in fade-in`~~          | ~~Page transitions~~   | ⏭️ Skip    |
| ~~Slide In~~      | ~~`slide-in-from-bottom`~~        | ~~Dock entrance~~      | ⏭️ Skip    |
| ~~Zoom In~~       | ~~`zoom-in-95`~~                  | ~~Modals~~             | ⏭️ Skip    |

**Recommended transition base class for components:**

```css
.transition-base {
  transition-property: color, background-color, border-color, opacity, transform;
  transition-timing-function: ease-out;
  transition-duration: 200ms;
}
```

---

## Part 2: Layout Architecture Changes

### 2.1 Layout Structure Comparison

**Current Layout** (`src/app/(dashboard)/layout.tsx`):

```
┌─────────────────────────────────────────────────────────┐
│ ┌──────────┐ ┌────────────────────────────────────────┐ │
│ │          │ │              HEADER                    │ │
│ │          │ ├────────────────────────────────────────┤ │
│ │ SIDEBAR  │ │                                        │ │
│ │ (256px)  │ │            MAIN CONTENT                │ │
│ │          │ │                                        │ │
│ │          │ │                                        │ │
│ └──────────┘ └────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**New Layout** (Figma Design):

```
┌─────────────────────────────────────────────────────────┐
│                    DARK HEADER (h-20)                   │
│  [🔶 Brand]     [    Search Bar    ]    [🔔][⚙️][👤]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                                                         │
│                    MAIN CONTENT                         │
│                  (bg-[#f8fafc])                         │
│                  (pb-32 for dock)                       │
│                                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
              ┌─────────────────────────────┐
              │    FLOATING NAV DOCK        │
              │ [📊][📁] ⚖️ [📖][👥][🔔]    │
              │    (fixed bottom-8)         │
              └─────────────────────────────┘
```

### 2.2 New Layout Implementation

**File**: `src/app/(dashboard)/layout.tsx`

```tsx
// NEW STRUCTURE
import { Header } from "@/components/layout/header";
import { NavigationDock } from "@/components/layout/navigation-dock";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <Header />

      <main className="flex-1 overflow-y-auto pb-32">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      <NavigationDock />
    </div>
  );
}
```

### 2.3 Files to Create/Modify

| File                                        | Action     | Description                             |
| ------------------------------------------- | ---------- | --------------------------------------- |
| `src/components/layout/header.tsx`          | **Modify** | Dark header with brand, search, actions |
| `src/components/layout/sidebar.tsx`         | **Delete** | No longer needed                        |
| `src/components/layout/navigation-dock.tsx` | **Create** | New floating bottom navigation          |
| `src/app/(dashboard)/layout.tsx`            | **Modify** | Remove sidebar, add dock                |

---

## Part 3: Component Specifications

### 3.1 Header Component Redesign

**File**: `src/components/layout/header.tsx`

**Visual Specifications**:

| Property   | Value                       |
| ---------- | --------------------------- |
| Height     | `h-20` (80px)               |
| Background | `bg-[#0F2942]`              |
| Border     | `border-b border-[#1E3A56]` |
| Position   | `sticky top-0 z-40`         |
| Shadow     | `shadow-md`                 |

**Structure**:

```tsx
<header className="h-20 bg-[#0F2942] border-b border-[#1E3A56] sticky top-0 z-40 flex items-center justify-between px-8 shadow-md">
  {/* Left: Brand Logo */}
  <div className="flex items-center gap-3 cursor-pointer group">
    <div
      className="bg-[#D97706] p-2 rounded-lg shadow-lg shadow-orange-900/20 
                    group-hover:bg-white transition-all duration-300"
    >
      <Scale className="h-5 w-5 text-white group-hover:text-[#D97706]" />
    </div>
    <div>
      {/* Brand: "Madar" (EN) / "مدار" (AR) */}
      <h1 className="font-bold text-xl tracking-wide text-white">
        {locale === "ar" ? "مدار" : "Madar"}
      </h1>
      <p className="text-[10px] text-blue-200/80 font-medium tracking-widest uppercase">
        {locale === "ar" ? "إدارة القضايا" : "Case Management"}
      </p>
    </div>
  </div>

  {/* Center: Search Bar */}
  <div
    className="hidden md:flex items-center bg-[#1E3A56] rounded-full px-4 py-2.5 w-96 
                  border border-[#2A4D70] focus-within:border-[#D97706] 
                  focus-within:bg-[#152e46] transition-all group"
  >
    <Search className="h-4 w-4 text-blue-300 mr-2 group-focus-within:text-[#D97706]" />
    <input
      type="text"
      placeholder="Search cases, regulations, or documents..."
      className="bg-transparent border-none outline-none text-sm w-full text-white 
                 placeholder:text-blue-300/50"
    />
  </div>

  {/* Right: Actions */}
  <div className="flex items-center gap-6">
    <div className="flex items-center gap-2">
      {/* Notifications */}
      <button
        className="relative p-2 hover:bg-[#1E3A56] rounded-full 
                         text-blue-200 hover:text-white transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 w-2.5 h-2.5 
                           bg-[#D97706] rounded-full border-2 border-[#0F2942]"
          />
        )}
      </button>

      {/* Settings */}
      <button
        className="p-2 hover:bg-[#1E3A56] rounded-full 
                         text-blue-200 hover:text-white transition-colors"
      >
        <Settings className="h-5 w-5" />
      </button>
    </div>

    <div className="h-8 w-px bg-[#1E3A56]" />

    {/* User Profile */}
    <div
      className="flex items-center gap-3 cursor-pointer hover:bg-[#1E3A56] 
                    p-1.5 pr-3 rounded-full border border-transparent 
                    hover:border-[#2A4D70] transition-all"
    >
      <div
        className="w-9 h-9 rounded-full bg-white text-[#0F2942] 
                      flex items-center justify-center font-bold text-sm 
                      shadow-md ring-2 ring-[#D97706]/20"
      >
        {userInitials}
      </div>
      <div className="hidden lg:block text-right">
        <p className="text-sm font-bold text-white leading-none">{userName}</p>
        <p className="text-[10px] text-blue-200 font-medium mt-1">{userRole}</p>
      </div>
    </div>
  </div>
</header>
```

### 3.2 Navigation Dock Component (NEW)

**File**: `src/components/layout/navigation-dock.tsx`

**Visual Specifications**:

| Property      | Value                                             |
| ------------- | ------------------------------------------------- |
| Position      | `fixed bottom-8 left-1/2 -translate-x-1/2 z-50`   |
| Background    | `bg-[#0F2942]/95 backdrop-blur-xl`                |
| Border        | `border border-[#1E3A56] ring-1 ring-white/10`    |
| Padding       | `p-2`                                             |
| Border Radius | `rounded-2xl`                                     |
| Shadow        | `shadow-2xl`                                      |
| Animation     | `animate-in slide-in-from-bottom-10 duration-500` |

**Dock Item Specifications**:

| State   | Background    | Text Color       |
| ------- | ------------- | ---------------- |
| Default | Transparent   | `text-slate-300` |
| Hover   | `bg-white/5`  | `text-white`     |
| Active  | `bg-white/10` | `text-[#D97706]` |

**Center Action Button**:

```tsx
<button
  className="bg-gradient-to-tr from-[#D97706] to-[#B45309] 
                   hover:from-[#B45309] hover:to-[#92400e] 
                   text-white p-3.5 rounded-xl 
                   shadow-lg shadow-orange-900/30 
                   transition-all hover:scale-105 active:scale-95 
                   flex items-center justify-center 
                   border border-white/10"
>
  <Scale className="h-6 w-6" fill="currentColor" />
</button>
```

**Tooltip Design**:

```tsx
<span
  className="absolute -top-14 left-1/2 transform -translate-x-1/2 
                 bg-[#0F2942] text-white text-xs py-1.5 px-3 rounded-lg 
                 opacity-0 group-hover:opacity-100 transition-all 
                 translate-y-2 group-hover:translate-y-0 
                 whitespace-nowrap pointer-events-none 
                 border border-[#1E3A56] font-medium tracking-wide shadow-xl"
>
  {label}
  {/* Arrow */}
  <div
    className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 
                  w-2 h-2 bg-[#0F2942] rotate-45 
                  border-r border-b border-[#1E3A56]"
  />
</span>
```

**Navigation Items**:

```typescript
const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: FileText, label: "Cases", path: "/cases" },
  { icon: Scale, label: "New Case", isCenter: true }, // Center action button
  { icon: BookOpen, label: "Regulations", path: "/regulations" },
  { icon: Users, label: "Clients", path: "/clients" },
  { icon: AlertCircle, label: "Alerts", path: "/alerts", showBadge: true },
];
```

### 3.3 StatCard Component

**File**: `src/components/features/dashboard/stat-card.tsx`

**Visual Specifications**:

| State       | Property       | Value                                       |
| ----------- | -------------- | ------------------------------------------- |
| **Default** | Background     | `bg-white`                                  |
|             | Border         | `border border-slate-200`                   |
|             | Icon Container | `bg-slate-50`                               |
|             | Value Text     | `text-[#0F2942]`                            |
|             | Hover          | `hover:border-[#D97706]/50 hover:shadow-lg` |
| **Active**  | Background     | `bg-[#0F2942]`                              |
|             | Border         | `border-[#0F2942]`                          |
|             | Icon Container | `bg-white/10`                               |
|             | Value Text     | `text-white`                                |
|             | Badge          | `bg-[#D97706] text-white`                   |

**Structure**:

```tsx
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  active?: boolean;
  trend?: string;
}

<div
  className={cn(
    "p-6 rounded-2xl shadow-sm border transition-all duration-300",
    active
      ? "bg-[#0F2942] border-[#0F2942] text-white"
      : "bg-white border-slate-200 hover:border-[#D97706]/50 hover:shadow-lg"
  )}
>
  <div className="flex justify-between items-start mb-4">
    <div
      className={cn("p-3 rounded-xl", active ? "bg-white/10" : "bg-slate-50")}
    >
      {icon}
    </div>
    {trend && (
      <span
        className={cn(
          "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md",
          active ? "bg-[#D97706] text-white" : "bg-green-100 text-green-700"
        )}
      >
        {trend}
      </span>
    )}
  </div>

  <h3
    className={cn(
      "text-4xl font-bold mb-2 font-serif",
      active ? "text-white" : "text-[#0F2942]"
    )}
  >
    {value}
  </h3>

  <p
    className={cn(
      "text-sm font-bold",
      active ? "text-blue-200" : "text-slate-700"
    )}
  >
    {title}
  </p>

  <p
    className={cn("text-xs mt-1", active ? "text-blue-300" : "text-slate-400")}
  >
    {subtitle}
  </p>
</div>;
```

### 3.4 Filter Pills Component

**File**: `src/components/ui/filter-pills.tsx`

**Visual Specifications**:

| State   | Background     | Text             | Border                |
| ------- | -------------- | ---------------- | --------------------- |
| Default | `bg-white`     | `text-slate-600` | `border-slate-200`    |
| Hover   | `bg-orange-50` | `text-slate-600` | `border-[#D97706]/50` |
| Active  | `bg-[#D97706]` | `text-white`     | None                  |

**Structure**:

```tsx
<button
  className={cn(
    "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
    active
      ? "bg-[#D97706] text-white shadow-md"
      : "bg-white text-slate-600 border border-slate-200 hover:border-[#D97706]/50 hover:bg-orange-50"
  )}
>
  {label}
</button>
```

### 3.5 Modal/Dialog Styling Updates

**Overlay**:

```tsx
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50
                flex items-center justify-center
                animate-in fade-in duration-200">
```

**Content Container**:

```tsx
<div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden
                scale-100 animate-in zoom-in-95 duration-200">
```

**Header Section**:

```tsx
<div
  className="p-6 border-b border-slate-100 bg-slate-50 
                flex justify-between items-center"
>
  <h3 className="text-lg font-bold text-[#0F2942]">{title}</h3>
  <button
    className="text-slate-400 hover:text-slate-600 p-1 
                     hover:bg-slate-200 rounded-full transition-colors"
  >
    <X className="h-5 w-5" />
  </button>
</div>
```

**Footer Section**:

```tsx
<div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
  <button
    className="px-4 py-2 text-sm font-bold text-slate-600 
                     hover:bg-slate-200 rounded-lg transition-colors"
  >
    Cancel
  </button>
  <button
    className="px-6 py-2 text-sm font-bold text-white 
                     bg-[#D97706] hover:bg-[#B45309] 
                     rounded-lg shadow-md transition-colors flex items-center gap-2"
  >
    <Sparkles className="h-4 w-4" />
    Create & Analyze
  </button>
</div>
```

---

## Part 4: Page-by-Page Specifications

### 4.1 Dashboard Page

**File**: `src/app/(dashboard)/dashboard/page.tsx`

**Layout Structure**:

```
┌─────────────────────────────────────────────────────────────┐
│  Welcome Message Section                                    │
│  ┌─────────────────────────────────────┐ ┌────────────────┐ │
│  │ "Welcome back, {name}"              │ │   New Case     │ │
│  │ AI assistant analyzed X cases...    │ │     Button     │ │
│  └─────────────────────────────────────┘ └────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Stats Cards Grid (4 columns)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  Active  │ │  Pending │ │    AI    │ │  Custom  │       │
│  │  Cases   │ │   Regs   │ │ Discover │ │   Stat   │       │
│  │ (ACTIVE) │ │          │ │          │ │          │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│  Two Column Section                                         │
│  ┌───────────────────────────┐ ┌───────────────────────────┐ │
│  │      Recent Cases        │ │   Regulation Updates      │ │
│  │    (List with badges)    │ │    (Announcements)        │ │
│  │    [View All Button]     │ │                           │ │
│  └───────────────────────────┘ └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Welcome Section Specifications**:

```tsx
<div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
  <div>
    <h1 className="text-3xl font-bold text-[#0F2942] font-serif">
      Welcome back, {userName}
    </h1>
    <p className="text-slate-500 mt-2">
      Your <span className="font-bold text-[#D97706]">AI assistant</span>{" "}
      analyzed
      <span className="font-bold"> {newCasesCount} new cases</span> while you were
      away.
    </p>
  </div>
  <button
    className="bg-[#D97706] hover:bg-[#B45309] text-white px-6 py-3 rounded-xl 
                     transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 
                     font-bold flex items-center gap-2"
  >
    <div className="bg-white/20 p-1 rounded-md">
      <Plus className="h-4 w-4" />
    </div>
    New Case
  </button>
</div>
```

### 4.2 Cases List Page

**File**: `src/app/(dashboard)/cases/page.tsx`

**Layout Structure**:

```
┌─────────────────────────────────────────────────────────────┐
│  Page Header                                                │
│  ┌───────────────────────────────────┐ ┌──────────────────┐ │
│  │ "Case Management" (serif)         │ │    New Case      │ │
│  │ Subtitle description              │ │     Button       │ │
│  └───────────────────────────────────┘ └──────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Filters & Search Bar                                       │
│  ┌──────────────────────────────────────┐ ┌───────────────┐ │
│  │ [All] [Active] [Review] [Draft]...  │ │ 🔍 Search...  │ │
│  └──────────────────────────────────────┘ └───────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Cases Table                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Case Details    │ Type   │ Status  │ Updated │ Action  │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │ Case row 1...                                           │ │
│  │ Case row 2...                                           │ │
│  │ Case row 3...                                           │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Table Styling**:

```tsx
<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
  <table className="w-full">
    <thead className="bg-slate-50 border-b border-slate-200">
      <tr>
        <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
          Case Details
        </th>
        {/* ... more headers */}
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100">
      {cases.map((case_) => (
        <tr className="hover:bg-slate-50 transition-colors group">
          {/* ... cells */}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

**Status Badge Variants**:

```tsx
const statusStyles = {
  Active: "bg-green-100 text-green-700",
  Review: "bg-orange-100 text-[#D97706]",
  Draft: "bg-slate-100 text-slate-600",
  Closed: "bg-blue-100 text-blue-700",
};
```

### 4.3 Case Detail Page

**File**: `src/app/(dashboard)/cases/[id]/page.tsx`

**Layout Structure**:

```
┌─────────────────────────────────────────────────────────────┐
│  Split View Layout                                          │
│  ┌────────────────────────────────────┐ ┌─────────────────┐ │
│  │        LEFT PANEL (flex-1)         │ │  RIGHT PANEL    │ │
│  │                                    │ │   (480px)       │ │
│  │  ← Back to Dashboard               │ │                 │ │
│  │                                    │ │  AI Assistant   │ │
│  │  [Type Badge]                      │ │  ───────────    │ │
│  │  Case Title (4xl, serif)           │ │  Regulation     │ │
│  │  ID • Client                       │ │  Matching       │ │
│  │                                    │ │                 │ │
│  │  [Details] [Documents]  ← Tabs     │ │  [Suggestions]  │ │
│  │  ──────────────────────            │ │  [Suggestions]  │ │
│  │                                    │ │  [Suggestions]  │ │
│  │  Tab Content...                    │ │                 │ │
│  │                                    │ │                 │ │
│  └────────────────────────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Back Button Styling**:

```tsx
<button
  className="flex items-center text-slate-500 hover:text-[#0F2942] 
                   mb-8 text-sm font-medium group transition-colors"
>
  <div
    className="bg-slate-100 p-1 rounded-md mr-2 
                  group-hover:bg-[#0F2942] group-hover:text-white transition-colors"
  >
    <ChevronRight className="rotate-180 h-4 w-4" />
  </div>
  Back to Dashboard
</button>
```

**Tab Navigation Styling**:

```tsx
<div className="flex gap-8 border-b border-slate-200 mb-8">
  <button
    className={cn(
      "pb-4 text-sm font-bold tracking-wide transition-all relative",
      activeTab === "details"
        ? "text-[#0F2942]"
        : "text-slate-400 hover:text-[#0F2942]"
    )}
  >
    Case Details
    {activeTab === "details" && (
      <span className="absolute bottom-0 left-0 w-full h-1 bg-[#D97706] rounded-t-full" />
    )}
  </button>
  {/* ... more tabs */}
</div>
```

**AI Panel Styling**:

```tsx
<div
  className="w-full md:w-[480px] bg-slate-50/50 backdrop-blur-sm 
                border-l border-slate-200 flex flex-col h-full shadow-inner"
>
  {/* Header */}
  <div
    className="p-6 border-b border-slate-200 bg-white shadow-sm 
                  flex justify-between items-center z-10"
  >
    <div className="flex items-center gap-3">
      <div className="bg-[#0F2942] p-2 rounded-lg text-white">
        <Sparkles className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-bold text-[#0F2942] leading-none">AI Assistant</h3>
        <p className="text-xs text-slate-500 mt-1">Regulation Matching</p>
      </div>
    </div>
    <span
      className="text-xs bg-[#D97706] text-white px-3 py-1.5 rounded-lg 
                     font-bold shadow-sm shadow-orange-900/20"
    >
      3 Suggestions
    </span>
  </div>

  {/* Suggestions List */}
  <div className="flex-1 overflow-y-auto p-6 space-y-5 pb-32">
    {/* Suggestion cards */}
  </div>
</div>
```

### 4.4 Regulations Page

**File**: `src/app/(dashboard)/regulations/page.tsx`

**Layout Structure**:

```
┌─────────────────────────────────────────────────────────────┐
│  Page Header with Search                                    │
│  ┌───────────────────────────────────┐ ┌──────────────────┐ │
│  │ "Regulation Library" (serif)      │ │ 🔍 Search    🌐  │ │
│  │ Browse active laws...             │ │    Discover New  │ │
│  └───────────────────────────────────┘ └──────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Category Filters (horizontal scroll)                       │
│  [All] [Labor] [Commercial] [Civil] [Digital] [Criminal]   │
├─────────────────────────────────────────────────────────────┤
│  Regulations Grid (3 columns)                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ 📖 Icon     │ │              │ │              │        │
│  │ Title       │ │              │ │              │        │
│  │ Description │ │              │ │              │        │
│  │ ─────────── │ │              │ │              │        │
│  │ Date  Vers→│ │              │ │              │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

**Regulation Card Styling**:

```tsx
<div
  className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm 
                hover:shadow-lg hover:border-[#D97706]/30 transition-all 
                cursor-pointer group flex flex-col h-full"
>
  <div className="flex justify-between items-start mb-4">
    <div
      className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center 
                    text-[#0F2942] group-hover:bg-[#0F2942] group-hover:text-white 
                    transition-colors"
    >
      <BookOpen className="h-5 w-5" />
    </div>
    <div className="flex items-center gap-2">
      {isSubscribed && (
        <span className="text-[#D97706] bg-orange-50 p-1 rounded-md">
          <Bell className="h-4 w-4 fill-[#D97706]" />
        </span>
      )}
      <span
        className={cn(
          "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
          status === "Active"
            ? "bg-green-50 text-green-700"
            : "bg-orange-50 text-[#D97706]"
        )}
      >
        {status}
      </span>
    </div>
  </div>

  <h3
    className="text-xl font-bold text-[#0F2942] mb-2 
                 group-hover:text-[#D97706] transition-colors"
  >
    {title}
  </h3>
  <p className="text-sm text-slate-500 mb-6 flex-1 line-clamp-3">
    {description}
  </p>

  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
    <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
      <Calendar className="h-4 w-4" /> {lastUpdated}
    </div>
    <div className="flex items-center gap-1 text-xs font-bold text-[#0F2942]">
      {versionsCount} Versions
      <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
    </div>
  </div>
</div>
```

### 4.5 Clients Page (NEW)

**File**: `src/app/(dashboard)/clients/page.tsx` (Create New)

**Visual Specifications**: Same table structure as Cases, but with:

- Avatar with initials (first letter)
- Type column (Individual/Corporate/SME/Group)
- Contact column (phone + email)
- Status badge
- Cases count

### 4.6 Alerts Page (NEW)

**File**: `src/app/(dashboard)/alerts/page.tsx` (Create New)

**Visual Specifications**:

- Filter tabs: All / Unread
- Unread indicator: Orange left border (`border-l-4 border-[#D97706]`)
- Icon colors by type:
  - AI: Purple (`text-purple-600`)
  - Regulation: Orange (`text-[#D97706]`)
  - Case: Navy (`text-[#0F2942]`)
  - System: Gray (`text-slate-400`)

### 4.7 Settings Page

**File**: `src/app/(dashboard)/settings/page.tsx`

**Layout Structure**:

```
┌─────────────────────────────────────────────────────────────┐
│  Settings Header                                            │
│  "Settings" (serif) • Manage your account and preferences   │
├──────────────┬──────────────────────────────────────────────┤
│  Tab Nav     │  Tab Content                                 │
│  (Left)      │  (Right)                                     │
│              │                                              │
│  □ Profile   │  ┌─────────────────────────────────────────┐ │
│  □ Org       │  │  Profile Form                           │ │
│  □ Notif     │  │  - Avatar                               │ │
│  □ Security  │  │  - Name, Email, Phone                   │ │
│  □ Integs    │  │  - Regional settings                    │ │
│  □ Billing   │  │                                         │ │
│              │  └─────────────────────────────────────────┘ │
│              │                                              │
│  ┌────────┐  │                                              │
│  │ RBAC   │  │                                              │
│  │ Toggle │  │                                              │
│  └────────┘  │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

**Tab Items** (with role-based visibility):

```typescript
const settingsTabs = [
  { id: "profile", label: "My Profile", icon: User },
  {
    id: "organization",
    label: "Organization",
    icon: Building,
    adminOnly: true,
  },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "integrations", label: "Integrations", icon: Zap },
  { id: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
];
```

---

## Part 5: Internationalization Updates

### 5.1 Translation Structure

Align with Figma's translation keys structure from `src/locales/en.ts` and `ar.ts`:

```typescript
// src/lib/i18n/translations.ts
export const translations = {
  en: {
    common: {
      save: "Save",
      cancel: "Cancel",
      edit: "Edit",
      delete: "Delete",
      search: "Search",
      filter: "Filter",
      loading: "Loading",
      viewAll: "View All",
      backToDashboard: "Back to Dashboard",
    },
    header: {
      brandName: "Madar",
      brandSubtitle: "Case Management",
      searchPlaceholder: "Search cases, regulations, or documents...",
    },
    nav: {
      dashboard: "Dashboard",
      cases: "Cases",
      regulations: "Regulations",
      clients: "Clients",
      alerts: "Alerts",
    },
    dashboard: {
      welcomeBack: "Welcome back",
      aiAnalyzed: "Your AI assistant analyzed",
      newCases: "new cases",
      whileAway: "while you were away.",
      newCase: "New Case",
      activeCases: "Active Cases",
      updatedToday: "Updated today",
      // ... more
    },
    // ... more sections matching Figma translations
  },
  ar: {
    // Arabic translations from Figma ar.ts
    common: {
      save: "حفظ",
      cancel: "إلغاء",
      // ...
    },
    header: {
      brandName: "مدار",
      brandSubtitle: "إدارة القضايا",
      searchPlaceholder: "البحث في القضايا أو الأنظمة أو المستندات...",
      // ...
    },
    // ... full Arabic translations
  },
};
```

### 5.2 RTL-Specific Updates

```tsx
// RTL-aware icon rotation
<ChevronRight className="rtl:rotate-180" />

// RTL-aware positioning
<div className="absolute start-0 end-auto rtl:start-auto rtl:end-0" />

// Logical properties in Tailwind
<div className="ps-4 pe-2" /> // padding-inline-start/end
<div className="ms-2 me-4" /> // margin-inline-start/end
```

---

## Part 6: Implementation Phases

### Phase 1: Design System Foundation (Week 1)

| Day | Tasks                                   | Files                               |
| --- | --------------------------------------- | ----------------------------------- |
| 1-2 | Update CSS variables & Tailwind config  | `globals.css`, `tailwind.config.ts` |
| 3   | Add Google Fonts (Playfair Display)     | `layout.tsx`                        |
| 4   | Update Button, Card, Badge components   | `src/components/ui/*`               |
| 5   | Create StatCard, FilterPills components | `src/components/ui/*`               |

### Phase 2: Layout Transformation (Week 2)

| Day | Tasks                                   | Files                                       |
| --- | --------------------------------------- | ------------------------------------------- |
| 1-2 | Redesign Header component               | `src/components/layout/header.tsx`          |
| 3-4 | Create NavigationDock component         | `src/components/layout/navigation-dock.tsx` |
| 5   | Update dashboard layout, remove sidebar | `src/app/(dashboard)/layout.tsx`            |

### Phase 3: Page Redesigns (Week 3)

| Day | Tasks                     | Files                                      |
| --- | ------------------------- | ------------------------------------------ |
| 1   | Dashboard page redesign   | `src/app/(dashboard)/dashboard/page.tsx`   |
| 2   | Cases list page redesign  | `src/app/(dashboard)/cases/page.tsx`       |
| 3   | Case detail page redesign | `src/app/(dashboard)/cases/[id]/page.tsx`  |
| 4   | Regulations page redesign | `src/app/(dashboard)/regulations/page.tsx` |
| 5   | Settings page redesign    | `src/app/(dashboard)/settings/page.tsx`    |

### Phase 4: New Features & Polish (Week 4)

| Day | Tasks                        | Files                                  |
| --- | ---------------------------- | -------------------------------------- |
| 1   | Create Clients page          | `src/app/(dashboard)/clients/page.tsx` |
| 2   | Create Alerts page           | `src/app/(dashboard)/alerts/page.tsx`  |
| 3   | Update modals styling        | `src/components/ui/dialog.tsx`         |
| 4   | Add animations & transitions | Various                                |
| 5   | RTL testing & final polish   | Various                                |

---

## Part 7: Design Decisions (Confirmed)

The following decisions have been confirmed for implementation:

### Decision 1: Navigation Strategy ✅

**Selected: A) Completely replace sidebar with dock**

- Remove the existing left sidebar entirely
- Implement floating bottom navigation dock as primary navigation
- Dock will be used on all screen sizes (desktop, tablet, mobile)

### Decision 2: Clients Module ✅

**Selected: A) Implement fully as part of this refactor**

- Create complete Clients module with full CRUD functionality
- Include: Client list, Client detail, Client form modal
- Integrate with backend API for client management

### Decision 3: Settings Complexity ✅

**Selected: A) Implement all tabs with full functionality**

- Implement all 6 settings tabs:
  - My Profile (with avatar, name, email, phone, regional settings)
  - Organization (license info, storage usage, team management)
  - Notifications (toggle switches for all notification types)
  - Security (2FA, password change, login activity)
  - Integrations (Najiz, Outlook, Drive connections)
  - Billing (current plan, invoice history)
- All tabs will have working functionality, not just UI

### Decision 4: RBAC Simulator ✅

**Selected: A) Include in production**

- Keep role switcher in production for demo purposes
- Useful for client demonstrations and testing
- Can be hidden behind a feature flag if needed later

### Decision 5: Brand Name ✅

**Selected: C) Custom branding — "Madar" / "مدار"**

- English: **Madar**
- Arabic: **مدار**
- Note: Brand name may be updated in the future
- Update all header, footer, and metadata references

### Decision 6: Animation Priority ✅

**Selected: B) Add subtle transitions only**

- Implement smooth hover transitions
- Add page fade-in effects
- Include button scale on click/hover
- Skip complex entrance animations
- Focus on performance over flashy effects

---

## Appendix A: Component File Mapping

| Figma Component                | Target File                                               | Status        |
| ------------------------------ | --------------------------------------------------------- | ------------- |
| `App.tsx` (Header)             | `src/components/layout/header.tsx`                        | Modify        |
| `App.tsx` (NavigationDock)     | `src/components/layout/navigation-dock.tsx`               | Create        |
| `App.tsx` (StatCard)           | `src/components/features/dashboard/stat-card.tsx`         | Create        |
| `DashboardView.tsx`            | `src/app/(dashboard)/dashboard/page.tsx`                  | Modify        |
| `CasesListView.tsx`            | `src/app/(dashboard)/cases/page.tsx`                      | Modify        |
| `CaseDetailView.tsx`           | `src/app/(dashboard)/cases/[id]/page.tsx`                 | Modify        |
| `RegulationsView.tsx`          | `src/app/(dashboard)/regulations/page.tsx`                | Create/Modify |
| `ClientsListView.tsx`          | `src/app/(dashboard)/clients/page.tsx`                    | Create        |
| `ClientDetailView.tsx`         | `src/app/(dashboard)/clients/[id]/page.tsx`               | Create        |
| `AlertsView.tsx`               | `src/app/(dashboard)/alerts/page.tsx`                     | Create        |
| `SettingsView.tsx`             | `src/app/(dashboard)/settings/page.tsx`                   | Create/Modify |
| `CaseFormModal.tsx`            | `src/components/features/cases/case-form-modal.tsx`       | Create        |
| `ClientFormModal.tsx`          | `src/components/features/clients/client-form-modal.tsx`   | Create        |
| `RegulationDiscoveryModal.tsx` | `src/components/features/regulations/discovery-modal.tsx` | Create        |
| `RegulationDiffModal.tsx`      | `src/components/features/regulations/diff-modal.tsx`      | Create        |
| `DocumentPreviewModal.tsx`     | `src/components/features/documents/preview-modal.tsx`     | Create        |
| `GlobalSearchResultsView.tsx`  | `src/components/features/search/results-view.tsx`         | Create        |

## Appendix B: Color Reference Quick Sheet

```css
/* Primary Brand */
--navy: #0f2942;
--navy-light: #1e3a56;
--navy-lighter: #2a4d70;
--orange: #d97706;
--orange-hover: #b45309;
--orange-dark: #92400e;

/* Surfaces */
--bg-main: #f8fafc;
--bg-card: #ffffff;
--bg-muted: #f1f5f9;

/* Text */
--text-primary: #0f2942;
--text-secondary: #475569;
--text-muted: #64748b;
--text-light: #94a3b8;

/* Borders */
--border-default: #e2e8f0;
--border-light: #f1f5f9;
--border-focus: #d97706;
```

---

**End of Refactoring Plan**

_Document Version: 1.1 (Decisions Confirmed)_  
_Last Updated: 2026-01-12_  
_Status: Ready for Implementation_
