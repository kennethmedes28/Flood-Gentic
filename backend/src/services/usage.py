"""Per-user spending caps: how much of the paid services each signed-in person may use.

Limits (all can be changed with environment variables, see ``src/api/settings.py``):

    per user, per Manila day    assistant messages, photo checks, voice sessions
    per user, per Manila month  chat-model tokens
    for everyone, per day       assistant messages, photo checks (a circuit breaker for the Muse credits)

Counters live in the Supabase table ``usage_counters`` (``sql/005_usage_counters.sql``). A message or photo is counted BEFORE it
is answered, with one atomic statement that only succeeds while the counter is under its limit, so two requests at the same
time cannot both slip through. Tokens are only known afterwards, so the monthly cap is checked before a message and the real
tokens are added after it (a person may go a little over, by one message at most). SAM requests are counted per day for
information; they have no cap of their own because photo checks are capped.

An emergency message is never stopped by a cap: the routes answer it with the fixed text instead (see ``src/api/routers/chat.py``).
"""

import calendar
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

MANILA = ZoneInfo("Asia/Manila")

REQUESTS = "requests"
UPLOADS = "uploads"
VOICE = "voice_sessions"
SAM = "sam_requests"
TOKENS = "tokens"
EVERYONE = "all"

ENSURE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS usage_counters (
    scope text NOT NULL, metric text NOT NULL, period text NOT NULL,
    used bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, metric, period)
);
-- No policies on purpose: only the backend's direct Postgres connection may read or write, never the public API key.
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
"""

# Adds to a counter only while the result stays within the limit. A new counter is inserted as it is (the amount is 1 and the
# limit is at least 1); an existing one is updated only when the new total fits. No row comes back when the limit is reached.
RESERVE_SQL = """
INSERT INTO usage_counters (scope, metric, period, used) VALUES (%s, %s, %s, %s)
ON CONFLICT (scope, metric, period) DO UPDATE
    SET used = usage_counters.used + EXCLUDED.used, updated_at = now()
    WHERE usage_counters.used + EXCLUDED.used <= %s
