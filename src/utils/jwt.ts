export interface JWTPayload {
  sub: number; // user ID
  email: string;
  role: string;
  orgId: number; // organization ID
  iat?: number;
  exp?: number;
}

export function createTokenPayload(user: {
  id: number;
  email: string;
  role: string;
  organizationId: number;
}): Omit<JWTPayload, "iat" | "exp"> {
  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: user.organizationId,
  };
}


