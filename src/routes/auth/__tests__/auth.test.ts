import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../../app";

describe("Auth Routes", () => {
  const app = buildApp({ logger: false });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should register a new user", async () => {
    const email = `test+${Date.now()}@example.com`;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        registrationType: "personal",
        email,
        password: "password123",
        confirmPassword: "password123",
        fullName: "Test User",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toHaveProperty("token");
  });
});

