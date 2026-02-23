import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { buildApp } from "../../../app";

describe("Profile Routes", () => {
  const app = buildApp({ logger: false });
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    await app.ready();
    
    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        registrationType: "personal",
        email: `profiletest+${Date.now()}@example.com`,
        password: "password123",
        confirmPassword: "password123",
        fullName: "Profile Test User",
      },
    });

    authToken = registerResponse.json().token;
    testUserId = registerResponse.json().user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/profile", () => {
    it("should return current user profile", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/profile",
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("user");
      expect(body.user).toHaveProperty("id");
      expect(body.user).toHaveProperty("email");
      expect(body.user).toHaveProperty("fullName");
    });

    it("should return 401 without auth token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/profile",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("PUT /api/profile", () => {
    it("should update user profile", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/api/profile",
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          fullName: "Updated Test Name",
          phone: "+966501234567",
          location: "Jeddah, Saudi Arabia",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("user");
      expect(body.user.fullName).toBe("Updated Test Name");
      expect(body.user.phone).toBe("+966501234567");
      expect(body.user.location).toBe("Jeddah, Saudi Arabia");
    });

    it("should return 401 without auth token", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/api/profile",
        payload: {
          fullName: "Test",
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/profile/stats", () => {
    it("should return user statistics", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/profile/stats",
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("stats");
      expect(body.stats).toHaveProperty("activeCases");
      expect(body.stats).toHaveProperty("totalCases");
      expect(body.stats).toHaveProperty("winRate");
      expect(body.stats).toHaveProperty("clientSatisfaction");
      expect(body.stats).toHaveProperty("documentsProcessed");
      expect(body.stats).toHaveProperty("regulationsReviewed");
    });

    it("should return 401 without auth token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/profile/stats",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/profile/activities", () => {
    it("should return user activities", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/profile/activities",
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("activities");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("hasMore");
      expect(Array.isArray(body.activities)).toBe(true);
    });

    it("should support limit parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/profile/activities?limit=2",
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.activities.length).toBeLessThanOrEqual(2);
    });

    it("should support type filter parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/profile/activities?type=case",
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.activities.length).toBe(0);
    });

    it("should support offset parameter for pagination", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/profile/activities?offset=5",
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("activities");
    });

    it("should return 401 without auth token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/profile/activities",
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
