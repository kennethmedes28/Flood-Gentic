"""Sign-in checks: verify the Supabase access token that the browser sends with a request.

The browser signs in with Google or Facebook through Supabase and gets an access token (a JWT). It sends the token as
``Authorization: Bearer <token>``. This module checks it WITHOUT calling Supabase on every request: the token is signed
with a key that Supabase publishes at ``<project url>/auth/v1/.well-known/jwks.json``, so the backend downloads those
public keys once (and keeps them for an hour) and checks the signature, the expiry, the issuer and the audience itself.

A token that is missing, expired, forged or for another project is simply "not signed in" (``None``); this module never
raises for a bad token. What to do about a signed-out caller is decided by the route (see ``src/api/deps.py``).

Example:
    verifier = TokenVerifier("https://abcd.supabase.co")
    user = verifier.verify(token)     # User(id="...", email="a@b.c") or None
"""

import logging
from dataclasses import dataclass

import jwt
from jwt import PyJWKClient

logger = logging.getLogger(__name__)

AUDIENCE = "authenticated"  # Supabase puts this in the tokens of signed-in users
ALGORITHMS = ["ES256", "RS256"]  # the algorithms of Supabase's published signing keys
KEYS_CACHE_SECONDS = 60 * 60


@dataclass(frozen=True)
class User:
    """The signed-in person: their Supabase user id (stable, used to count their usage) and email."""

    id: str
    email: str | None = None


class TokenVerifier:
    """Checks Supabase access tokens against the project's published signing keys."""

    def __init__(self, supabase_url: str):
        base = supabase_url.rstrip("/")
        self.issuer = f"{base}/auth/v1"
        self._keys = PyJWKClient(f"{self.issuer}/.well-known/jwks.json", cache_keys=True, lifespan=KEYS_CACHE_SECONDS)

    def verify(self, token: str) -> User | None:
        """The user the token belongs to, or None when the token is not valid. Blocking (it may download the keys)."""
        try:
            key = self._keys.get_signing_key_from_jwt(token)
            claims = jwt.decode(token, key.key, algorithms=ALGORITHMS, audience=AUDIENCE, issuer=self.issuer)
        except jwt.PyJWTError as error:
            # Only the kind of problem is logged: the token is a credential and must not end up in logs.
            logger.info("Sign-in token refused: %s", type(error).__name__)
            return None
        user_id = claims.get("sub")
        if not user_id:
            return None
        return User(id=str(user_id), email=claims.get("email"))


def bearer_token(authorization_header: str) -> str | None:
    """The token from an ``Authorization: Bearer <token>`` header value, or None."""
    scheme, _, given = authorization_header.partition(" ")
    token = given.strip()
    return token if scheme.lower() == "bearer" and token else None
