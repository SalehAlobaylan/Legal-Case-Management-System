<!-- ========================================
File: LCMS_Flutter_Mobile_Context.md
======================================== -->

# LCMS — Flutter Mobile App Context (Android/iOS)
**Priority Context for Mobile Development (Flutter 3.x)**  
*Generated: 2026-01-03 | Use this as the primary context for the Flutter app*

---

## PART 1: PRODUCT SCOPE (MOBILE)

### 1.1 Mobile Vision
The LCMS mobile app is a **companion** to the web dashboard, optimized for:
- Quick case review on-the-go.
- Reading and verifying AI regulation suggestions.
- Receiving regulation-change notifications immediately.
- Uploading/reading documents from mobile.

**Non-goals for v1 mobile (to keep scope realistic):**
- Full admin management (user management, org config) → web-only (v1).
- Advanced analytics dashboards → web-only (v1).
- Complex regulation version diff viewer (large documents) → simplified in v1.

### 1.2 Supported Platforms
- Android (primary).
- iOS (secondary).
- Tablets supported via responsive layouts (not a separate UX).

### 1.3 Languages & Direction
- Arabic-first (default), RTL.
- English supported, LTR.

### 1.4 Personas (Mobile-specific)
- **Senior Lawyer**: wants push alerts + quick review of AI links while traveling.
- **Paralegal**: uploads documents (scans), updates case status quickly.
- **Lawyer**: checks active cases, adds quick notes, verifies/dismisses AI suggestions.

---

## PART 2: MVP FEATURES (P0/P1)

### 2.1 P0 (Must-have for v1)
1. Authentication (login/logout) with persisted JWT.
2. Cases list + filters (status, assigned to me).
3. Case details:
   - Overview (title, client, status, last update).
   - AI Suggestions tab: verify/dismiss.
   - Documents tab: list + download + upload.
4. Regulations library:
   - Search + basic filters.
   - Regulation details (summary + metadata).
   - Subscribe (monitor) regulation updates.
5. Notifications:
   - Push notifications for regulation updates & case events.
   - In-app notification center.
6. Offline-friendly read:
   - Cached cases list + cached last-opened case details.

### 2.2 P1 (Nice-to-have)
- Case creation (simplified form).
- Scan document using camera + upload.
- Better regulation viewer (sections, table of contents).
- Background sync to refresh monitored regulations list.
- Multi-account or org switching.

---

## PART 3: TECH STACK (MANDATORY)

### 3.1 Flutter Version
- Flutter 3.x (stable channel).
- Dart 3.x.

### 3.2 State Management
**Preferred**: Riverpod (v2) + StateNotifier / AsyncNotifier

Why:
- Predictable, testable state.
- Great for dependency injection (API clients, storage, auth).
- Handles async loading nicely.

Alternative (acceptable if already used elsewhere): Bloc/Cubit.

### 3.3 Networking
- Dio for HTTP.
- Interceptors to attach Authorization header.

### 3.4 Storage
- flutter_secure_storage for JWT and sensitive data.
- Hive or Isar for offline cache (cases, regulations metadata, notifications).

### 3.5 Realtime
Two options depending on backend:
- If backend uses Socket.IO: use `socket_io_client`.
- If backend exposes WS: use `web_socket_channel`.

Mobile should treat realtime as “best effort”; fallback to pull-to-refresh.

### 3.6 Push Notifications
- Firebase Cloud Messaging (FCM) for Android/iOS.
- `firebase_messaging` + `flutter_local_notifications`.

Push types:
- `regulation_updated`
- `case_created`
- `case_updated`
- `ai_links_refreshed`

---

## PART 4: APP ARCHITECTURE

### 4.1 High-level Architecture
Clean-ish layers with clear boundaries:

```
UI (Screens/Widgets)
  ↓
State (Riverpod Notifiers)
  ↓
Repositories (business data orchestration)
  ↓
Data Sources
  - Remote (Dio + WebSocket)
  - Local (Hive/Isar)
```

### 4.2 Folder Structure (Recommended)

