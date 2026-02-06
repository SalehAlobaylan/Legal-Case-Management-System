/*
 * Passport Configuration for Google OAuth 2.0
 *
 * This file configures Passport.js with the Google OAuth 2.0 strategy.
 * It validates environment variables and sets up the authentication flow
 * using the OAuthService to handle user management.
 */

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Database } from "../db/connection";
import { OAuthService } from "../services/oauth.service";
import { env } from "./env";

// Validate Google OAuth configuration
if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
  console.warn(
    "⚠️  Google OAuth credentials not configured. " +
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google Sign-In."
  );
}

export function configurePassport(db: Database) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const oauthService = new OAuthService(db);

          const googleProfile = {
            id: profile.id,
            email: profile.emails?.[0]?.value || "",
            verified_email: profile.emails?.[0]?.verified || false,
            name: profile.displayName,
            picture: profile.photos?.[0]?.value || "",
          };

          const user = await oauthService.handleGoogleCallback(googleProfile);
          done(null, user);
        } catch (error) {
          done(error, undefined);
        }
      }
    )
  );

  // Serialize user into session (not used with JWT, but required by Passport)
  passport.serializeUser((user: any, done) => done(null, user.id));

  // Deserialize user from session (not used with JWT, but required by Passport)
  passport.deserializeUser((id: string, done) => done(null, { id }));
}
