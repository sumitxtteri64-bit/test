# Punisher Security Bot

Punisher is a Discord security and moderation bot with antinuke, automod, logging, verification, moderation commands, and an owner/developer-only web dashboard. The AntiRaid module has been removed.

## Requirements

- Node.js 18 or newer
- A Discord application/bot and its token
- MongoDB connection string for the existing QuickMongo database
- Discord OAuth2 credentials for the dashboard

## Install

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in the values. Do not commit `.env` or share bot/OAuth secrets.
3. Edit `src/config.json`: set `token` or use `DISCORD_TOKEN`, set `MONGO` or use `MONGODB_URL`, and put the bot owner's Discord user ID(s) in `owner`. Add trusted dashboard developer user IDs to `dashboardDevelopers`.
4. In the Discord Developer Portal, open **OAuth2** and add the exact `DASHBOARD_REDIRECT_URI` to Redirects. The dashboard only requests the `identify` scope.
5. Start with `npm run start:no-shard` for a small deployment or `npm start` for sharded deployments.

## Dashboard

The dashboard listens on `DASHBOARD_PORT` (default `3000`). Visit `/login` and sign in with Discord. Access is granted only when the authenticated Discord user ID matches `owner` or `dashboardDevelopers` in `src/config.json`. The dashboard lists servers the bot is in and supports changing each server's command prefix and enabling/disabling the existing antinuke and automod flags.

Use HTTPS in production and set a long, random `DASHBOARD_SESSION_SECRET`. If running behind a reverse proxy that terminates HTTPS, set `TRUST_PROXY=true`. For production, use a persistent session store instead of express-session's default in-memory store if you expect multiple instances or restarts.

### Rename the actual Discord bot

Code branding and presence now use **Punisher**. Discord does not let a bot rename its own application account through ordinary bot code; update the application/bot name and avatar in the Discord Developer Portal as well.

## Security notes

- Never expose `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, or `DASHBOARD_SESSION_SECRET` in source control.
- Keep `owner` and `dashboardDevelopers` limited to trusted Discord user IDs. Dashboard developers have broad access to configuration for every server where the bot is installed.
- The dashboard uses server-side Discord OAuth verification; do not replace it with client-side role or username checks.
- The existing bot modules and their permissions should be reviewed before public deployment.