```
lib/
├── main.dart
├── app/
│   ├── lcms_app.dart               # MaterialApp.router, theme, locale
│   ├── router.dart                 # go_router routes
│   ├── theme/
│   │   ├── app_theme.dart
│   │   └── color_schemes.dart
│   └── localization/
│       ├── l10n.dart               # AR/EN helpers
│       └── arb/                    # .arb files
│
├── core/
│   ├── config/
│   │   ├── env.dart                # API base URL, build flavors
│   │   └── constants.dart
│   ├── network/
│   │   ├── dio_provider.dart
│   │   ├── auth_interceptor.dart
│   │   └── error_mapper.dart
│   ├── storage/
│   │   ├── secure_storage.dart
│   │   └── local_db.dart           # Hive/Isar init
│   ├── realtime/
│   │   ├── socket_client.dart
│   │   └── realtime_events.dart
│   └── utils/
│       ├── formatters.dart
│       ├── validators.dart
│       └── rtl.dart
│
├── features/
│   ├── auth/
│   │   ├── data/
│   │   │   ├── auth_api.dart
│   │   │   └── auth_repo.dart
│   │   ├── state/
│   │   │   ├── auth_state.dart
│   │   │   └── auth_notifier.dart
│   │   └── ui/
│   │       ├── login_screen.dart
│   │       └── widgets/
│   │           └── login_form.dart
│   │
│   ├── cases/
│   │   ├── data/
│   │   │   ├── cases_api.dart
│   │   │   ├── cases_local.dart
│   │   │   └── cases_repo.dart
│   │   ├── state/
│   │   │   ├── cases_list_notifier.dart
│   │   │   ├── case_detail_notifier.dart
│   │   │   └── models/
│   │   │       ├── case_model.dart
│   │   │       └── case_status.dart
│   │   └── ui/
│   │       ├── cases_list_screen.dart
│   │       ├── case_detail_screen.dart
│   │       └── widgets/
│   │           ├── case_card.dart
│   │           ├── case_status_badge.dart
│   │           └── tabs/
│   │               ├── case_overview_tab.dart
│   │               ├── case_ai_tab.dart
│   │               └── case_documents_tab.dart
│   │
│   ├── regulations/
│   │   ├── data/
│   │   │   ├── regulations_api.dart
│   │   │   ├── regulations_local.dart
│   │   │   └── regulations_repo.dart
│   │   ├── state/
│   │   │   ├── regulations_search_notifier.dart
│   │   │   ├── regulation_detail_notifier.dart
│   │   │   └── subscriptions_notifier.dart
│   │   └── ui/
│   │       ├── regulations_list_screen.dart
│   │       ├── regulation_detail_screen.dart
│   │       └── widgets/
│   │           ├── regulation_card.dart
│   │           └── subscribe_bottom_sheet.dart
│   │
│   ├── documents/
│   │   ├── data/
│   │   │   ├── documents_api.dart
│   │   │   └── documents_repo.dart
│   │   └── ui/
│   │       └── widgets/
│   │           ├── document_row.dart
│   │           └── upload_button.dart
│   │
│   └── notifications/
│       ├── data/
│       │   ├── notifications_local.dart
│       │   └── notifications_repo.dart
│       ├── state/
│       │   └── notifications_notifier.dart
│       └── ui/
│           ├── notifications_screen.dart
│           └── widgets/
│               └── notification_tile.dart
│
└── shared/
    ├── widgets/
    │   ├── app_scaffold.dart
    │   ├── loading_view.dart
    │   ├── error_view.dart
    │   ├── empty_view.dart
    │   └── confirm_dialog.dart
    └── models/
        ├── paginated.dart
        └── api_result.dart
```

### 4.3 Navigation
Use `go_router` with guarded routes.

Routes:
- `/login`
- `/home` (bottom tabs)
  - `/home/cases`
  - `/home/regulations`
  - `/home/notifications`
  - `/home/profile`
- `/cases/:id`
- `/regulations/:id`

Route guard rule:
- If no token → redirect to `/login`.

---

## PART 5: AUTH (JWT) — MOBILE FLOW

### 5.1 Token Lifecycle
- Store token in `flutter_secure_storage`.
- Keep `authState` in memory via Riverpod.
- On app launch:
  1. Read token from secure storage.
  2. If token exists → fetch `/api/auth/me`.
  3. If success → proceed to `/home`.
  4. If 401 → clear token → `/login`.

### 5.2 Dio Interceptor (Required)
Attach token on every request:

```dart
class AuthInterceptor extends Interceptor {
  final SecureStorage storage;

  AuthInterceptor(this.storage);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await storage.readToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    return handler.next(options);
  }
}
```

---

## PART 6: CORE SCREENS (DETAILED)

### 6.1 Login Screen
- Email + password.
- Show validation errors.
- Loading state.
- Error mapping:
  - 401 → “Invalid credentials”.
  - 500 → “Server error, try again”.

### 6.2 Home (Bottom Navigation)
Tab bar:
- Cases
- Regulations
- Notifications
- Profile

Arabic RTL:
- Bottom navigation order can remain consistent, but icons/labels must be localized.

### 6.3 Cases List Screen
- Search by case title/number (debounced).
- Filter by status.
- Pull-to-refresh.
- Cached list shows instantly, then refresh remote.

Case card must show:
- Title.
- Status badge.
- Last updated (relative).

### 6.4 Case Detail Screen (Tabbed)
Tabs:
1. Overview
2. AI Suggestions
3. Documents

#### AI Suggestions Tab
Each suggestion row:
- Regulation title.
- Confidence score.
- Verify button.
- Dismiss button.

On verify/dismiss:
- Optimistic UI update.
- Show snackbar/toast.

#### Documents Tab
- List documents.
- Download.
- Upload:
  - Choose file from picker.
  - Optional camera scan (P1).

### 6.5 Regulations List Screen
- Search + status filter.
- Regulation card:
  - Title.
  - Number.
  - Status.
  - “Monitor” button (subscribe).
  - “Monitored” badge if already subscribed.

