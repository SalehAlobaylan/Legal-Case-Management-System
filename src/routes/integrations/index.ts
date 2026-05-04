import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { z } from "zod";
import type { Database } from "../../db/connection";
import { env } from "../../config/env";
import { IntegrationService } from "../../services/integration.service";
import { MicrosoftGraphService } from "../../services/integrations/microsoft-graph.service";
import { OdooService } from "../../services/integrations/odoo.service";
import { WebhookDeliveryService } from "../../services/integrations/webhook-delivery.service";

type RequestWithUser = FastifyRequest & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
  db: Database;
};

const webhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

const odooConnectSchema = z.object({
  baseUrl: z.string().url(),
  database: z.string().min(1),
  username: z.string().min(1),
  apiKey: z.string().min(1),
});

const microsoftConnectSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  tenantId: z.string().min(1),
  redirectUri: z.string().url(),
});

const integrationsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  const authGuard = { preHandler: app.authenticate };

  const integrationService = new IntegrationService(app.db);
  const odooService = new OdooService();
  const webhookDelivery = new WebhookDeliveryService(app.db);

  fastify.get(
    "/",
    {
      schema: {
        description: "List integrations for organization",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const integrations = await integrationService.listForOrganization(user.orgId);
      const safeIntegrations = integrations.map(({ credentialsEncrypted, config, ...rest }) => {
        const safeConfig = config && typeof config === "object" ? { ...config } : config;
        return { ...rest, config: safeConfig };
      });
      return reply.send({ integrations: safeIntegrations });
    }
  );

  fastify.post(
    "/microsoft/connect",
    {
      schema: {
        description: "Start Microsoft OAuth flow",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { body } = request as RequestWithUser & { body: unknown };
      const data = microsoftConnectSchema.parse(body);
      if (data.redirectUri.includes("#")) {
        return reply.status(400).send({ message: "Invalid redirect URI" });
      }
      const state = Math.random().toString(36).substring(2, 15);
      const msService = new MicrosoftGraphService(
        data.clientId,
        data.clientSecret,
        data.tenantId,
        data.redirectUri
      );
      const orgId = (request as RequestWithUser).user.orgId;
      const redirectUrl = msService.getAuthorizationUrl(state, orgId);
      const integration = await integrationService.upsertIntegration({
        organizationId: orgId,
        provider: "microsoft_365",
        status: "in_setup",
        setupState: state,
        displayName: "Microsoft 365",
        config: {
          clientId: data.clientId,
          tenantId: data.tenantId,
          redirectUri: data.redirectUri,
        },
      });
      await integrationService.setCredentials(integration.id, {
        clientSecret: data.clientSecret,
      });
      return reply.send({ redirectUrl, integration });
    }
  );

  fastify.get(
    "/microsoft/callback",
    {
      schema: {
        description: "Handle Microsoft OAuth callback",
        tags: ["integrations"],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { code, state, org } = request.query as { code?: string; state?: string; org?: string };
        if (!code) {
          return reply.redirect(`${env.FRONTEND_URL}/settings?tab=integrations&error=no_code`);
        }
        if (!state || !org) {
          return reply.redirect(`${env.FRONTEND_URL}/settings?tab=integrations&error=missing_state`);
        }
        const orgId = parseInt(org, 10);
        if (Number.isNaN(orgId)) {
          return reply.redirect(`${env.FRONTEND_URL}/settings?tab=integrations&error=missing_state`);
        }
        const integration = await integrationService.getIntegrationBySetupState(state);
        if (!integration || !integration.config) {
          return reply.redirect(`${env.FRONTEND_URL}/settings?tab=integrations&error=missing_config`);
        }
        if (integration.organizationId !== orgId) {
          return reply.redirect(`${env.FRONTEND_URL}/settings?tab=integrations&error=invalid_state`);
        }
        if (integration.setupState && integration.setupState !== state) {
          return reply.redirect(`${env.FRONTEND_URL}/settings?tab=integrations&error=invalid_state`);
        }
        const config = integration.config as {
          clientId?: string;
          tenantId?: string;
          redirectUri?: string;
        };
        const secrets = integrationService.getCredentials<{ clientSecret?: string }>(integration);
        if (!config.clientId || !config.tenantId || !config.redirectUri || !secrets?.clientSecret) {
          return reply.redirect(`${env.FRONTEND_URL}/settings?tab=integrations&error=missing_config`);
        }
        const msService = new MicrosoftGraphService(
          config.clientId,
          secrets.clientSecret,
          config.tenantId,
          config.redirectUri
        );
        const tokens = await msService.exchangeCode(code);

        await integrationService.upsertIntegration({
          id: integration.id,
          organizationId: integration.organizationId,
          provider: "microsoft_365",
          status: "connected",
          setupState: null,
          connectedAt: new Date(),
          displayName: "Microsoft 365",
          config: integration.config,
        } as any);

        await integrationService.setCredentials(integration.id, {
          clientSecret: secrets.clientSecret,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          tokenType: tokens.token_type,
          scope: tokens.scope,
        });

        return reply.redirect(`${env.FRONTEND_URL}/settings?tab=integrations&connected=microsoft_365`);
      } catch (error) {
        fastify.log.error(error);
        return reply.redirect(`${env.FRONTEND_URL}/settings?tab=integrations&error=oauth_failed`);
      }
    }
  );

  fastify.post(
    "/microsoft/sync",
    {
      schema: {
        description: "Sync Microsoft 365 calendar events",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const integration = await integrationService.getIntegration(user.orgId, "microsoft_365");
      if (!integration || !integration.credentialsEncrypted) {
        return reply.status(404).send({ message: "Integration not connected" });
      }
      const creds = integrationService.getCredentials<{ accessToken: string; refreshToken?: string }>(integration);
      if (!creds?.accessToken) {
        return reply.status(400).send({ message: "Missing access token" });
      }
      const config = integration.config as {
        clientId?: string;
        tenantId?: string;
        redirectUri?: string;
      };
      const secrets = integrationService.getCredentials<{ clientSecret?: string }>(integration);
      if (!config.clientId || !config.tenantId || !config.redirectUri || !secrets?.clientSecret) {
        return reply.status(400).send({ message: "Missing Microsoft config" });
      }
      const msService = new MicrosoftGraphService(
        config.clientId,
        secrets.clientSecret,
        config.tenantId,
        config.redirectUri
      );
      const events = await msService.listCalendarEvents(creds.accessToken);
      await integrationService.updateSyncTime(integration.id);
      return reply.send({ events: events.value });
    }
  );

  fastify.post(
    "/odoo/connect",
    {
      schema: {
        description: "Connect to Odoo via JSON-RPC",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const data = odooConnectSchema.parse(body);
      const uid = await odooService.authenticate(
        data.baseUrl,
        data.database,
        data.username,
        data.apiKey
      );
      const integration = await integrationService.upsertIntegration({
        organizationId: user.orgId,
        provider: "odoo",
        status: "connected",
        connectedBy: user.id,
        connectedAt: new Date(),
        displayName: "Odoo",
        config: {
          baseUrl: data.baseUrl,
          database: data.database,
          username: data.username,
          uid,
        },
      });
      await integrationService.setCredentials(integration.id, {
        apiKey: data.apiKey,
      });
      return reply.code(201).send({ integration });
    }
  );

  fastify.post(
    "/odoo/sync",
    {
      schema: {
        description: "Sync Odoo partners",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const integration = await integrationService.getIntegration(user.orgId, "odoo");
      if (!integration) {
        return reply.status(404).send({ message: "Integration not connected" });
      }
      const creds = integrationService.getCredentials<{ apiKey: string }>(integration);
      const config = integration.config as {
        baseUrl?: string;
        database?: string;
        username?: string;
        uid?: number;
      };
      if (!creds?.apiKey || !config?.baseUrl || !config.database || !config.username || !config.uid) {
        return reply.status(400).send({ message: "Missing Odoo credentials" });
      }
      const partners = await odooService.listPartners(
        config.baseUrl,
        config.database,
        config.uid,
        creds.apiKey
      );
      await integrationService.updateSyncTime(integration.id);
      return reply.send({ partners });
    }
  );

  fastify.post(
    "/webhooks",
    {
      schema: {
        description: "Create outbound webhook",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const data = webhookSchema.parse(body);
      const webhook = await integrationService.createWebhook({
        organizationId: user.orgId,
        name: data.name,
        url: data.url,
        secret: data.secret,
        events: data.events ?? [],
        active: data.active ?? true,
      });
      return reply.code(201).send({ webhook });
    }
  );

  fastify.get(
    "/webhooks",
    {
      schema: {
        description: "List outbound webhooks",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const webhooks = await integrationService.listWebhooks(user.orgId);
      return reply.send({ webhooks });
    }
  );

  fastify.put(
    "/webhooks/:id",
    {
      schema: {
        description: "Update outbound webhook",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const { id } = request.params as { id: string };
      const data = webhookSchema.partial().parse(body);
      const webhookId = parseInt(id, 10);
      if (Number.isNaN(webhookId)) {
        return reply.status(400).send({ message: "Invalid webhook id" });
      }
      const webhook = await integrationService.updateWebhook(user.orgId, webhookId, data);
      if (!webhook) {
        return reply.status(404).send({ message: "Webhook not found" });
      }
      return reply.send({ webhook });
    }
  );

  fastify.delete(
    "/webhooks/:id",
    {
      schema: {
        description: "Delete outbound webhook",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const webhookId = parseInt(id, 10);
      if (Number.isNaN(webhookId)) {
        return reply.status(400).send({ message: "Invalid webhook id" });
      }
      const webhook = await integrationService.deleteWebhook(user.orgId, webhookId);
      if (!webhook) {
        return reply.status(404).send({ message: "Webhook not found" });
      }
      return reply.send({ webhook });
    }
  );

  fastify.post(
    "/webhooks/:id/test",
    {
      schema: {
        description: "Send test webhook event",
        tags: ["integrations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
      ...authGuard,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const webhookId = parseInt(id, 10);
      if (Number.isNaN(webhookId)) {
        return reply.status(400).send({ message: "Invalid webhook id" });
      }
      try {
        await webhookDelivery.deliverTest(user.orgId, webhookId);
        return reply.send({ success: true });
      } catch (error) {
        return reply.status(404).send({ message: "Webhook not found" });
      }
    }
  );
};

export default integrationsRoutes;
