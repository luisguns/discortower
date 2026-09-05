-- Introduce the "channel_invite" direct-message kind.
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that adds it,
-- so this migration only registers the value; the columns, constraints and
-- helper routines that use it live in the next migration.
alter type public.direct_message_kind add value if not exists 'channel_invite';
