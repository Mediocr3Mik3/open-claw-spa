/**
 * openclaw-spa — JWT-Based Admin Authentication
 *
 * Replaces the static SPA_ADMIN_API_KEY with short-lived JWTs signed
 * by a master signing key. Supports:
 *   - Token issuance with configurable expiry and claims
 *   - Token verification with clock tolerance
 *   - Role-based claims (owner, admin, operator, readonly)
 *   - Token revocation via a deny-list
 */

import * as jose from "jose";
import * as crypto from "crypto";

export type OrgRole = "owner" | "admin" | "operator" | "readonly";

export interface JWTClaims {
  sub: string;
  role: OrgRole;
  org_id?: string;
  scopes?: string[];
}

export interface JWTConfig {
  issuer: string;
  audience: string;
  default_expiry_seconds?: number;
}

export class JWTAuthManager {
  private signingKey: crypto.KeyObject;
  private verifyKey: crypto.KeyObject;
  private config: JWTConfig;
  private revokedTokens = new Set<string>();

  constructor(config: JWTConfig, privateKeyPem?: string) {
    this.config = config;

    if (privateKeyPem) {
      this.signingKey = crypto.createPrivateKey(privateKeyPem);
      this.verifyKey = crypto.createPublicKey(this.signingKey);
    } else {
      // Auto-generate an ECDSA P-256 key pair for JWT signing
      const kp = crypto.generateKeyPairSync("ec", {
        namedCurve: "P-256",
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      this.signingKey = crypto.createPrivateKey(kp.privateKey);
      this.verifyKey = crypto.createPublicKey(kp.publicKey);
    }
  }

  /**
   * Issue a signed JWT with the given claims.
   */
  async issueToken(claims: JWTClaims, expirySeconds?: number): Promise<string> {
    const expiry = expirySeconds ?? this.config.default_expiry_seconds ?? 3600;

    const jwt = await new jose.SignJWT({
      role: claims.role,
      org_id: claims.org_id,
      scopes: claims.scopes,
    })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject(claims.sub)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt()
      .setExpirationTime(`${expiry}s`)
      .setJti(crypto.randomUUID())
      .sign(this.signingKey);

    return jwt;
  }

  /**
   * Verify a JWT and return its claims.
   * Returns null if invalid, expired, or revoked.
   */
  async verifyToken(token: string): Promise<(JWTClaims & { jti: string; exp: number }) | null> {
    try {
      const { payload } = await jose.jwtVerify(token, this.verifyKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: 30,
      });

      // Check revocation
      if (payload.jti && this.revokedTokens.has(payload.jti)) {
        return null;
      }

      return {
        sub: payload.sub ?? "unknown",
        role: (payload["role"] as OrgRole) ?? "readonly",
        org_id: payload["org_id"] as string | undefined,
        scopes: payload["scopes"] as string[] | undefined,
        jti: payload.jti ?? "",
        exp: payload.exp ?? 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Revoke a token by JTI.
   */
  revokeToken(jti: string): void {
    this.revokedTokens.add(jti);
  }

  /**
   * Check if a role has sufficient privilege for an operation.
   */
  static hasPermission(role: OrgRole, required: OrgRole): boolean {
    const weights: Record<OrgRole, number> = {
      readonly: 0,
      operator: 1,
      admin: 2,
      owner: 3,
    };
    return weights[role] >= weights[required];
  }

  /**
   * Express middleware factory for JWT auth.
   */
  middleware(requiredRole: OrgRole = "operator") {
    return async (
      req: { headers: Record<string, string | undefined>; jwtClaims?: JWTClaims },
      res: { status: (code: number) => { json: (body: unknown) => void } },
      next: () => void
    ) => {
      const authHeader = req.headers["authorization"];
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

      if (!token) {
        res.status(401).json({ error: "Missing authorization token" });
        return;
      }

      const claims = await this.verifyToken(token);
      if (!claims) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }

      if (!JWTAuthManager.hasPermission(claims.role, requiredRole)) {
        res.status(403).json({ error: `Requires role: ${requiredRole}, you have: ${claims.role}` });
        return;
      }

      req.jwtClaims = claims;
      next();
    };
  }

  /**
   * Get the public key PEM for external verification.
   */
  getPublicKeyPem(): string {
    return this.verifyKey.export({ type: "spki", format: "pem" }) as string;
  }
}
