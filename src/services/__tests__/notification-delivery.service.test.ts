import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { and, eq, inArray } from "drizzle-orm";
import { buildApp } from "../../app";
import {
  notificationPreferences,
  notifications,
  users,
} from "../../db/schema";
import { NotificationDeliveryService } from "../notification-delivery.service";

type TestApp = ReturnType<typeof buildApp> & {
  db: any;
};

describe("NotificationDeliveryService", () => {
  const app = buildApp({ logger: false }) as TestApp;
  let userIdA = "";
  let userIdB = "";
  let orgId = 0;

  beforeAll(async () => {
    await app.ready();

    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        registrationType: "personal",
        email: `delivery+${Date.now()}@example.com`,
        password: "password123",
        confirmPassword: "password123",
        fullName: "Delivery User A",
      },
    });

    expect(registerResponse.statusCode).toBe(201);
    const body = registerResponse.json();
    userIdA = body.user.id;
    orgId = body.user.organizationId;

    const [insertedUser] = await app.db
      .insert(users)
      .values({
        organizationId: orgId,
        email: `delivery-teammate+${Date.now()}@example.com`,
        passwordHash: "hashed-password",
        fullName: "Delivery User B",
        role: "lawyer",
      })
      .returning({ id: users.id });

    userIdB = insertedUser.id;
  });

  beforeEach(async () => {
    await app.db
      .delete(notifications)
      .where(inArray(notifications.userId, [userIdA, userIdB]));
    await app.db
      .delete(notificationPreferences)
      .where(inArray(notificationPreferences.userId, [userIdA, userIdB]));
  });

  afterAll(async () => {
    await app.db.delete(users).where(eq(users.id, userIdB));
    await app.close();
  });

  it("enforces caseUpdates preference and pushNotifications delivery", async () => {
    await app.db.insert(notificationPreferences).values([
      {
        userId: userIdA,
        caseUpdates: false,
        pushNotifications: true,
      },
      {
        userId: userIdB,
        caseUpdates: true,
        pushNotifications: true,
      },
    ]);

    const emitToUser = jest.fn();
    const service = new NotificationDeliveryService(app.db, emitToUser);

    const result = await service.notifyUsers({
      recipients: [
        { userId: userIdA, organizationId: orgId },
        { userId: userIdB, organizationId: orgId },
      ],
      type: "case_update",
      category: "caseUpdates",
      title: "Case updated",
      message: "Case update body",
    });

    expect(result.created).toBe(1);
    expect(result.deliveredRealtime).toBe(1);
    expect(emitToUser).toHaveBeenCalledTimes(1);
    expect(emitToUser).toHaveBeenCalledWith(
      userIdB,
      "notification",
      expect.objectContaining({
        type: "case_update",
        title: "Case updated",
      })
    );

    const createdRows = await app.db.query.notifications.findMany({
      where: and(
        inArray(notifications.userId, [userIdA, userIdB]),
        eq(notifications.title, "Case updated")
      ),
    });

    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].userId).toBe(userIdB);
  });

  it("keeps regulation notifications subscriber-scoped and preference-gated", async () => {
    await app.db.insert(notificationPreferences).values([
      {
        userId: userIdA,
        regulationUpdates: true,
        pushNotifications: true,
      },
      {
        userId: userIdB,
        regulationUpdates: false,
        pushNotifications: true,
      },
    ]);

    const emitToUser = jest.fn();
    const service = new NotificationDeliveryService(app.db, emitToUser);

    const result = await service.notifyUsers({
      recipients: [
        { userId: userIdA, organizationId: orgId },
        { userId: userIdB, organizationId: orgId },
      ],
      type: "regulation_update",
      category: "regulationUpdates",
      title: "Regulation updated",
      message: "A subscribed regulation changed",
    });

    expect(result.created).toBe(1);
    expect(emitToUser).toHaveBeenCalledTimes(1);
    expect(emitToUser).toHaveBeenCalledWith(
      userIdA,
      "notification",
      expect.objectContaining({
        type: "regulation_update",
        title: "Regulation updated",
      })
    );
  });
});
