import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { eq } from "drizzle-orm";
import { buildApp } from "../../../app";
import { notifications } from "../../../db/schema";

type TestApp = ReturnType<typeof buildApp> & {
  db: any;
};

describe("Notifications Routes", () => {
  const app = buildApp({ logger: false }) as TestApp;
  let authToken = "";
  let userId = "";
  let orgId = 0;

  beforeAll(async () => {
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        registrationType: "personal",
        email: `notifications+${Date.now()}@example.com`,
        password: "password123",
        confirmPassword: "password123",
        fullName: "Notifications Test User",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    authToken = body.token;
    userId = body.user.id;
    orgId = body.user.organizationId;
  });

  beforeEach(async () => {
    await app.db.delete(notifications).where(eq(notifications.userId, userId));
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns unread count based on all user notifications (not page slice)", async () => {
    await app.db.insert(notifications).values([
      {
        userId,
        organizationId: orgId,
        type: "system",
        title: "Unread A",
        message: "Unread A message",
        read: false,
      },
      {
        userId,
        organizationId: orgId,
        type: "system",
        title: "Unread B",
        message: "Unread B message",
        read: false,
      },
      {
        userId,
        organizationId: orgId,
        type: "system",
        title: "Read C",
        message: "Read C message",
        read: true,
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/api/alerts?limit=1",
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.alerts).toHaveLength(1);
    expect(body.unreadCount).toBe(2);

    const countResponse = await app.inject({
      method: "GET",
      url: "/api/alerts/unread-count",
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(countResponse.statusCode).toBe(200);
    expect(countResponse.json().count).toBe(2);
  });

  it("marks single and all alerts as read", async () => {
    const inserted = await app.db
      .insert(notifications)
      .values([
        {
          userId,
          organizationId: orgId,
          type: "case_update",
          title: "Case updated",
          message: "Case update message",
          read: false,
        },
        {
          userId,
          organizationId: orgId,
          type: "case_update",
          title: "Case updated 2",
          message: "Case update message 2",
          read: false,
        },
      ])
      .returning({ id: notifications.id });

    const markOneResponse = await app.inject({
      method: "PATCH",
      url: `/api/alerts/${inserted[0].id}/read`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(markOneResponse.statusCode).toBe(200);

    const countAfterOne = await app.inject({
      method: "GET",
      url: "/api/alerts/unread-count",
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(countAfterOne.statusCode).toBe(200);
    expect(countAfterOne.json().count).toBe(1);

    const markAllResponse = await app.inject({
      method: "PATCH",
      url: "/api/alerts/read-all",
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(markAllResponse.statusCode).toBe(200);

    const countAfterAll = await app.inject({
      method: "GET",
      url: "/api/alerts/unread-count",
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(countAfterAll.statusCode).toBe(200);
    expect(countAfterAll.json().count).toBe(0);
  });
});
