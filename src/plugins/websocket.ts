import { FastifyPluginAsync, FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { Server as SocketIOServer, Socket } from "socket.io";
import "@fastify/jwt";

// Extend Socket to include user data
interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    orgId: number;
  };
}

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
    /**
     * Broadcast a JSON-serializable message to all active Socket.IO
     * connections that belong to the given organization.
     */
    broadcastToOrg: (orgId: number, event: string, data: any) => void;
  }
}

/**
 * Socket.IO WebSocket Plugin for Fastify
 * 
 * Frontend usage guide:
 * 
 * Connect with socket.io-client:
 *   import { io } from "socket.io-client";
 *   const socket = io("https://your-api.com", {
 *     transports: ["websocket"],
 *     query: { token: "<your-JWT-here>" }
 *   });
 * 
 * Listen for events:
 *   socket.on("ai-links.generated", (data) => { ... });
 *   socket.on("regulation-updated", (data) => { ... });
 *   socket.on("case-updated", (data) => { ... });
 * 
 * Events emitted by the server:
 *   - "ai-links.generated" → { caseId, links }
 *   - "ai-links.verified" → { linkId, verifiedBy }
 *   - "regulation-updated" → { regulationId }
 *   - "case-updated" → { caseId }
 *   - "client-updated" → { clientId }
 *   - "document-uploaded" → { caseId, fileName }
 *   - "document-deleted" → { caseId }
 *   - "notification" → { title, message }
 */

const websocketPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Create Socket.IO server attached to Fastify's underlying HTTP server
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(",") || "*",
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // JWT Authentication middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.query.token as string;

    if (!token) {
      fastify.log.warn("Socket.IO connection rejected: missing token");
      return next(new Error("Authentication required"));
    }

    try {
      const payload = fastify.jwt.verify(token) as any;
      const orgId = Number(payload.orgId);
      const userId = payload.sub || payload.userId;

      if (!orgId || Number.isNaN(orgId)) {
        fastify.log.warn("Socket.IO connection rejected: invalid orgId");
        return next(new Error("Invalid token payload"));
      }

      // Attach user data to socket
      (socket as AuthenticatedSocket).data = {
        userId,
        orgId,
      };

      next();
    } catch (err) {
      fastify.log.warn({ err }, "Socket.IO connection rejected: invalid token");
      return next(new Error("Invalid or expired token"));
    }
  });

  // Connection handler
  io.on("connection", (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const { orgId, userId } = authSocket.data;

    // Join organization room for targeted broadcasts
    const orgRoom = `org:${orgId}`;
    socket.join(orgRoom);

    fastify.log.info(
      { orgId, userId, socketId: socket.id },
      "Socket.IO client connected"
    );

    // Send connection confirmation
    socket.emit("connected", {
      orgId,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      fastify.log.info(
        { orgId, userId, socketId: socket.id, reason },
        "Socket.IO client disconnected"
      );
    });

    // Handle errors
    socket.on("error", (err) => {
      fastify.log.error(
        { err, orgId, userId, socketId: socket.id },
        "Socket.IO error"
      );
    });
  });

  // Decorate Fastify with Socket.IO instance
  fastify.decorate("io", io);

  // Broadcast helper function
  fastify.decorate(
    "broadcastToOrg",
    (orgId: number, event: string, data: any) => {
      const orgRoom = `org:${orgId}`;
      const payload = {
        ...data,
        timestamp: new Date().toISOString(),
      };

      io.to(orgRoom).emit(event, payload);

      fastify.log.debug(
        { orgId, event, recipientCount: io.sockets.adapter.rooms.get(orgRoom)?.size || 0 },
        "Broadcast sent to organization"
      );
    }
  );

  // Clean up on server close
  fastify.addHook("onClose", async () => {
    fastify.log.info("Closing Socket.IO server...");

    // Disconnect all clients gracefully
    const sockets = await io.fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }

    io.close();
  });
};

export default fp(websocketPlugin, {
  name: "websocket",
});