### 6.6 Regulation Detail Screen
- Metadata: title, number, status, last updated.
- Summary section.
- “Monitor updates” CTA.
- “Open source URL” action (if present).

### 6.7 Notifications Screen
- Unified feed of:
  - Regulation updates
  - Case events
  - AI refresh events

Actions:
- Tap → navigate to related entity.
- Mark as read.
- Clear all (with confirmation).

---

## PART 7: REGULATION SUBSCRIPTION (MOST IMPORTANT)

### 7.1 UX Requirements
Subscription should be fast and mobile-friendly:
- Use a Bottom Sheet (preferred) or Dialog.
- Pre-fill regulation title.
- Allow user to select monitoring interval.
- Confirm success with toast + update badge.

### 7.2 API Contract (Proposed)
If backend already has different endpoints, adapt names but keep semantics.

**Create subscription**
- `POST /api/regulations/{regId}/subscriptions`
- Body:
  ```json
  {
    "intervalHours": 24,
    "notifyPush": true,
    "notifyInApp": true
  }
  ```

**List my subscriptions**
- `GET /api/subscriptions`

**Update subscription**
- `PATCH /api/subscriptions/{id}`

**Delete subscription**
- `DELETE /api/subscriptions/{id}`

### 7.3 Bottom Sheet UI (Pseudo)
- Title: “Monitor Regulation Updates”
- Interval selector: 12h / 24h / Weekly
- Toggles:
  - Push notifications
  - In-app notifications
- Buttons:
  - Enable
  - Cancel

### 7.4 Realtime + Push
- If app is foreground: handle WebSocket event to refresh state.
- If app is background/killed: use FCM push.

Push payload should include:
```json
{
  "type": "regulation_updated",
  "regulationId": 123,
  "title": "Saudi Labor Law",
  "version": "v2",
  "timestamp": "2026-01-03T18:22:00Z"
}
```

On tap:
- Navigate to `/regulations/123`.

---

## PART 8: OFFLINE & CACHING STRATEGY

### 8.1 What to Cache
P0 cache targets:
- Cases list (last N items, e.g. 100).
- Last opened case details.
- Regulations search results (recent queries).
- Subscriptions list.
- Notifications feed.

### 8.2 Cache Invalidation
- On successful refresh, overwrite local cache.
- On logout, clear all caches.

### 8.3 UX Rules
- If offline:
  - Show cached content with “Offline” banner.
  - Disable write actions (verify/dismiss/upload) OR queue them (P1).

---

## PART 9: ERROR HANDLING & OBSERVABILITY

### 9.1 Error Mapping
Map Dio errors to user-facing messages:
- Timeout → “Connection timeout”.
- Socket exception → “No internet connection”.
- 401 → Force logout.
- 403 → “Insufficient permission”.

### 9.2 Logging
- Use `logger` package in debug.
- For production (P1): Sentry.

---

## PART 10: RTL, THEMING, ACCESSIBILITY

### 10.1 RTL Rules
- Use `Directionality` controlled by locale.
- Avoid left/right paddings; prefer symmetric padding or logical placement.
- Mirror chevrons/arrows where appropriate.

### 10.2 Theming
- Light/Dark themes.
- Use Material 3.
- Store theme preference locally.

### 10.3 Accessibility
- Large touch targets (48dp).
- Contrast checks in dark mode.
- Screen reader labels for icon buttons.

---

## PART 11: SECURITY NOTES

- JWT in secure storage only.
- No tokens in logs.
- Certificate pinning (P1).
- Ensure document downloads are authorized.

---

## PART 12: IMPLEMENTATION PLAN (SUGGESTED ORDER)

### Week 1 — Foundations
1. Project setup + env + theming + localization.
2. Auth flow + guarded routing.
3. Core networking layer (Dio + interceptor).

### Week 2 — Cases
1. Cases list + cache.
2. Case detail + AI verify/dismiss.
3. Documents list + upload.

### Week 3 — Regulations + Subscriptions
1. Regulations list + search.
2. Regulation detail.
3. Subscription bottom sheet + list subscriptions.

### Week 4 — Notifications + Realtime
1. In-app notifications store + UI.
2. WebSocket handling.
3. Push notifications integration.
4. QA: RTL + performance + offline.

---

## PART 13: ACCEPTANCE CRITERIA (MOBILE v1)

Functional:
- [ ] User can login and token persists after restart.
- [ ] Cases list loads (cached first, then refreshed).
- [ ] Case detail shows AI suggestions.
- [ ] Verify/dismiss works and updates UI immediately.
- [ ] Document upload and download work.
- [ ] Regulations can be searched.
- [ ] User can subscribe to a regulation and sees “Monitored” badge.
- [ ] Push notification opens the correct screen.

RTL:
- [ ] Arabic layout is RTL across all screens.
- [ ] Titles and labels are localized.

Performance:
- [ ] First meaningful screen < 3 seconds on mid-range Android.
- [ ] Scrolling lists are smooth (no jank).

---

**END OF FLUTTER MOBILE CONTEXT**
