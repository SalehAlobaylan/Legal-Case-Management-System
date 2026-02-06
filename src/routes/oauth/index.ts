/*
 * OAuth routes plugin
 *
 * - Registers the HTTP endpoints for Google OAuth 2.0 authentication flow.
 * - GET /google - Initiates the OAuth flow by redirecting to Google's consent screen
 * - GET /google/callback - Handles the OAuth callback from Google, exchanges the authorization
 *   code for user profile, creates/updates the user, generates a JWT, and redirects to the frontend
 *
 * This implementation uses a backend-initiated OAuth flow for better security and consistency
 * with the existing JWT-based authentication system.
 */

import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { OAuthService } from "../../services/oauth.service";
import { createTokenPayload } from "../../utils/jwt";
import { env } from "../../config/env";

interface GoogleTokensResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface GoogleProfileResponse {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  picture: string;
}

// Validate that Google OAuth is configured
const isGoogleOAuthConfigured =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET;

const oauthRoutes: FastifyPluginAsync = async (fastify) => {
  // Only register OAuth routes if credentials are configured
  if (!isGoogleOAuthConfigured) {
    fastify.log.warn(
      "Google OAuth credentials not configured. OAuth routes will not be available."
    );
    return;
  }

  const oauthService = new OAuthService(fastify.db);

  // GET /api/auth/google
  // - Initiates the Google OAuth 2.0 flow
  // - Redirects the user to Google's consent screen
  fastify.get("/google", {
    schema: {
      description:
        "Initiate Google OAuth flow (redirects to Google consent screen)",
      tags: ["oauth"],
    },
  }, async (request, reply) => {
    const state = Math.random().toString(36).substring(2, 15);
    const redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(env.GOOGLE_CALLBACK_URL)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent("profile email")}&` +
      `state=${state}`;

    return reply.redirect(redirectUrl);
  });

  // GET /api/auth/google/callback
  // - Handles the OAuth callback from Google
  // - Exchanges authorization code for user profile
  // - Creates or updates user account
  // - Generates JWT token
  // - Redirects to frontend with token
  fastify.get("/google/callback", {
    schema: {
      description:
        "Handle Google OAuth callback and redirect to frontend with JWT",
      tags: ["oauth"],
    },
  }, async (request, reply) => {
    try {
      const { code } = request.query as { code?: string };
      const { error } = request.query as { error?: string };

      if (error) {
        return reply.redirect(
          `${env.FRONTEND_URL}/login?error=oauth_failed`
        );
      }

      if (!code) {
        return reply.redirect(
          `${env.FRONTEND_URL}/login?error=no_code`
        );
      }

      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: env.GOOGLE_CALLBACK_URL,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to exchange code for token");
      }

      const tokens = await tokenResponse.json() as GoogleTokensResponse;

      // Fetch user profile
      const profileResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );

      if (!profileResponse.ok) {
        throw new Error("Failed to fetch user profile");
      }

      const profile = await profileResponse.json() as GoogleProfileResponse;

      const googleProfile = {
        id: profile.id,
        email: profile.email,
        verified_email: profile.verified_email,
        name: profile.name,
        picture: profile.picture,
      };

      // Handle OAuth callback
      const user = await oauthService.handleGoogleCallback(googleProfile);

      // Generate JWT token for the user
      const token = fastify.jwt.sign(
        createTokenPayload({
          id: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
        })
      );

      // Redirect to frontend with token
      return reply.redirect(
        `${env.FRONTEND_URL}/auth/callback?token=${token}`
      );
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect(
        `${env.FRONTEND_URL}/login?error=oauth_failed`
      );
    }
  });
};

export default oauthRoutes;
