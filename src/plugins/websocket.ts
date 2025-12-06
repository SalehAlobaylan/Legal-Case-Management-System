import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import websocket from "@fastify/websocket";
import "@fastify/jwt";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * Broadcast a JSON-serializable message to all active WebSocket
     * connections that belong to the given organization.
     */
    broadcastToOrg: (orgId: number, event: string, data: any) => void;
  }
}

/**
 * Frontend usage guide
 *
 * Connect (example URL):
 *   ws://localhost:3000/ws?token=<your-JWT-here>
 *
 * The `token` must be a valid JWT issued by this backend (same one used for HTTP auth).
 *
 * Listen for events on each message:
 *   - Each message is a JSON string with shape:
 *       { event: string, data: any, timestamp: string }
 *
 * Currently emitted events:
 *   - "ai-links.generated" → data: { caseId, links }
 *       Fired after AI regulations are generated and saved for a case.
 *
 *   - "ai-links.verified" → data: { linkId, verifiedBy }
 *       Fired after a link is verified by a user.
 *
 * Typical frontend flow:
 *   1. Open a WebSocket connection to /ws with the bearer token as a query parameter.
 *   2. On "message", JSON.parse the payload and switch on `message.event`.
 *   3. Update the UI in real-time based on `message.data`.
 */

const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  // Register the low-level @fastify/websocket plugin
  await fastify.register(websocket);

  // Store active WebSocket connections per organization
  const connections = new Map<number, Set<any>>();

  fastify.decorate(
    "broadcastToOrg",
    (orgId: number, event: string, data: any) => {
      const orgConnections = connections.get(orgId);
      if (!orgConnections || orgConnections.size === 0) {
        return;
      }

      const payload = JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString(),
      });

      for (const socket of orgConnections) {
        if (socket.readyState === 1) {
          // OPEN
          socket.send(payload);
        }
      }
    }
  );

  fastify.get("/ws", { websocket: true }, (connection, req) => {
    const socket = (connection as any).socket ?? (connection as any);
    // Token can be provided as a query parameter: /ws?token=...
    const { token } = (req.query || {}) as { token?: string };

    if (!token) {
      fastify.log.warn("WebSocket connection rejected: missing token");
      socket.close(1008, "Token required");
      return;
    }

    try {
      // Verify JWT and extract organization id
      const payload = fastify.jwt.verify(token) as any;
      const orgId = Number(payload.orgId);

      if (!orgId || Number.isNaN(orgId)) {
        fastify.log.warn("WebSocket connection rejected: invalid orgId");
        socket.close(1008, "Invalid token payload");
        return;
      }

      if (!connections.has(orgId)) {
        connections.set(orgId, new Set());
      }

      const orgConnections = connections.get(orgId)!;
      orgConnections.add(socket);

      fastify.log.info(
        { orgId, count: orgConnections.size },
        "WebSocket client connected"
      );

      socket.on("close", () => {
        orgConnections.delete(socket);
        if (orgConnections.size === 0) {
          connections.delete(orgId);
        }

        fastify.log.info(
          { orgId, remaining: orgConnections.size },
          "WebSocket client disconnected"
        );
      });

      socket.on("error", (err: unknown) => {
        fastify.log.error(
          { err, orgId },
          "WebSocket error on client connection"
        );
      });

      // Initial handshake message
      socket.send(
        JSON.stringify({
          event: "connected",
          data: { orgId },
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err) {
      fastify.log.warn(
        { err },
        "WebSocket connection rejected: invalid or expired token"
      );
      socket.close(1008, "Invalid token");
    }
  });

  // Clean up all connections when the Fastify instance is closed
  fastify.addHook("onClose", async (_instance) => {
    for (const [, sockets] of connections) {
      for (const socket of sockets) {
        try {
          socket.close(1001, "Server shutting down");
        } catch {
          // ignore
        }
      }
    }
    connections.clear();
  });
};

export default fp(websocketPlugin, {
  name: "websocket",
});
