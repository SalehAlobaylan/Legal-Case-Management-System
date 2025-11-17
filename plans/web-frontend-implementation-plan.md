# Web Frontend Implementation Plan - Next.js

## Legal Case Management System - Web Application

> **Framework**: Next.js 14+ (App Router)  
> **UI Library**: shadcn/ui + Radix UI  
> **Styling**: Tailwind CSS  
> **State Management**: TanStack Query + Zustand  
> **Language**: TypeScript  
> **Authentication**: Custom JWT (matches Fastify backend)  
> **Real-time**: Socket.IO Client

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Phase 1: Foundation Setup](#phase-1-foundation-setup)
5. [Phase 2: Core Services & Auth](#phase-2-core-services--auth)
6. [Phase 3: Case Management](#phase-3-case-management)
7. [Phase 4: AI Integration UI](#phase-4-ai-integration-ui)
8. [Phase 5: Real-time Features](#phase-5-real-time-features)
9. [Phase 6: Advanced Features](#phase-6-advanced-features)
10. [Phase 7: Testing & Deployment](#phase-7-testing--deployment)

---

## Project Overview

### Core Features

- User authentication with JWT
- Case CRUD operations with advanced filtering
- AI-powered regulation suggestions display
- Real-time notifications via WebSocket
- Responsive design (desktop/tablet/mobile)
- Dark mode support
- Arabic & English RTL support
- Analytics dashboard
- Search and filtering

### Tech Stack Rationale

- **Next.js 14+ App Router**: RSC, streaming, performance
- **shadcn/ui**: Accessible, customizable components
- **TanStack Query**: Server state, caching, optimistic updates
- **Zustand**: Client state (UI, preferences)
- **Tailwind**: Utility-first, responsive design
- **TypeScript**: Type safety across the stack

---

## Tech Stack

### Dependencies

**`package.json`**:

```json
{
  "name": "legal-cms-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "jest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",

    "@tanstack/react-query": "^5.62.7",
    "@tanstack/react-query-devtools": "^5.62.7",
    "zustand": "^5.0.2",

    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-select": "^2.1.4",
    "@radix-ui/react-tabs": "^1.1.2",
    "@radix-ui/react-toast": "^1.2.4",

    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.7.0",
    "tailwindcss-animate": "^1.0.7",

    "socket.io-client": "^4.8.1",
    "axios": "^1.7.9",
    "zod": "^3.24.1",
    "react-hook-form": "^7.54.2",
    "@hookform/resolvers": "^3.9.1",

    "date-fns": "^4.1.0",
    "lucide-react": "^0.469.0",
    "recharts": "^2.15.0",
    "cmdk": "^1.0.4"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "eslint-config-next": "^14.2.0",
    "@playwright/test": "^1.49.1",
    "jest": "^29.7.0"
  }
}
```

---

## Project Structure

```
legal-cms-web/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (auth)/                 # Auth routes group
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── register/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/            # Protected routes
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── cases/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── new/
│   │   │   │       └── page.tsx
│   │   │   ├── regulations/
│   │   │   │   └── page.tsx
│   │   │   └── profile/
│   │   │       └── page.tsx
│   │   ├── api/                    # API routes (optional)
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Home page
│   ├── components/
│   │   ├── ui/                     # shadcn components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ...
│   │   ├── features/
│   │   │   ├── cases/
│   │   │   │   ├── case-card.tsx
│   │   │   │   ├── case-form.tsx
│   │   │   │   ├── case-list.tsx
│   │   │   │   └── ai-suggestions.tsx
│   │   │   ├── auth/
│   │   │   │   ├── login-form.tsx
│   │   │   │   └── register-form.tsx
│   │   │   └── dashboard/
│   │   │       ├── stats-card.tsx
│   │   │       └── recent-cases.tsx
│   │   └── layout/
│   │       ├── header.tsx
│   │       ├── sidebar.tsx
│   │       ├── footer.tsx
│   │       └── theme-toggle.tsx
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts           # Axios instance
│   │   │   ├── endpoints.ts        # API endpoints
│   │   │   ├── cases.ts            # Cases API
│   │   │   ├── regulations.ts      # Regulations API
│   │   │   └── ai-links.ts         # AI links API
│   │   ├── hooks/
│   │   │   ├── use-auth.ts
│   │   │   ├── use-cases.ts
│   │   │   ├── use-websocket.ts
│   │   │   └── use-toast.ts
│   │   ├── store/
│   │   │   ├── auth-store.ts       # Zustand auth store
│   │   │   ├── ui-store.ts         # UI state
│   │   │   └── websocket-store.ts
│   │   ├── utils/
│   │   │   ├── cn.ts               # Class name helper
│   │   │   ├── format.ts           # Date/number formatting
│   │   │   └── validators.ts
│   │   └── types/
│   │       ├── auth.ts
│   │       ├── case.ts
│   │       └── regulation.ts
│   ├── middleware.ts               # Auth middleware
│   └── providers/
│       └── query-provider.tsx      # TanStack Query provider
├── public/
├── .env.local
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── components.json                 # shadcn config
└── README.md
```

---

## Phase 1: Foundation Setup

### Step 1.1: Create Next.js Project

```bash
# Create Next.js app with TypeScript
npx create-next-app@latest legal-cms-web --typescript --tailwind --app --eslint

cd legal-cms-web

# Install core dependencies
npm install @tanstack/react-query @tanstack/react-query-devtools zustand
npm install axios socket.io-client zod react-hook-form @hookform/resolvers
npm install date-fns lucide-react clsx tailwind-merge class-variance-authority

# Install shadcn CLI
npx shadcn@latest init

# Add shadcn components
npx shadcn@latest add button card dialog input select table toast dropdown-menu tabs badge
```

### Step 1.2: Environment Configuration

**File**: `.env.example`

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3000
NEXT_PUBLIC_AI_SERVICE_URL=http://localhost:8000

# App Configuration
NEXT_PUBLIC_APP_NAME=Legal Case Management System
NEXT_PUBLIC_DEFAULT_LOCALE=ar

# Features
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_DARK_MODE=true
```

### Step 1.3: TypeScript Configuration

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Step 1.4: Tailwind Configuration

**File**: `tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... shadcn default colors
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

---

## Phase 2: Core Services & Types

### Step 2.1: API Types

**File**: `src/lib/types/case.ts`

```typescript
export enum CaseType {
  CRIMINAL = "criminal",
  CIVIL = "civil",
  COMMERCIAL = "commercial",
  LABOR = "labor",
  FAMILY = "family",
  ADMINISTRATIVE = "administrative",
}

export enum CaseStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  PENDING_HEARING = "pending_hearing",
  CLOSED = "closed",
  ARCHIVED = "archived",
}

export interface Case {
  id: number;
  organization_id: number;
  case_number: string;
  title: string;
  description?: string;
  case_type: CaseType;
  status: CaseStatus;
  client_info?: string;
  assigned_lawyer_id?: number;
  court_jurisdiction?: string;
  filing_date?: string;
  next_hearing?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCaseInput {
  caseNumber: string;
  title: string;
  description?: string;
  caseType: CaseType;
  status?: CaseStatus;
  clientInfo?: string;
  courtJurisdiction?: string;
  filingDate?: string;
  nextHearing?: string;
}

export interface CaseRegulationLink {
  id: number;
  case_id: number;
  regulation_id: number;
  similarity_score: number;
  method: "ai" | "manual" | "hybrid";
  verified: boolean;
  regulation?: Regulation;
  created_at: string;
}

export interface Regulation {
  id: number;
  title: string;
  regulation_number?: string;
  category?: string;
  jurisdiction?: string;
  status: string;
  created_at: string;
}
```

### Step 2.2: API Client

**File**: `src/lib/api/client.ts`

```typescript
import axios, { AxiosError, AxiosInstance } from "axios";
import { useAuthStore } from "@/lib/store/auth-store";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add token
    this.client.interceptors.request.use(
      (config) => {
        const token = useAuthStore.getState().token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired - logout
          useAuthStore.getState().logout();
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );
  }

  getInstance() {
    return this.client;
  }
}

export const apiClient = new ApiClient().getInstance();
```

### Step 2.3: Auth Store (Zustand)

**File**: `src/lib/store/auth-store.ts`

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: number;
  email: string;
  fullName: string;
  role: string;
  organizationId: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  setUser: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setUser: (user, token) => set({ user, token, isAuthenticated: true }),

      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

### Step 2.4: API Hooks with TanStack Query

**File**: `src/lib/hooks/use-cases.ts`

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { Case, CreateCaseInput } from "@/lib/types/case";
import { toast } from "@/components/ui/use-toast";

export function useCases() {
  return useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ cases: Case[] }>("/api/cases");
      return data.cases;
    },
  });
}

export function useCase(id: number) {
  return useQuery({
    queryKey: ["case", id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ case: Case }>(`/api/cases/${id}`);
      return data.case;
    },
    enabled: !!id,
  });
}

export function useCreateCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCaseInput) => {
      const { data } = await apiClient.post<{ case: Case }>(
        "/api/cases",
        input
      );
      return data.case;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast({
        title: "Success",
        description: "Case created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to create case",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateCase(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<CreateCaseInput>) => {
      const { data } = await apiClient.put<{ case: Case }>(
        `/api/cases/${id}`,
        updates
      );
      return data.case;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["case", id] });
      toast({ title: "Case updated successfully" });
    },
  });
}

