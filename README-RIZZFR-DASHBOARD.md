# RizzFR dashboard refresh

## What changed
- Rebuilt the dashboard and sign-in page with a responsive dark violet/cyan security-console theme.
- Added overview metrics for connected servers, antinuke, automod, and combined protection coverage.
- Added live server search by name or ID, refresh controls, and clearer empty/error states.
- Added owner/developer quick insights and a support-server shortcut.
- Improved settings dialog behavior and accessibility, including close-on-backdrop and keyboard focus for toggles.
- Replaced Aerox invite links found in source files with `https://discord.gg/rizzfr` and rebranded dashboard session/log labels.

## Existing configuration requirements
The dashboard still uses the existing Discord OAuth flow and only allows IDs configured in `config.owner` or `config.dashboardDevelopers`.
Set these environment variables before enabling dashboard login:
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DASHBOARD_REDIRECT_URI`
- `DASHBOARD_SESSION_SECRET` (use a long random secret)
- `DASHBOARD_PORT` (optional; defaults to 3000)

The archive originally included a MongoDB connection URI in `src/config.json`. For safety, keep database credentials in your hosting environment as `MONGODB_URL` and rotate that URI if it has been shared outside your trusted environment.

## Notes
- The owner/developer cards are dashboard insights and shortcuts, not a new remote shell or arbitrary command runner.
- Server settings only expose the prefix, antinuke, and automod switches already supported by the original dashboard backend.