RETURNING used
"""
ADD_SQL = """
INSERT INTO usage_counters (scope, metric, period, used) VALUES (%s, %s, %s, %s)
ON CONFLICT (scope, metric, period) DO UPDATE SET used = usage_counters.used + EXCLUDED.used, updated_at = now()
"""
RELEASE_SQL = "UPDATE usage_counters SET used = GREATEST(used - %s, 0) WHERE scope = %s AND metric = %s AND period = %s"
GET_SQL = "SELECT used FROM usage_counters WHERE scope = %s AND metric = %s AND period = %s"


@dataclass(frozen=True)
class UsageLimits:
    """The caps. The defaults are the "tight" setting for a small hackathon budget."""

    user_requests_per_day: int = 20
    user_uploads_per_day: int = 3
    user_voice_per_day: int = 8
    user_tokens_per_month: int = 150_000
    everyone_requests_per_day: int = 500
    everyone_uploads_per_day: int = 100
    # Signed-in accounts (by email, lower case) that skip the per-user caps, for example the developer testing the app.
    # Their use is still counted, and still counts toward the whole-app daily caps above.
    unlimited_emails: frozenset[str] = frozenset()


class QuotaExceeded(Exception):
    """A cap was reached. ``message`` is safe to show to the person; ``retry_after_seconds`` is when it resets."""

    def __init__(self, message: str, retry_after_seconds: int):
        super().__init__(message)
        self.message = message
        self.retry_after_seconds = retry_after_seconds


def day_of(now: datetime) -> str:
    """The Manila calendar day, for example ``2026-11-03``."""
    return now.astimezone(MANILA).date().isoformat()


def month_of(now: datetime) -> str:
    """The Manila calendar month, for example ``2026-11``."""
    return now.astimezone(MANILA).strftime("%Y-%m")


def seconds_until_next_day(now: datetime) -> int:
    local = now.astimezone(MANILA)
    midnight = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((midnight - local).total_seconds()))


def seconds_until_next_month(now: datetime) -> int:
    local = now.astimezone(MANILA)
    days_left = calendar.monthrange(local.year, local.month)[1] - local.day + 1
    first = (local + timedelta(days=days_left)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((first - local).total_seconds()))


class PostgresCounters:
    """The counters in the ``usage_counters`` table. ``get_connection`` returns the open connection (it may reconnect)."""

    def __init__(self, get_connection):
        self._get_connection = get_connection

    @property
    def conn(self):
        return self._get_connection()

    def reserve(self, scope: str, metric: str, period: str, amount: int, limit: int) -> bool:
        """Add ``amount`` if the counter stays within ``limit``. False when it would go over (nothing is added)."""
        row = self.conn.execute(RESERVE_SQL, [scope, metric, period, amount, limit]).fetchone()
        return row is not None

    def add(self, scope: str, metric: str, period: str, amount: int) -> None:
        self.conn.execute(ADD_SQL, [scope, metric, period, amount])

    def release(self, scope: str, metric: str, period: str, amount: int) -> None:
        self.conn.execute(RELEASE_SQL, [amount, scope, metric, period])

    def get(self, scope: str, metric: str, period: str) -> int:
        row = self.conn.execute(GET_SQL, [scope, metric, period]).fetchone()
        return int(row["used"]) if row else 0


def ensure_table(conn) -> None:
    """Create the counters table if it is missing (safe to run on every start)."""
    conn.execute(ENSURE_TABLE_SQL)


def daily_text(what: str, limit: int) -> str:
    return (
        f"You have used your {limit} {what} for today. The limit starts again at midnight (Manila time). "
        "If you are in danger, call 911.\n"
        f"Naubos mo na ang {limit} {what} para sa araw na ito. Magsisimula ulit ito sa hatinggabi (oras sa Maynila). "
        "Kung nasa panganib, tumawag sa 911."
    )


class UsageTracker:
    """Counts and limits the usage of signed-in users. ``counters`` is a ``PostgresCounters`` (or a fake in tests)."""

    def __init__(self, counters, limits: UsageLimits, clock=None):
        self.counters = counters
        self.limits = limits
        self._clock = clock or (lambda: datetime.now(MANILA))

    def _reserve_all(self, steps: list[tuple[str, str, str, int, QuotaExceeded]]) -> None:
        """Reserve every (scope, metric, period, limit, error) step, or none: a step that fails undoes the earlier ones."""
        done: list[tuple[str, str, str]] = []
        try:
            for scope, metric, period, limit, error in steps:
                if not self.counters.reserve(scope, metric, period, 1, limit):
                    raise error
                done.append((scope, metric, period))
        except QuotaExceeded:
            for scope, metric, period in done:
                self.counters.release(scope, metric, period, 1)
            raise

    def is_unlimited(self, email: str | None) -> bool:
        """True for an account listed in ``UsageLimits.unlimited_emails`` (UNLIMITED_EMAILS), which skips the per-user caps."""
        return bool(email) and email.strip().lower() in self.limits.unlimited_emails

    def count_chat_request(self, user_id: str, photo: bool, email: str | None = None) -> None:
        """Count one assistant message (and one photo check when ``photo``) for the user and for everyone.

        Raises ``QuotaExceeded`` when the monthly tokens, the user's day or the whole app's day is used up; nothing is
        counted in that case. An unlimited account (see ``is_unlimited``) skips its own caps: its use is still counted,
        and only the whole app's day can stop it.
        """
        now, limits = self._clock(), self.limits
        day, month = day_of(now), month_of(now)
        next_day = seconds_until_next_day(now)
        unlimited = self.is_unlimited(email)

        if not unlimited and self.counters.get(user_id, TOKENS, month) >= limits.user_tokens_per_month:
            raise QuotaExceeded(
                "You have used this month's share of the assistant. It starts again on the 1st (Manila time). "
                "If you are in danger, call 911.\nNaubos mo na ang bahagi mo ngayong buwan. Magsisimula ulit ito sa ika-1. "
                "Kung nasa panganib, tumawag sa 911.",
                seconds_until_next_month(now),
            )

        everyone_full = QuotaExceeded(
            "The assistant has reached its daily limit for everyone. Please try again tomorrow. If you are in danger, call 911.\n"
            "Naabot na ng assistant ang limitasyon nito para sa araw na ito. Subukan muli bukas. Kung nasa panganib, tumawag sa 911.",
            next_day,
        )
        if unlimited:
            # Only the whole app's caps apply; the account's own counts are kept for information, with no limit.
            steps = [(EVERYONE, REQUESTS, day, limits.everyone_requests_per_day, everyone_full)]
            if photo:
                steps.append((EVERYONE, UPLOADS, day, limits.everyone_uploads_per_day, everyone_full))
            self._reserve_all(steps)
            self.counters.add(user_id, REQUESTS, day, 1)
            if photo:
                self.counters.add(user_id, UPLOADS, day, 1)
            return

        steps = [
            (user_id, REQUESTS, day, limits.user_requests_per_day, QuotaExceeded(daily_text("assistant messages", limits.user_requests_per_day), next_day)),
            (EVERYONE, REQUESTS, day, limits.everyone_requests_per_day, everyone_full),
        ]
        if photo:
            steps += [
                (user_id, UPLOADS, day, limits.user_uploads_per_day, QuotaExceeded(daily_text("photo checks", limits.user_uploads_per_day), next_day)),
                (EVERYONE, UPLOADS, day, limits.everyone_uploads_per_day, everyone_full),
            ]
        self._reserve_all(steps)

    def count_voice_session(self, user_id: str, email: str | None = None) -> None:
        """Count one voice session. Raises ``QuotaExceeded`` when the user's day is used up (never for an unlimited account)."""
        now = self._clock()
        if self.is_unlimited(email):
            self.counters.add(user_id, VOICE, day_of(now), 1)
            return
        error = QuotaExceeded(daily_text("voice sessions", self.limits.user_voice_per_day), seconds_until_next_day(now))
        self._reserve_all([(user_id, VOICE, day_of(now), self.limits.user_voice_per_day, error)])

    def record(self, user_id: str, tokens: int, sam_requests: int) -> None:
        """Add what a finished request really used: chat-model tokens (monthly) and SAM requests (daily, for information)."""
        now = self._clock()
        if tokens > 0:
            self.counters.add(user_id, TOKENS, month_of(now), tokens)
        if sam_requests > 0:
            self.counters.add(user_id, SAM, day_of(now), sam_requests)

    def snapshot(self, user_id: str, email: str | None = None) -> dict:
        """The user's usage against the caps, for showing in the page (``unlimited`` is True for an unlimited account)."""
        now, limits = self._clock(), self.limits
        day, month = day_of(now), month_of(now)
        return {
            "messages_today": self.counters.get(user_id, REQUESTS, day),
            "messages_limit": limits.user_requests_per_day,
            "photos_today": self.counters.get(user_id, UPLOADS, day),
            "photos_limit": limits.user_uploads_per_day,
            "voice_today": self.counters.get(user_id, VOICE, day),
            "voice_limit": limits.user_voice_per_day,
            "tokens_this_month": self.counters.get(user_id, TOKENS, month),
            "tokens_limit": limits.user_tokens_per_month,
            "resets_in_seconds": seconds_until_next_day(now),
            "unlimited": self.is_unlimited(email),
        }