export function useDeleteCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/api/cases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast({ title: "Case deleted successfully" });
    },
  });
}
```

### Step 2.5: AI Links Hook

**File**: `src/lib/hooks/use-ai-links.ts`

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { CaseRegulationLink } from "@/lib/types/case";

export function useAILinks(caseId: number) {
  return useQuery({
    queryKey: ["ai-links", caseId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ links: CaseRegulationLink[] }>(
        `/api/ai-links/${caseId}`
      );
      return data.links;
    },
    enabled: !!caseId,
  });
}

export function useGenerateAILinks(caseId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ links: CaseRegulationLink[] }>(
        `/api/ai-links/${caseId}/generate`
      );
      return data.links;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-links", caseId] });
    },
  });
}

export function useVerifyLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: number) => {
      await apiClient.post(`/api/ai-links/${linkId}/verify`);
    },
    onSuccess: (_, linkId) => {
      queryClient.invalidateQueries({ queryKey: ["ai-links"] });
    },
  });
}
```

---

## Phase 3: Authentication

### Step 3.1: Auth Hook

**File**: `src/lib/hooks/use-auth.ts`

```typescript
"use client";

import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/store/auth-store";
import { useRouter } from "next/navigation";

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput extends LoginInput {
  fullName: string;
  organizationId: number;
}

export function useLogin() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const { data } = await apiClient.post("/api/auth/login", input);
      return data;
    },
    onSuccess: (data) => {
      setUser(data.user, data.token);
      router.push("/dashboard");
    },
  });
}

export function useRegister() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      const { data } = await apiClient.post("/api/auth/register", input);
      return data;
    },
    onSuccess: (data) => {
      setUser(data.user, data.token);
      router.push("/dashboard");
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  return () => {
    logout();
    router.push("/login");
  };
}
```

