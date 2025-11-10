# Flutter Frontend Implementation Plan

## Legal Case Management System - Mobile Application

> **Framework**: Flutter 3.x with Dart  
> **State Management**: Provider  
> **Storage**: shared_preferences + secure_storage  
> **API Client**: dio + retrofit  
> **WebSocket**: socket_io_client  
> **Architecture**: Clean Architecture with Feature-First Structure

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Phase 1: Foundation Setup](#phase-1-foundation-setup)
5. [Phase 2: Core Services](#phase-2-core-services)
6. [Phase 3: Authentication](#phase-3-authentication)
7. [Phase 4: Case Management](#phase-4-case-management)
8. [Phase 5: AI Links Display](#phase-5-ai-links-display)
9. [Phase 6: Real-time Updates](#phase-6-real-time-updates)
10. [Phase 7: UI/UX Polish](#phase-7-uiux-polish)
11. [Phase 8: Testing](#phase-8-testing)

---

## Project Overview

### Core Features

- ✅ User authentication (login/register with JWT)
- ✅ Case management (CRUD operations)
- ✅ View AI-suggested related regulations
- ✅ Verify/dismiss AI suggestions
- ✅ Real-time notifications for updates
- ✅ Offline support with local caching
- ✅ Arabic and English RTL support
- ✅ Dark/Light theme support

### Key Screens

1. **Auth Screens**: Login, Register
2. **Dashboard**: Overview of cases
3. **Case List**: All cases with filters
4. **Case Detail**: Full case info + AI suggestions
5. **Regulations**: Browse regulations
6. **Profile**: User settings

---

## Tech Stack

### Core Dependencies

**`pubspec.yaml`**:

```yaml
name: legal_case_management
description: AI-powered legal case management for Saudi legal practitioners
version: 1.0.0+1

environment:
  sdk: ">=3.0.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter

  # State Management
  provider: ^6.1.2

  # Network & API
  dio: ^5.7.0
  retrofit: ^4.4.1
  retrofit_generator: ^9.1.5
  json_annotation: ^4.9.0

  # Storage
  shared_preferences: ^2.3.5
  flutter_secure_storage: ^9.2.3

  # WebSocket
  socket_io_client: ^2.0.3+1

  # UI & Widgets
  flutter_svg: ^2.0.14
  cached_network_image: ^3.4.1
  shimmer: ^3.0.0
  pull_to_refresh: ^2.0.0

  # Navigation
  go_router: ^14.6.2

  # Utilities
  intl: ^0.19.0
  timeago: ^3.7.0
  uuid: ^4.5.1

  # Form & Validation
  flutter_form_builder: ^9.4.4
  form_builder_validators: ^11.1.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
  build_runner: ^2.4.15
  json_serializable: ^6.9.2
  mockito: ^5.4.5
```

---

## Project Structure

```
lib/
├── main.dart
├── app/
│   ├── app.dart                    # Main app widget
│   ├── routes.dart                 # Route configuration
│   └── theme.dart                  # Theme configuration
├── core/
│   ├── constants/
│   │   ├── api_constants.dart      # API endpoints
│   │   ├── app_constants.dart      # App-wide constants
│   │   └── storage_keys.dart       # Storage key constants
│   ├── network/
│   │   ├── api_client.dart         # Dio client setup
│   │   ├── api_service.dart        # Retrofit API interface
│   │   └── websocket_service.dart  # WebSocket connection
│   ├── storage/
│   │   ├── secure_storage.dart     # JWT token storage
│   │   └── local_storage.dart      # Preferences storage
│   ├── errors/
│   │   └── failures.dart           # Error classes
│   └── utils/
│       ├── date_utils.dart
│       ├── validators.dart
│       └── arabic_utils.dart
├── features/
│   ├── auth/
│   │   ├── models/
│   │   │   ├── user.dart
│   │   │   └── auth_response.dart
│   │   ├── providers/
│   │   │   └── auth_provider.dart
│   │   ├── screens/
│   │   │   ├── login_screen.dart
│   │   │   └── register_screen.dart
│   │   └── widgets/
│   │       └── auth_form.dart
│   ├── cases/
│   │   ├── models/
│   │   │   ├── case.dart
│   │   │   └── case_filter.dart
│   │   ├── providers/
│   │   │   ├── cases_provider.dart
│   │   │   └── case_detail_provider.dart
│   │   ├── screens/
│   │   │   ├── cases_list_screen.dart
│   │   │   ├── case_detail_screen.dart
│   │   │   └── create_case_screen.dart
│   │   └── widgets/
│   │       ├── case_card.dart
│   │       ├── case_form.dart
│   │       └── ai_suggestions_widget.dart
│   ├── regulations/
│   │   ├── models/
│   │   │   └── regulation.dart
│   │   ├── providers/
│   │   │   └── regulations_provider.dart
│   │   └── screens/
│   │       └── regulations_screen.dart
│   └── dashboard/
│       ├── providers/
│       │   └── dashboard_provider.dart
│       └── screens/
│           └── dashboard_screen.dart
├── shared/
│   ├── widgets/
│   │   ├── custom_button.dart
│   │   ├── loading_indicator.dart
│   │   ├── error_widget.dart
│   │   └── empty_state.dart
│   └── extensions/
│       └── context_extensions.dart
└── l10n/                           # Localization (Arabic/English)
    ├── app_ar.arb
    └── app_en.arb
```

---

## Phase 1: Foundation Setup

### Step 1.1: Create Flutter Project

```bash
# Create project
flutter create legal_case_management
cd legal_case_management

# Add dependencies
flutter pub add provider dio retrofit socket_io_client shared_preferences flutter_secure_storage go_router

# Dev dependencies
flutter pub add --dev build_runner json_serializable retrofit_generator
```

### Step 1.2: Environment Configuration

**File**: `lib/core/constants/api_constants.dart`

```dart
class ApiConstants {
  // Base URLs
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  static const String aiServiceUrl = String.fromEnvironment(
    'AI_SERVICE_URL',
    defaultValue: 'http://localhost:8000',
  );

  // API Endpoints
  static const String loginEndpoint = '/api/auth/login';
  static const String registerEndpoint = '/api/auth/register';
  static const String meEndpoint = '/api/auth/me';

  static const String casesEndpoint = '/api/cases';
  static String caseDetailEndpoint(int id) => '/api/cases/$id';

  static const String regulationsEndpoint = '/api/regulations';

  static String aiLinksEndpoint(int caseId) => '/api/ai-links/$caseId';
  static String generateLinksEndpoint(int caseId) => '/api/ai-links/$caseId/generate';
  static String verifyLinkEndpoint(int linkId) => '/api/ai-links/$linkId/verify';

  // WebSocket
  static const String wsEndpoint = '/ws';

  // Timeouts
  static const Duration connectTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);
}
```

**File**: `lib/core/constants/storage_keys.dart`

```dart
class StorageKeys {
  // Secure storage keys
  static const String accessToken = 'access_token';
  static const String refreshToken = 'refresh_token';

  // Shared preferences keys
  static const String userId = 'user_id';
  static const String userEmail = 'user_email';
  static const String organizationId = 'organization_id';
  static const String isDarkMode = 'is_dark_mode';
  static const String locale = 'locale';

  // Cache keys
  static const String cachedCases = 'cached_cases';
  static const String cachedRegulations = 'cached_regulations';
  static const String lastSyncTime = 'last_sync_time';
}
```

---

## Phase 2: Core Services

### Step 2.1: Secure Storage Service

**File**: `lib/core/storage/secure_storage.dart`

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/storage_keys.dart';

class SecureStorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  // Token management
  static Future<void> saveToken(String token) async {
    await _storage.write(key: StorageKeys.accessToken, value: token);
  }

  static Future<String?> getToken() async {
    return await _storage.read(key: StorageKeys.accessToken);
  }

  static Future<void> deleteToken() async {
    await _storage.delete(key: StorageKeys.accessToken);
  }

  static Future<bool> hasToken() async {
    final token = await getToken();
    return token != null && token.isNotEmpty;
  }

  static Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}
```

### Step 2.2: Local Storage Service

**File**: `lib/core/storage/local_storage.dart`

```dart
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/storage_keys.dart';

class LocalStorageService {
  static SharedPreferences? _prefs;

  static Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  // String operations
  static Future<bool> setString(String key, String value) async {
    return await _prefs!.setString(key, value);
  }

  static String? getString(String key) {
    return _prefs!.getString(key);
  }

  // Int operations
  static Future<bool> setInt(String key, int value) async {
    return await _prefs!.setInt(key, value);
  }

  static int? getInt(String key) {
    return _prefs!.getInt(key);
  }

  // Bool operations
  static Future<bool> setBool(String key, bool value) async {
    return await _prefs!.setBool(key, value);
  }

  static bool? getBool(String key) {
    return _prefs!.getBool(key);
  }

  // Clear
  static Future<bool> clear() async {
    return await _prefs!.clear();
  }

  // Remove specific key
  static Future<bool> remove(String key) async {
    return await _prefs!.remove(key);
  }
}
```

### Step 2.3: API Client Setup

**File**: `lib/core/network/api_client.dart`

```dart
import 'package:dio/dio.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage.dart';
import '../errors/failures.dart';

class ApiClient {
  late final Dio _dio;

  ApiClient() {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: ApiConstants.connectTimeout,
        receiveTimeout: ApiConstants.receiveTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    _setupInterceptors();
  }

  void _setupInterceptors() {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Add auth token
          final token = await SecureStorageService.getToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            // Token expired, clear storage and redirect to login
            await SecureStorageService.clearAll();
            // Navigation handled by auth provider
          }
          return handler.next(error);
        },
        onResponse: (response, handler) {
          return handler.next(response);
        },
      ),
    );

    // Logging interceptor (development only)
    _dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
      error: true,
    ));
  }

  Dio get dio => _dio;

  // Generic GET request
  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await _dio.get(path, queryParameters: queryParameters);
      return response.data as T;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // Generic POST request
  Future<T> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await _dio.post(
        path,
        data: data,
        queryParameters: queryParameters,
      );
      return response.data as T;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // Generic PUT request
  Future<T> put<T>(
    String path, {
    dynamic data,
  }) async {
    try {
      final response = await _dio.put(path, data: data);
      return response.data as T;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // Generic DELETE request
  Future<T> delete<T>(String path) async {
    try {
      final response = await _dio.delete(path);
      return response.data as T;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Failure _handleError(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return NetworkFailure('Connection timeout');
      case DioExceptionType.badResponse:
        final statusCode = error.response?.statusCode;
        final message = error.response?.data['error'] ?? 'Unknown error';
        return ServerFailure(message, statusCode: statusCode);
      case DioExceptionType.cancel:
        return NetworkFailure('Request cancelled');
      default:
        return NetworkFailure('Network error: ${error.message}');
    }
  }
}
```

### Step 2.4: WebSocket Service

**File**: `lib/core/network/websocket_service.dart`

```dart
import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../constants/api_constants.dart';
import '../storage/secure_storage.dart';

class WebSocketService {
  IO.Socket? _socket;
  final _regulationUpdatesController = StreamController<Map<String, dynamic>>.broadcast();
  final _linkUpdatesController = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get regulationUpdates => _regulationUpdatesController.stream;
  Stream<Map<String, dynamic>> get linkUpdates => _linkUpdatesController.stream;

  Future<void> connect() async {
    final token = await SecureStorageService.getToken();
    if (token == null) return;

    _socket = IO.io(
      ApiConstants.baseUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setQuery({'token': token})
          .enableAutoConnect()
          .build(),
    );

    _socket!.onConnect((_) {
      print('WebSocket connected');
    });

    _socket!.onDisconnect((_) {
      print('WebSocket disconnected');
    });

    _socket!.on('regulation-updated', (data) {
      _regulationUpdatesController.add(data as Map<String, dynamic>);
    });

    _socket!.on('case-links-refreshed', (data) {
      _linkUpdatesController.add(data as Map<String, dynamic>);
    });

    _socket!.connect();
  }

  void disconnect() {
    _socket?.disconnect();
    _socket = null;
  }

  void dispose() {
    disconnect();
    _regulationUpdatesController.close();
    _linkUpdatesController.close();
  }
}
```

---

## Phase 3: Models & Data Layer

### Step 3.1: User Model

**File**: `lib/features/auth/models/user.dart`

```dart
import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

@JsonSerializable()
class User {
  final int id;
  final String email;
  @JsonKey(name: 'full_name')
  final String fullName;
  final String role;
  @JsonKey(name: 'organization_id')
  final int organizationId;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;

  User({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.organizationId,
    required this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}

@JsonSerializable()
class AuthResponse {
  final User user;
  final String token;

  AuthResponse({
    required this.user,
    required this.token,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) => _$AuthResponseFromJson(json);
  Map<String, dynamic> toJson() => _$AuthResponseToJson(this);
}
```

### Step 3.2: Case Model

**File**: `lib/features/cases/models/case.dart`

```dart
import 'package:json_annotation/json_annotation.dart';

part 'case.g.dart';

enum CaseType {
  @JsonValue('criminal')
  criminal,
  @JsonValue('civil')
  civil,
  @JsonValue('commercial')
  commercial,
  @JsonValue('labor')
  labor,
  @JsonValue('family')
  family,
  @JsonValue('administrative')
  administrative,
}

enum CaseStatus {
  @JsonValue('open')
  open,
  @JsonValue('in_progress')
  inProgress,
  @JsonValue('pending_hearing')
  pendingHearing,
  @JsonValue('closed')
  closed,
  @JsonValue('archived')
  archived,
}

@JsonSerializable()
class Case {
  final int id;
  @JsonKey(name: 'organization_id')
  final int organizationId;
  @JsonKey(name: 'case_number')
  final String caseNumber;
  final String title;
  final String? description;
  @JsonKey(name: 'case_type')
  final CaseType caseType;
  final CaseStatus status;
  @JsonKey(name: 'client_info')
  final String? clientInfo;
  @JsonKey(name: 'assigned_lawyer_id')
  final int? assignedLawyerId;
  @JsonKey(name: 'court_jurisdiction')
  final String? courtJurisdiction;
  @JsonKey(name: 'filing_date')
  final DateTime? filingDate;
  @JsonKey(name: 'next_hearing')
  final DateTime? nextHearing;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;

  Case({
    required this.id,
    required this.organizationId,
    required this.caseNumber,
    required this.title,
    this.description,
    required this.caseType,
    required this.status,
    this.clientInfo,
    this.assignedLawyerId,
    this.courtJurisdiction,
    this.filingDate,
    this.nextHearing,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Case.fromJson(Map<String, dynamic> json) => _$CaseFromJson(json);
  Map<String, dynamic> toJson() => _$CaseToJson(this);
}
```

### Step 3.3: Regulation & Link Models

**File**: `lib/features/regulations/models/regulation.dart`

```dart
import 'package:json_annotation/json_annotation.dart';

part 'regulation.g.dart';

@JsonSerializable()
class Regulation {
  final int id;
  final String title;
  @JsonKey(name: 'regulation_number')
  final String? regulationNumber;
  final String? category;
  final String? jurisdiction;
  final String status;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;

  Regulation({
    required this.id,
    required this.title,
    this.regulationNumber,
    this.category,
    this.jurisdiction,
    required this.status,
    required this.createdAt,
  });

  factory Regulation.fromJson(Map<String, dynamic> json) => _$RegulationFromJson(json);
  Map<String, dynamic> toJson() => _$RegulationToJson(this);
}

@JsonSerializable()
class CaseRegulationLink {
  final int id;
  @JsonKey(name: 'case_id')
  final int caseId;
  @JsonKey(name: 'regulation_id')
  final int regulationId;
  @JsonKey(name: 'similarity_score')
  final double similarityScore;
  final String method;
  final bool verified;
  final Regulation? regulation;

  CaseRegulationLink({
    required this.id,
    required this.caseId,
    required this.regulationId,
    required this.similarityScore,
    required this.method,
    required this.verified,
    this.regulation,
  });

  factory CaseRegulationLink.fromJson(Map<String, dynamic> json) =>
      _$CaseRegulationLinkFromJson(json);
  Map<String, dynamic> toJson() => _$CaseRegulationLinkToJson(this);
}
```

---

## Phase 4: Authentication Provider

### Step 4.1: Auth Provider

**File**: `lib/features/auth/providers/auth_provider.dart`

```dart
import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/storage/local_storage.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/constants/storage_keys.dart';

enum AuthState {
  initial,
  loading,
  authenticated,
  unauthenticated,
  error,
}

class AuthProvider extends ChangeNotifier {
  final ApiClient _apiClient;

  AuthState _state = AuthState.initial;
  User? _currentUser;
  String? _errorMessage;

  AuthProvider(this._apiClient);

  // Getters
  AuthState get state => _state;
  User? get currentUser => _currentUser;
  String? get errorMessage => _errorMessage;
  bool get isAuthenticated => _state == AuthState.authenticated;

  // Check if user is already logged in
  Future<void> checkAuthStatus() async {
    final hasToken = await SecureStorageService.hasToken();
    if (hasToken) {
      await loadCurrentUser();
    } else {
      _state = AuthState.unauthenticated;
      notifyListeners();
    }
  }

  // Login
  Future<bool> login(String email, String password) async {
    try {
      _state = AuthState.loading;
      _errorMessage = null;
      notifyListeners();

      final response = await _apiClient.post(
        ApiConstants.loginEndpoint,
        data: {
          'email': email,
          'password': password,
        },
      );

      final authResponse = AuthResponse.fromJson(response);

      // Save token
      await SecureStorageService.saveToken(authResponse.token);

      // Save user info
      await LocalStorageService.setInt(StorageKeys.userId, authResponse.user.id);
      await LocalStorageService.setString(StorageKeys.userEmail, authResponse.user.email);
      await LocalStorageService.setInt(StorageKeys.organizationId, authResponse.user.organizationId);

      _currentUser = authResponse.user;
      _state = AuthState.authenticated;
      notifyListeners();

      return true;
    } catch (e) {
      _state = AuthState.error;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  // Register
  Future<bool> register({
    required String email,
    required String password,
    required String fullName,
    required int organizationId,
  }) async {
    try {
      _state = AuthState.loading;
      _errorMessage = null;
      notifyListeners();

      final response = await _apiClient.post(
        ApiConstants.registerEndpoint,
        data: {
          'email': email,
          'password': password,
          'fullName': fullName,
          'organizationId': organizationId,
        },
      );

      final authResponse = AuthResponse.fromJson(response);

      await SecureStorageService.saveToken(authResponse.token);
      await LocalStorageService.setInt(StorageKeys.userId, authResponse.user.id);
      await LocalStorageService.setString(StorageKeys.userEmail, authResponse.user.email);

      _currentUser = authResponse.user;
      _state = AuthState.authenticated;
      notifyListeners();

      return true;
    } catch (e) {
      _state = AuthState.error;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  // Load current user
  Future<void> loadCurrentUser() async {
    try {
      final response = await _apiClient.get(ApiConstants.meEndpoint);
      _currentUser = User.fromJson(response['user']);
      _state = AuthState.authenticated;
      notifyListeners();
    } catch (e) {
      _state = AuthState.unauthenticated;
      notifyListeners();
    }
  }

  // Logout
  Future<void> logout() async {
    await SecureStorageService.clearAll();
    await LocalStorageService.clear();
    _currentUser = null;
    _state = AuthState.unauthenticated;
    notifyListeners();
  }
}
```

---

## Phase 5: Cases Provider

### Step 5.1: Cases Provider

**File**: `lib/features/cases/providers/cases_provider.dart`

```dart
import 'package:flutter/foundation.dart';
import '../models/case.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/storage/local_storage.dart';
import '../../../core/constants/storage_keys.dart';
import 'dart:convert';

class CasesProvider extends ChangeNotifier {
  final ApiClient _apiClient;

  List<Case> _cases = [];
  bool _isLoading = false;
  String? _errorMessage;

  // Filters
  CaseStatus? _statusFilter;
  CaseType? _typeFilter;

  CasesProvider(this._apiClient) {
    loadCases();
  }

  // Getters
  List<Case> get cases => _cases;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  CaseStatus? get statusFilter => _statusFilter;
  CaseType? get typeFilter => _typeFilter;

  List<Case> get filteredCases {
    var filtered = _cases;

    if (_statusFilter != null) {
      filtered = filtered.where((c) => c.status == _statusFilter).toList();
    }

    if (_typeFilter != null) {
      filtered = filtered.where((c) => c.caseType == _typeFilter).toList();
    }

    return filtered;
  }

  // Set filters
  void setStatusFilter(CaseStatus? status) {
    _statusFilter = status;
    notifyListeners();
  }

  void setTypeFilter(CaseType? type) {
    _typeFilter = type;
    notifyListeners();
  }

  void clearFilters() {
    _statusFilter = null;
    _typeFilter = null;
    notifyListeners();
  }

  // Load cases from API
  Future<void> loadCases({bool forceRefresh = false}) async {
    if (_isLoading) return;

    // Try to load from cache first
    if (!forceRefresh && _cases.isEmpty) {
      await _loadFromCache();
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _apiClient.get(ApiConstants.casesEndpoint);
      final casesList = (response['cases'] as List)
          .map((json) => Case.fromJson(json))
          .toList();

      _cases = casesList;

      // Cache the data
      await _cacheToStorage();

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _errorMessage = e.toString();
      _isLoading = false;
      notifyListeners();
    }
  }

  // Create case
  Future<Case?> createCase({
    required String caseNumber,
    required String title,
    String? description,
    required CaseType caseType,
    String? clientInfo,
    String? courtJurisdiction,
    DateTime? filingDate,
    DateTime? nextHearing,
  }) async {
    try {
      _isLoading = true;
      notifyListeners();

      final response = await _apiClient.post(
        ApiConstants.casesEndpoint,
        data: {
          'caseNumber': caseNumber,
          'title': title,
          'description': description,
          'caseType': caseType.name,
          'clientInfo': clientInfo,
          'courtJurisdiction': courtJurisdiction,
          'filingDate': filingDate?.toIso8601String(),
          'nextHearing': nextHearing?.toIso8601String(),
        },
      );

      final newCase = Case.fromJson(response['case']);
      _cases.insert(0, newCase);

      await _cacheToStorage();

      _isLoading = false;
      notifyListeners();

      return newCase;
    } catch (e) {
      _errorMessage = e.toString();
      _isLoading = false;
      notifyListeners();
      return null;
    }
  }

  // Update case
  Future<bool> updateCase(int caseId, Map<String, dynamic> updates) async {
    try {
      _isLoading = true;
      notifyListeners();

      final response = await _apiClient.put(
        ApiConstants.caseDetailEndpoint(caseId),
        data: updates,
      );

      final updatedCase = Case.fromJson(response['case']);
      final index = _cases.indexWhere((c) => c.id == caseId);

      if (index != -1) {
        _cases[index] = updatedCase;
        await _cacheToStorage();
      }

      _isLoading = false;
      notifyListeners();

      return true;
    } catch (e) {
      _errorMessage = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  // Delete case
  Future<bool> deleteCase(int caseId) async {
    try {
      await _apiClient.delete(ApiConstants.caseDetailEndpoint(caseId));
      _cases.removeWhere((c) => c.id == caseId);
      await _cacheToStorage();
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  // Cache management
  Future<void> _cacheToStorage() async {
    final jsonList = _cases.map((c) => c.toJson()).toList();
    await LocalStorageService.setString(
      StorageKeys.cachedCases,
      jsonEncode(jsonList),
    );
  }

  Future<void> _loadFromCache() async {
    final cached = LocalStorageService.getString(StorageKeys.cachedCases);
    if (cached != null) {
      final jsonList = jsonDecode(cached) as List;
      _cases = jsonList.map((json) => Case.fromJson(json)).toList();
      notifyListeners();
    }
  }
}
```

### Step 5.2: Case Detail Provider

**File**: `lib/features/cases/providers/case_detail_provider.dart`

```dart
import 'package:flutter/foundation.dart';
import '../models/case.dart';
import '../../regulations/models/regulation.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_constants.dart';

class CaseDetailProvider extends ChangeNotifier {
  final ApiClient _apiClient;
  final int caseId;

  Case? _case;
  List<CaseRegulationLink> _aiLinks = [];
  bool _isLoading = false;
  bool _isGeneratingLinks = false;
  String? _errorMessage;

  CaseDetailProvider(this._apiClient, this.caseId) {
    loadCaseDetail();
    loadAILinks();
  }

  // Getters
  Case? get case_ => _case;
  List<CaseRegulationLink> get aiLinks => _aiLinks;
  bool get isLoading => _isLoading;
  bool get isGeneratingLinks => _isGeneratingLinks;
  String? get errorMessage => _errorMessage;

  // Load case detail
  Future<void> loadCaseDetail() async {
    _isLoading = true;
    notifyListeners();

    try {
      final response = await _apiClient.get(
        ApiConstants.caseDetailEndpoint(caseId),
      );
      _case = Case.fromJson(response['case']);
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _errorMessage = e.toString();
      _isLoading = false;
      notifyListeners();
    }
  }

  // Load AI links
  Future<void> loadAILinks() async {
    try {
      final response = await _apiClient.get(
        ApiConstants.aiLinksEndpoint(caseId),
      );

      _aiLinks = (response['links'] as List)
          .map((json) => CaseRegulationLink.fromJson(json))
          .toList();

      notifyListeners();
    } catch (e) {
      print('Error loading AI links: $e');
    }
  }

  // Generate AI links
  Future<void> generateAILinks() async {
    _isGeneratingLinks = true;
    notifyListeners();

    try {
      final response = await _apiClient.post(
        ApiConstants.generateLinksEndpoint(caseId),
      );

      _aiLinks = (response['links'] as List)
          .map((json) => CaseRegulationLink.fromJson(json))
          .toList();

      _isGeneratingLinks = false;
      notifyListeners();
    } catch (e) {
      _errorMessage = e.toString();
      _isGeneratingLinks = false;
      notifyListeners();
    }
  }

  // Verify a link
  Future<void> verifyLink(int linkId) async {
    try {
      await _apiClient.post(ApiConstants.verifyLinkEndpoint(linkId));

      final index = _aiLinks.indexWhere((link) => link.id == linkId);
      if (index != -1) {
        // Reload links to get updated data
        await loadAILinks();
      }
    } catch (e) {
      print('Error verifying link: $e');
    }
  }
}
```

---

## Phase 6: UI Screens

### Step 6.1: Login Screen

**File**: `lib/features/auth/screens/login_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    final authProvider = context.read<AuthProvider>();
    final success = await authProvider.login(
      _emailController.text.trim(),
      _passwordController.text,
    );

    if (success && mounted) {
      Navigator.of(context).pushReplacementNamed('/dashboard');
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(authProvider.errorMessage ?? 'Login failed')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Logo
                  Icon(
                    Icons.gavel,
                    size: 80,
                    color: Theme.of(context).primaryColor,
                  ),
                  const SizedBox(height: 16),

                  // Title
                  Text(
                    'نظام إدارة القضايا القانونية',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 48),

                  // Email field
                  TextFormField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'البريد الإلكتروني',
                      prefixIcon: Icon(Icons.email),
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'الرجاء إدخال البريد الإلكتروني';
                      }
                      if (!value.contains('@')) {
                        return 'بريد إلكتروني غير صالح';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  // Password field
                  TextFormField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    decoration: InputDecoration(
                      labelText: 'كلمة المرور',
                      prefixIcon: const Icon(Icons.lock),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility : Icons.visibility_off,
                        ),
                        onPressed: () {
                          setState(() {
                            _obscurePassword = !_obscurePassword;
                          });
                        },
                      ),
                      border: const OutlineInputBorder(),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'الرجاء إدخال كلمة المرور';
                      }
                      if (value.length < 8) {
                        return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),

                  // Login button
                  Consumer<AuthProvider>(
                    builder: (context, authProvider, _) {
                      return ElevatedButton(
                        onPressed: authProvider.state == AuthState.loading
                            ? null
                            : _handleLogin,
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.all(16),
                        ),
                        child: authProvider.state == AuthState.loading
                            ? const CircularProgressIndicator()
                            : const Text('تسجيل الدخول', style: TextStyle(fontSize: 16)),
                      );
                    },
                  ),

                  const SizedBox(height: 16),

                  // Register link
                  TextButton(
                    onPressed: () {
                      Navigator.of(context).pushNamed('/register');
                    },
                    child: const Text('إنشاء حساب جديد'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
```

### Step 6.2: Cases List Screen

**File**: `lib/features/cases/screens/cases_list_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/cases_provider.dart';
import '../widgets/case_card.dart';
import '../models/case.dart';

class CasesListScreen extends StatelessWidget {
  const CasesListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('القضايا'),
        actions: [
          // Filter button
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => _showFilterDialog(context),
          ),
        ],
      ),
      body: Consumer<CasesProvider>(
        builder: (context, provider, _) {
          if (provider.isLoading && provider.cases.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }

          if (provider.errorMessage != null && provider.cases.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 64, color: Colors.grey),
                  const SizedBox(height: 16),
                  Text(provider.errorMessage!),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => provider.loadCases(forceRefresh: true),
                    child: const Text('إعادة المحاولة'),
                  ),
                ],
              ),
            );
          }

          final cases = provider.filteredCases;

          if (cases.isEmpty) {
            return const Center(
              child: Text('لا توجد قضايا'),
            );
          }

          return RefreshIndicator(
            onRefresh: () => provider.loadCases(forceRefresh: true),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: cases.length,
              itemBuilder: (context, index) {
                return CaseCard(case_: cases[index]);
              },
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.of(context).pushNamed('/cases/create');
        },
        child: const Icon(Icons.add),
      ),
    );
  }

  void _showFilterDialog(BuildContext context) {
    final provider = context.read<CasesProvider>();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('تصفية القضايا'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Status filter
            DropdownButtonFormField<CaseStatus?>(
              value: provider.statusFilter,
              decoration: const InputDecoration(labelText: 'الحالة'),
              items: [
                const DropdownMenuItem(value: null, child: Text('الكل')),
                ...CaseStatus.values.map((status) {
                  return DropdownMenuItem(
                    value: status,
                    child: Text(_getStatusLabel(status)),
                  );
                }),
              ],
              onChanged: (value) => provider.setStatusFilter(value),
            ),

            const SizedBox(height: 16),

            // Type filter
            DropdownButtonFormField<CaseType?>(
              value: provider.typeFilter,
              decoration: const InputDecoration(labelText: 'النوع'),
              items: [
                const DropdownMenuItem(value: null, child: Text('الكل')),
                ...CaseType.values.map((type) {
                  return DropdownMenuItem(
                    value: type,
                    child: Text(_getTypeLabel(type)),
                  );
                }),
              ],
              onChanged: (value) => provider.setTypeFilter(value),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              provider.clearFilters();
              Navigator.pop(context);
            },
            child: const Text('مسح'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('تطبيق'),
          ),
        ],
      ),
    );
  }

  String _getStatusLabel(CaseStatus status) {
    switch (status) {
      case CaseStatus.open:
        return 'مفتوحة';
      case CaseStatus.inProgress:
        return 'قيد التنفيذ';
      case CaseStatus.pendingHearing:
        return 'بانتظار الجلسة';
      case CaseStatus.closed:
        return 'مغلقة';
      case CaseStatus.archived:
        return 'مؤرشفة';
    }
  }

  String _getTypeLabel(CaseType type) {
    switch (type) {
      case CaseType.criminal:
        return 'جنائية';
      case CaseType.civil:
        return 'مدنية';
      case CaseType.commercial:
        return 'تجارية';
      case CaseType.labor:
        return 'عمالية';
      case CaseType.family:
        return 'أسرية';
      case CaseType.administrative:
        return 'إدارية';
    }
  }
}
```

### Step 6.3: Case Detail Screen with AI Suggestions

**File**: `lib/features/cases/screens/case_detail_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago';
import '../providers/case_detail_provider.dart';
import '../widgets/ai_suggestions_widget.dart';
import '../models/case.dart';

class CaseDetailScreen extends StatelessWidget {
  final int caseId;

  const CaseDetailScreen({super.key, required this.caseId});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => CaseDetailProvider(
        context.read<ApiClient>(),
        caseId,
      ),
      child: Scaffold(
        appBar: AppBar(
          title: const Text('تفاصيل القضية'),
          actions: [
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () {
                Navigator.of(context).pushNamed('/cases/$caseId/edit');
              },
            ),
          ],
        ),
        body: Consumer<CaseDetailProvider>(
          builder: (context, provider, _) {
            if (provider.isLoading && provider.case_ == null) {
              return const Center(child: CircularProgressIndicator());
            }

            if (provider.case_ == null) {
              return const Center(child: Text('القضية غير موجودة'));
            }

            final case_ = provider.case_!;

            return RefreshIndicator(
              onRefresh: () => provider.loadCaseDetail(),
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Case header
                    _buildCaseHeader(context, case_),
                    const SizedBox(height: 24),

                    // Case details
                    _buildCaseDetails(context, case_),
                    const SizedBox(height: 24),

                    const Divider(),
                    const SizedBox(height: 16),

                    // AI Suggestions section
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'الأنظمة المقترحة بالذكاء الاصطناعي',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        if (!provider.isGeneratingLinks)
                          IconButton(
                            icon: const Icon(Icons.refresh),
                            onPressed: () => provider.generateAILinks(),
                            tooltip: 'تحديث الاقتراحات',
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    AISuggestionsWidget(
                      links: provider.aiLinks,
                      isLoading: provider.isGeneratingLinks,
                      onVerify: (linkId) => provider.verifyLink(linkId),
                      onGenerate: () => provider.generateAILinks(),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildCaseHeader(BuildContext context, Case case_) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Chip(
                  label: Text(case_.caseNumber),
                  backgroundColor: Theme.of(context).primaryColor.withOpacity(0.1),
                ),
                const SizedBox(width: 8),
                _buildStatusChip(context, case_.status),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              case_.title,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            if (case_.description != null) ...[
              const SizedBox(height: 8),
              Text(
                case_.description!,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildCaseDetails(BuildContext context, Case case_) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildDetailRow('النوع:', _getCaseTypeLabel(case_.caseType)),
            _buildDetailRow('الحالة:', _getCaseStatusLabel(case_.status)),
            if (case_.courtJurisdiction != null)
              _buildDetailRow('المحكمة:', case_.courtJurisdiction!),
            if (case_.filingDate != null)
              _buildDetailRow('تاريخ التقديم:', _formatDate(case_.filingDate!)),
            if (case_.nextHearing != null)
              _buildDetailRow('الجلسة القادمة:', _formatDateTime(case_.nextHearing!)),
            _buildDetailRow('تاريخ الإنشاء:', _formatDateTime(case_.createdAt)),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          Expanded(
            child: Text(value),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusChip(BuildContext context, CaseStatus status) {
    Color color;
    switch (status) {
      case CaseStatus.open:
        color = Colors.blue;
        break;
      case CaseStatus.inProgress:
        color = Colors.orange;
        break;
      case CaseStatus.pendingHearing:
        color = Colors.purple;
        break;
      case CaseStatus.closed:
        color = Colors.green;
        break;
      case CaseStatus.archived:
        color = Colors.grey;
        break;
    }

    return Chip(
      label: Text(_getCaseStatusLabel(status)),
      backgroundColor: color.withOpacity(0.2),
      labelStyle: TextStyle(color: color),
    );
  }

  String _getCaseTypeLabel(CaseType type) {
    switch (type) {
      case CaseType.criminal:
        return 'جنائية';
      case CaseType.civil:
        return 'مدنية';
      case CaseType.commercial:
        return 'تجارية';
      case CaseType.labor:
        return 'عمالية';
      case CaseType.family:
        return 'أسرية';
      case CaseType.administrative:
        return 'إدارية';
    }
  }

  String _getCaseStatusLabel(CaseStatus status) {
    switch (status) {
      case CaseStatus.open:
        return 'مفتوحة';
      case CaseStatus.inProgress:
        return 'قيد التنفيذ';
      case CaseStatus.pendingHearing:
        return 'بانتظار الجلسة';
      case CaseStatus.closed:
        return 'مغلقة';
      case CaseStatus.archived:
        return 'مؤرشفة';
    }
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  String _formatDateTime(DateTime dateTime) {
    return timeago.format(dateTime, locale: 'ar');
  }
}
```

### Step 6.4: AI Suggestions Widget

**File**: `lib/features/cases/widgets/ai_suggestions_widget.dart`

```dart
import 'package:flutter/material.dart';
import '../../regulations/models/regulation.dart';

class AISuggestionsWidget extends StatelessWidget {
  final List<CaseRegulationLink> links;
  final bool isLoading;
  final Function(int linkId) onVerify;
  final VoidCallback onGenerate;

  const AISuggestionsWidget({
    super.key,
    required this.links,
    required this.isLoading,
    required this.onVerify,
    required this.onGenerate,
  });

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(32.0),
          child: Center(
            child: Column(
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('جاري البحث عن الأنظمة ذات الصلة...'),
              ],
            ),
          ),
        ),
      );
    }

    if (links.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            children: [
              const Icon(Icons.auto_awesome, size: 64, color: Colors.grey),
              const SizedBox(height: 16),
              const Text(
                'لم يتم إنشاء اقتراحات بعد',
                style: TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: onGenerate,
                icon: const Icon(Icons.psychology),
                label: const Text('إنشاء اقتراحات بالذكاء الاصطناعي'),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: links.map((link) => _buildLinkCard(context, link)).toList(),
    );
  }

  Widget _buildLinkCard(BuildContext context, CaseRegulationLink link) {
    final scorePercent = (link.similarityScore * 100).toStringAsFixed(1);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: _getScoreColor(link.similarityScore),
          child: Text(
            '$scorePercent%',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        title: Text(
          link.regulation?.title ?? 'نظام قانوني',
          style: const TextStyle(fontWeight: FontWeight.w500),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text('التصنيف: ${link.regulation?.category ?? "غير محدد"}'),
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(
                  link.method == 'ai' ? Icons.psychology : Icons.person,
                  size: 14,
                  color: Colors.grey,
                ),
                const SizedBox(width: 4),
                Text(
                  link.method == 'ai' ? 'اقتراح آلي' : 'إضافة يدوية',
                  style: const TextStyle(fontSize: 12),
                ),
                if (link.verified) ...[
                  const SizedBox(width: 8),
                  const Icon(Icons.verified, size: 14, color: Colors.green),
                  const SizedBox(width: 4),
                  const Text('موثق', style: TextStyle(fontSize: 12)),
                ],
              ],
            ),
          ],
        ),
        trailing: link.verified
            ? const Icon(Icons.check_circle, color: Colors.green)
            : IconButton(
                icon: const Icon(Icons.check),
                onPressed: () => onVerify(link.id),
                tooltip: 'توثيق الاقتراح',
              ),
        onTap: () {
          // Navigate to regulation detail
          Navigator.of(context).pushNamed(
            '/regulations/${link.regulationId}',
          );
        },
      ),
    );
  }

  Color _getScoreColor(double score) {
    if (score >= 0.8) return Colors.green;
    if (score >= 0.6) return Colors.orange;
    return Colors.red;
  }
}
```

### Step 6.5: Create Case Screen

**File**: `lib/features/cases/screens/create_case_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/cases_provider.dart';
import '../models/case.dart';

class CreateCaseScreen extends StatefulWidget {
  const CreateCaseScreen({super.key});

  @override
  State<CreateCaseScreen> createState() => _CreateCaseScreenState();
}

class _CreateCaseScreenState extends State<CreateCaseScreen> {
  final _formKey = GlobalKey<FormState>();

  final _caseNumberController = TextEditingController();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _clientInfoController = TextEditingController();
  final _jurisdictionController = TextEditingController();

  CaseType _selectedType = CaseType.civil;
  DateTime? _filingDate;
  DateTime? _nextHearing;

  @override
  void dispose() {
    _caseNumberController.dispose();
    _titleController.dispose();
    _descriptionController.dispose();
    _clientInfoController.dispose();
    _jurisdictionController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    final provider = context.read<CasesProvider>();

    final newCase = await provider.createCase(
      caseNumber: _caseNumberController.text.trim(),
      title: _titleController.text.trim(),
      description: _descriptionController.text.trim(),
      caseType: _selectedType,
      clientInfo: _clientInfoController.text.trim(),
      courtJurisdiction: _jurisdictionController.text.trim(),
      filingDate: _filingDate,
      nextHearing: _nextHearing,
    );

    if (newCase != null && mounted) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إنشاء القضية بنجاح')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('قضية جديدة'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Case Number
            TextFormField(
              controller: _caseNumberController,
              decoration: const InputDecoration(
                labelText: 'رقم القضية *',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.numbers),
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'الرجاء إدخال رقم القضية';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),

            // Title
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: 'العنوان *',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.title),
              ),
              maxLines: 2,
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'الرجاء إدخال العنوان';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),

            // Description
            TextFormField(
              controller: _descriptionController,
              decoration: const InputDecoration(
                labelText: 'الوصف',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.description),
              ),
              maxLines: 5,
            ),
            const SizedBox(height: 16),

            // Case Type
            DropdownButtonFormField<CaseType>(
              value: _selectedType,
              decoration: const InputDecoration(
                labelText: 'نوع القضية *',
                border: OutlineInputBorder(),
              ),
              items: CaseType.values.map((type) {
                return DropdownMenuItem(
                  value: type,
                  child: Text(_getCaseTypeLabel(type)),
                );
              }).toList(),
              onChanged: (value) {
                setState(() {
                  _selectedType = value!;
                });
              },
            ),
            const SizedBox(height: 16),

            // Client Info
            TextFormField(
              controller: _clientInfoController,
              decoration: const InputDecoration(
                labelText: 'معلومات العميل',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.person),
              ),
              maxLines: 2,
            ),
            const SizedBox(height: 16),

            // Jurisdiction
            TextFormField(
              controller: _jurisdictionController,
              decoration: const InputDecoration(
                labelText: 'الاختصاص القضائي',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.location_city),
              ),
            ),
            const SizedBox(height: 16),

            // Filing Date
            InkWell(
              onTap: () async {
                final date = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2030),
                );
                if (date != null) {
                  setState(() {
                    _filingDate = date;
                  });
                }
              },
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'تاريخ التقديم',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.calendar_today),
                ),
                child: Text(
                  _filingDate != null
                      ? _formatDate(_filingDate!)
                      : 'اختر التاريخ',
                ),
              ),
            ),
            const SizedBox(height: 32),

            // Submit button
            Consumer<CasesProvider>(
              builder: (context, provider, _) {
                return ElevatedButton(
                  onPressed: provider.isLoading ? null : _handleSubmit,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.all(16),
                  ),
                  child: provider.isLoading
                      ? const CircularProgressIndicator()
                      : const Text('حفظ القضية', style: TextStyle(fontSize: 16)),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  String _getCaseTypeLabel(CaseType type) {
    switch (type) {
      case CaseType.criminal:
        return 'جنائية';
      case CaseType.civil:
        return 'مدنية';
      case CaseType.commercial:
        return 'تجارية';
      case CaseType.labor:
        return 'عمالية';
      case CaseType.family:
        return 'أسرية';
      case CaseType.administrative:
        return 'إدارية';
    }
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }
}
```

---

## Phase 7: Main App & Routes

### Step 7.1: Route Configuration

**File**: `lib/app/routes.dart`

```dart
import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/register_screen.dart';
import '../features/dashboard/screens/dashboard_screen.dart';
import '../features/cases/screens/cases_list_screen.dart';
import '../features/cases/screens/case_detail_screen.dart';
import '../features/cases/screens/create_case_screen.dart';
import '../features/auth/providers/auth_provider.dart';

class AppRouter {
  final AuthProvider authProvider;

  AppRouter(this.authProvider);

  late final GoRouter router = GoRouter(
    initialLocation: '/login',
    refreshListenable: authProvider,
    redirect: (context, state) {
      final isAuthenticated = authProvider.isAuthenticated;
      final isOnLoginPage = state.matchedLocation == '/login';
      final isOnRegisterPage = state.matchedLocation == '/register';

      if (!isAuthenticated && !isOnLoginPage && !isOnRegisterPage) {
        return '/login';
      }

      if (isAuthenticated && (isOnLoginPage || isOnRegisterPage)) {
        return '/dashboard';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/dashboard',
        builder: (context, state) => const DashboardScreen(),
      ),
      GoRoute(
        path: '/cases',
        builder: (context, state) => const CasesListScreen(),
      ),
      GoRoute(
        path: '/cases/create',
        builder: (context, state) => const CreateCaseScreen(),
      ),
      GoRoute(
        path: '/cases/:id',
        builder: (context, state) {
          final id = int.parse(state.pathParameters['id']!);
          return CaseDetailScreen(caseId: id);
        },
      ),
    ],
  );
}
```

### Step 7.2: Main App

**File**: `lib/main.dart`

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/storage/local_storage.dart';
import 'core/network/api_client.dart';
import 'core/network/websocket_service.dart';
import 'features/auth/providers/auth_provider.dart';
import 'features/cases/providers/cases_provider.dart';
import 'features/regulations/providers/regulations_provider.dart';
import 'features/dashboard/providers/dashboard_provider.dart';
import 'app/routes.dart';
import 'app/theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize storage
  await LocalStorageService.init();

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        // Core services
        Provider(create: (_) => ApiClient()),
        Provider(create: (_) => WebSocketService()),

        // Auth provider
        ChangeNotifierProvider(
          create: (context) => AuthProvider(context.read<ApiClient>())
            ..checkAuthStatus(),
        ),

        // Feature providers
        ChangeNotifierProxyProvider<ApiClient, CasesProvider>(
          create: (context) => CasesProvider(context.read<ApiClient>()),
          update: (context, apiClient, previous) =>
              previous ?? CasesProvider(apiClient),
        ),

        ChangeNotifierProxyProvider<ApiClient, RegulationsProvider>(
          create: (context) => RegulationsProvider(context.read<ApiClient>()),
          update: (context, apiClient, previous) =>
              previous ?? RegulationsProvider(apiClient),
        ),

        ChangeNotifierProxyProvider<ApiClient, DashboardProvider>(
          create: (context) => DashboardProvider(context.read<ApiClient>()),
          update: (context, apiClient, previous) =>
              previous ?? DashboardProvider(apiClient),
        ),
      ],
      child: Consumer<AuthProvider>(
        builder: (context, authProvider, _) {
          final router = AppRouter(authProvider).router;

          return MaterialApp.router(
            title: 'نظام إدارة القضايا القانونية',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            darkTheme: AppTheme.darkTheme,
            themeMode: ThemeMode.system,
            routerConfig: router,
            locale: const Locale('ar'),
            supportedLocales: const [
              Locale('ar'),
              Locale('en'),
            ],
          );
        },
      ),
    );
  }
}
```

### Step 7.3: Theme Configuration

**File**: `lib/app/theme.dart`

```dart
import 'package:flutter/material.dart';

class AppTheme {
  // Primary colors
  static const Color primaryColor = Color(0xFF1E88E5);
  static const Color accentColor = Color(0xFFFFA726);

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        brightness: Brightness.light,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
      ),
      cardTheme: CardTheme(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
        ),
        filled: true,
      ),
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        brightness: Brightness.dark,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
      ),
      cardTheme: CardTheme(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }
}
```

---

## Phase 8: Shared Widgets

### Step 8.1: Loading Indicator

**File**: `lib/shared/widgets/loading_indicator.dart`

```dart
import 'package:flutter/material.dart';

class LoadingIndicator extends StatelessWidget {
  final String? message;

  const LoadingIndicator({super.key, this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          if (message != null) ...[
            const SizedBox(height: 16),
            Text(message!),
          ],
        ],
      ),
    );
  }
}
```

### Step 8.2: Error Widget

**File**: `lib/shared/widgets/error_widget.dart`

```dart
import 'package:flutter/material.dart';

class ErrorDisplay extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;

  const ErrorDisplay({
    super.key,
    required this.message,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red,
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('إعادة المحاولة'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

---

## Implementation Checklist

### Week 1-2: Foundation

- [ ] Create Flutter project
- [ ] Add dependencies
- [ ] Set up project structure
- [ ] Configure API client
- [ ] Set up secure storage
- [ ] Create theme configuration

### Week 3: Authentication

- [ ] Create user models
- [ ] Build auth provider
- [ ] Design login screen
- [ ] Design register screen
- [ ] Implement token management
- [ ] Test auth flow

### Week 4: Case Management

- [ ] Create case models
- [ ] Build cases provider
- [ ] Design cases list screen
- [ ] Design case detail screen
- [ ] Design create/edit screens
- [ ] Implement caching

### Week 5: AI Integration

- [ ] Create regulation models
- [ ] Build AI suggestions widget
- [ ] Implement generate AI links
- [ ] Add verify/dismiss functionality
- [ ] Display similarity scores
- [ ] Handle loading states

### Week 6: Real-time & Polish

- [ ] Integrate WebSocket
- [ ] Handle real-time updates
- [ ] Add pull-to-refresh
- [ ] Add animations
- [ ] Improve error handling
- [ ] Add Arabic localization

### Week 7: Testing & Deployment

- [ ] Write widget tests
- [ ] Write integration tests
- [ ] Performance optimization
- [ ] Build for Android/iOS
- [ ] Test on devices
- [ ] Create user documentation

---

## Useful Commands

```bash
# Development
flutter run                     # Run app
flutter run -d chrome           # Run in browser
flutter run --release           # Release build

# Code Generation
flutter pub run build_runner build --delete-conflicting-outputs

# Testing
flutter test                    # Run tests
flutter test --coverage         # With coverage

# Build
flutter build apk              # Android APK
flutter build ios              # iOS build
flutter build web              # Web build

# Analysis
flutter analyze                # Static analysis
dart format lib/               # Format code
```

---

## Integration Points

### Backend API Communication

1. Login → Save JWT token
2. Fetch cases → Cache locally
3. Create case → Auto-generate AI links
4. Display AI suggestions with scores
5. Verify/dismiss suggestions

### WebSocket Events

- `regulation-updated` → Refresh relevant cases
- `case-links-refreshed` → Update AI suggestions

---

## Notes

- Use Provider for simple, efficient state management
- Secure storage for JWT tokens
- Local caching for offline support
- Arabic RTL support throughout
- Material 3 design system
- Auto-generated JSON serialization
- WebSocket for real-time updates

---

**End of Flutter Frontend Implementation Plan**