### Step 3.2: Middleware for Auth Protection

**File**: `src/middleware.ts`

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth-storage")?.value;
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Redirect to login if not authenticated
  if (!token && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect to dashboard if authenticated and on auth pages
  if (token && isPublicPath) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

### Step 3.3: Login Page

**File**: `src/app/(auth)/login/page.tsx`

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/lib/hooks/use-auth";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { mutate: login, isPending, error } = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormData) => {
    login(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <svg className="h-6 w-6" /* Gavel icon */ />
          </div>
          <CardTitle className="text-2xl">Legal Case Management</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your cases
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="lawyer@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password && (
                <p className="text-sm text-red-500">
                  {errors.password.message}
                </p>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-500 text-center">
                {(error as any).response?.data?.error || "Login failed"}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Signing in..." : "Sign In"}
            </Button>

            <div className="text-center text-sm">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Register
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Phase 4: Dashboard Layout

### Step 4.1: Dashboard Layout

**File**: `src/app/(dashboard)/layout.tsx`

```typescript
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

### Step 4.2: Sidebar Component

**File**: `src/components/layout/sidebar.tsx`

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import { useLogout } from "@/lib/hooks/use-auth";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Cases", href: "/cases", icon: Briefcase },
  { name: "Regulations", href: "/regulations", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const logout = useLogout();

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold">Legal CMS</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
```

---

## Phase 5: Cases Pages

### Step 5.1: Cases List Page

**File**: `src/app/(dashboard)/cases/page.tsx`

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { useCases } from "@/lib/hooks/use-cases";
import { Button } from "@/components/ui/button";
import { CaseCard } from "@/components/features/cases/case-card";
import { CaseFilters } from "@/components/features/cases/case-filters";
import { Plus, Loader2 } from "lucide-react";

export default function CasesPage() {
  const { data: cases, isLoading, error } = useCases();
  const [filters, setFilters] = useState({});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-red-500">Error loading cases</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cases</h1>
          <p className="text-muted-foreground">Manage your legal cases</p>
        </div>
        <Link href="/cases/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Case
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <CaseFilters onFilterChange={setFilters} />

      {/* Cases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cases?.map((case_) => (
          <CaseCard key={case_.id} case_={case_} />
        ))}
      </div>

      {cases?.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No cases found</p>
        </div>
      )}
    </div>
  );
}
```

### Step 5.2: Case Detail Page with AI Suggestions

**File**: `src/app/(dashboard)/cases/[id]/page.tsx`

```typescript
"use client";

import { use } from "react";
import { useCase } from "@/lib/hooks/use-cases";
import { useAILinks, useGenerateAILinks } from "@/lib/hooks/use-ai-links";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AISuggestionsPanel } from "@/components/features/cases/ai-suggestions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles } from "lucide-react";

export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const caseId = parseInt(id);

  const { data: case_, isLoading: caseLoading } = useCase(caseId);
  const { data: aiLinks, isLoading: linksLoading } = useAILinks(caseId);
  const { mutate: generateLinks, isPending: isGenerating } =
    useGenerateAILinks(caseId);

  if (caseLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!case_) return <div>Case not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{case_.title}</h1>
            <Badge variant="outline">{case_.case_number}</Badge>
            <Badge>{case_.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-2">{case_.description}</p>
        </div>
        <Button variant="outline">Edit</Button>
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="ai-suggestions">
            <Sparkles className="mr-2 h-4 w-4" />
            AI Suggestions
          </TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Case Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Type</p>
                  <p className="text-muted-foreground">{case_.case_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="text-muted-foreground">{case_.status}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Court</p>
                  <p className="text-muted-foreground">
                    {case_.court_jurisdiction || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Filing Date</p>
                  <p className="text-muted-foreground">
                    {case_.filing_date || "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-suggestions">
          <AISuggestionsPanel
            caseId={caseId}
            links={aiLinks || []}
            isLoading={linksLoading}
            isGenerating={isGenerating}
            onGenerate={() => generateLinks()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Step 5.3: AI Suggestions Panel Component

**File**: `src/components/features/cases/ai-suggestions.tsx`

```typescript
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVerifyLink } from "@/lib/hooks/use-ai-links";
import { CaseRegulationLink } from "@/lib/types/case";
import { Sparkles, Check, Loader2, ThumbsUp } from "lucide-react";

interface AISuggestionsPanelProps {
  caseId: number;
  links: CaseRegulationLink[];
  isLoading: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
}

export function AISuggestionsPanel({
  links,
  isLoading,
  isGenerating,
  onGenerate,
}: AISuggestionsPanelProps) {
  const { mutate: verifyLink } = useVerifyLink();

  if (isLoading || isGenerating) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Generating AI suggestions...</p>
        </CardContent>
      </Card>
    );
  }

  if (links.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No AI suggestions yet</h3>
          <p className="text-muted-foreground mb-6">
            Generate AI-powered regulation suggestions for this case
          </p>
          <Button onClick={onGenerate}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Suggestions
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {links.length} AI-suggested regulations
        </p>
        <Button variant="outline" size="sm" onClick={onGenerate}>
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {links.map((link) => (
          <Card key={link.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={cn(
                        "flex items-center justify-center w-12 h-12 rounded-full text-white font-bold",
                        getScoreColor(link.similarity_score)
                      )}
                    >
                      {Math.round(link.similarity_score * 100)}%
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">
                        {link.regulation?.title || "Regulation"}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {link.regulation?.category}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className="text-xs">
                      {link.method === "ai" ? "AI Generated" : "Manual"}
                    </Badge>
                    {link.verified && (
                      <Badge variant="default" className="text-xs">
                        <Check className="mr-1 h-3 w-3" />
                        Verified
                      </Badge>
                    )}
                  </div>
                </div>

                {!link.verified && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => verifyLink(link.id)}
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return "bg-green-500";
  if (score >= 0.6) return "bg-orange-500";
  return "bg-red-500";
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
```

---

## Phase 6: WebSocket Integration

### Step 6.1: WebSocket Hook

**File**: `src/lib/hooks/use-websocket.ts`

```typescript
"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/lib/store/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const socket = io(process.env.NEXT_PUBLIC_WS_URL!, {
      transports: ["websocket"],
      query: { token },
    });

    socket.on("connect", () => {
      console.log("WebSocket connected");
    });

    socket.on("regulation-updated", (data) => {
      toast({
        title: "Regulation Updated",
        description: "A regulation has been updated",
      });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["regulations"] });
      queryClient.invalidateQueries({ queryKey: ["ai-links"] });
    });

    socket.on("case-links-refreshed", (data) => {
      const caseId = data.case_id;
      queryClient.invalidateQueries({ queryKey: ["ai-links", caseId] });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [token, queryClient]);

  return socketRef.current;
}
```

---

## Phase 7: Query Provider Setup

### Step 7.1: TanStack Query Provider

**File**: `src/providers/query-provider.tsx`

```typescript
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Step 7.2: Root Layout with Providers

**File**: `src/app/layout.tsx`

```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Legal Case Management System",
  description: "AI-powered legal case management for Saudi practitioners",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

---

## Phase 8: Advanced Components

### Step 8.1: Case Form Component

**File**: `src/components/features/cases/case-form.tsx`

```typescript
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useCreateCase } from "@/lib/hooks/use-cases";
import { CaseType, CaseStatus } from "@/lib/types/case";

const caseSchema = z.object({
  caseNumber: z.string().min(1, "Case number is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  caseType: z.nativeEnum(CaseType),
  status: z.nativeEnum(CaseStatus).optional(),
  clientInfo: z.string().optional(),
  courtJurisdiction: z.string().optional(),
  filingDate: z.string().optional(),
  nextHearing: z.string().optional(),
});

type CaseFormData = z.infer<typeof caseSchema>;

export function CaseForm({ onSuccess }: { onSuccess?: () => void }) {
  const { mutate: createCase, isPending } = useCreateCase();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CaseFormData>({
    resolver: zodResolver(caseSchema),
  });

  const onSubmit = (data: CaseFormData) => {
    createCase(data, {
      onSuccess: () => {
        onSuccess?.();
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="caseNumber">Case Number *</Label>
          <Input id="caseNumber" {...register("caseNumber")} />
          {errors.caseNumber && (
            <p className="text-sm text-red-500">{errors.caseNumber.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="caseType">Case Type *</Label>
          <Select {...register("caseType")}>
            <option value={CaseType.CIVIL}>Civil</option>
            <option value={CaseType.COMMERCIAL}>Commercial</option>
            <option value={CaseType.LABOR}>Labor</option>
            <option value={CaseType.CRIMINAL}>Criminal</option>
            <option value={CaseType.FAMILY}>Family</option>
            <option value={CaseType.ADMINISTRATIVE}>Administrative</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" {...register("title")} />
        {errors.title && (
          <p className="text-sm text-red-500">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={5} {...register("description")} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="filingDate">Filing Date</Label>
          <Input id="filingDate" type="date" {...register("filingDate")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nextHearing">Next Hearing</Label>
          <Input
            id="nextHearing"
            type="datetime-local"
            {...register("nextHearing")}
          />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Creating..." : "Create Case"}
      </Button>
    </form>
  );
}
```

---

## Phase 9: Dashboard & Analytics

### Step 9.1: Dashboard Page

**File**: `src/app/(dashboard)/dashboard/page.tsx`

```typescript
"use client";

import { useCases } from "@/lib/hooks/use-cases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, TrendingUp, CheckCircle, Clock } from "lucide-react";

export default function DashboardPage() {
  const { data: cases } = useCases();

  const stats = {
    total: cases?.length || 0,
    open: cases?.filter((c) => c.status === "open").length || 0,
    closed: cases?.filter((c) => c.status === "closed").length || 0,
    pending: cases?.filter((c) => c.status === "pending_hearing").length || 0,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Cases"
          value={stats.total}
          icon={<Briefcase className="h-8 w-8" />}
          trend="+12% from last month"
        />
        <StatsCard
          title="Open Cases"
          value={stats.open}
          icon={<Clock className="h-8 w-8" />}
          iconColor="text-blue-500"
        />
        <StatsCard
          title="Closed Cases"
          value={stats.closed}
          icon={<CheckCircle className="h-8 w-8" />}
          iconColor="text-green-500"
        />
        <StatsCard
          title="Pending Hearings"
          value={stats.pending}
          icon={<TrendingUp className="h-8 w-8" />}
          iconColor="text-orange-500"
        />
      </div>

      {/* Recent Cases */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {cases?.slice(0, 5).map((case_) => (
              <div
                key={case_.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{case_.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {case_.case_number}
                  </p>
                </div>
                <Badge>{case_.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon,
  iconColor = "text-primary",
  trend,
}: any) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
            {trend && (
              <p className="text-xs text-muted-foreground mt-1">{trend}</p>
            )}
          </div>
          <div className={iconColor}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Implementation Checklist

### Week 1: Foundation

- [ ] Create Next.js project with App Router
- [ ] Install shadcn/ui and core dependencies
- [ ] Set up TypeScript configuration
- [ ] Configure Tailwind CSS
- [ ] Set up project structure
- [ ] Create environment variables

### Week 2: Core Services

- [ ] Set up Axios client with interceptors
- [ ] Create Zustand auth store
- [ ] Set up TanStack Query provider
- [ ] Create TypeScript types/interfaces
- [ ] Build utility functions
- [ ] Configure middleware

### Week 3: Authentication

- [ ] Build login page with form validation
- [ ] Build register page
- [ ] Implement JWT token management
- [ ] Create auth hooks (useLogin, useLogout)
- [ ] Add protected route logic
- [ ] Test auth flow

### Week 4: Case Management UI

- [ ] Build cases list page with filtering
- [ ] Build case detail page
- [ ] Build create/edit case forms
- [ ] Add case status badges
- [ ] Implement pagination
- [ ] Add search functionality

### Week 5: AI Integration

- [ ] Create AI suggestions component
- [ ] Display similarity scores with visual indicators
- [ ] Add generate AI links button
- [ ] Implement verify/dismiss actions
- [ ] Show loading states
- [ ] Error handling for AI service

### Week 6: Real-time & Advanced Features

- [ ] Integrate WebSocket client
- [ ] Handle real-time updates
- [ ] Build dashboard with stats
- [ ] Add dark mode toggle
- [ ] Implement RTL support for Arabic
- [ ] Add toast notifications

### Week 7: Testing & Polish

- [ ] Write unit tests
- [ ] Write E2E tests with Playwright
- [ ] Optimize performance
- [ ] Add loading skeletons
- [ ] Accessibility improvements
- [ ] Build for production

---

## Integration with Backend

### API Communication Flow

```typescript
// Example: Creating a case and getting AI suggestions

// 1. User fills form
const formData = { title: "Labor dispute...", caseType: "labor" };

// 2. Create case via Fastify API
const newCase = await createCase(formData);

// 3. Backend auto-generates AI links via FastAPI microservice

// 4. Fetch AI links and display
const aiLinks = await fetchAILinks(newCase.id);

// 5. Display suggestions with scores in UI
<AISuggestionsPanel links={aiLinks} />;
```

### WebSocket Events Handling

```typescript
socket.on("regulation-updated", (data) => {
  // Invalidate queries to refetch fresh data
  queryClient.invalidateQueries({ queryKey: ["regulations"] });

  // Show toast notification
  toast({ title: "Regulation updated", description: data.title });
});
```

---

## Key Files Summary

### Configuration Files

- `next.config.js` - Next.js configuration
- `tailwind.config.ts` - Tailwind + shadcn theme
- `components.json` - shadcn/ui configuration
- `.env.local` - Environment variables

### Core Infrastructure

- `src/lib/api/client.ts` - Axios client with auth
- `src/lib/store/auth-store.ts` - Zustand auth state
- `src/lib/hooks/use-cases.ts` - TanStack Query hooks
- `src/middleware.ts` - Route protection

### UI Components

- `src/components/ui/*` - shadcn/ui components
- `src/components/features/cases/*` - Case-specific components
- `src/components/layout/*` - Layout components

### Pages (App Router)

- `src/app/(auth)/login/page.tsx` - Login
- `src/app/(dashboard)/cases/page.tsx` - Cases list
- `src/app/(dashboard)/cases/[id]/page.tsx` - Case detail
- `src/app/(dashboard)/dashboard/page.tsx` - Dashboard

---

## Useful Commands

```bash
# Development
npm run dev                # Start dev server (http://localhost:3000)
npm run build              # Build for production
npm run start              # Start production server

# shadcn components
npx shadcn@latest add [component-name]

# Testing
npm run test               # Run Jest tests
npm run test:e2e           # Run Playwright E2E tests

# Code quality
npm run lint               # ESLint
npm run type-check         # TypeScript check
```

---

## Integration Checklist

### With Fastify Backend

- [ ] API base URL configured
- [ ] JWT token in Authorization header
- [ ] Error handling for 401/403
- [ ] WebSocket connection with auth
- [ ] CORS properly configured

### With AI Microservice

- [ ] Display similarity scores (0-1 scale)
- [ ] Show AI-generated vs manual links
- [ ] Handle AI service errors gracefully
- [ ] Visual indicators for score quality

### With Flutter App

- [ ] Same API endpoints
- [ ] Consistent data models
- [ ] Both receive WebSocket events
- [ ] Shared JWT authentication

---

## Production Considerations

### Performance

- Use Next.js ISR for regulation pages
- Implement virtual scrolling for large lists
- Optimize images with next/image
- Code splitting by route
- Use React.lazy for heavy components

### Security

- CSRF protection
- Input sanitization
- XSS prevention (React default)
- Secure cookies for tokens
- Rate limiting on API

### SEO & Accessibility

- Semantic HTML
- ARIA labels
- Keyboard navigation
- Meta tags
- sitemap.xml

---

## Deployment Options

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Docker

```dockerfile
FROM node:20-alpine AS base
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Notes

- Next.js 14+ App Router for performance
- shadcn/ui for accessible, customizable components
- TanStack Query handles all server state
- Zustand for simple client state
- WebSocket for real-time features
- Full TypeScript coverage
- Responsive design (mobile-first)
- Dark mode built-in
- Production-ready architecture

---

**End of Web Frontend Implementation Plan**

