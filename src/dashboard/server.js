'use strict';

const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const path = require('path');

function startDashboard(client) {
  const app = express();
  const config = client.config;
  const port = Number(process.env.DASHBOARD_PORT || 3000);
  const isProduction = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use(express.json({ limit: '20kb' }));
  app.use(session({
    name: 'rizzfr.sid',
    secret: process.env.DASHBOARD_SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 8 * 60 * 60 * 1000 },
  }));

  const dashboardEnabled = () => Boolean(
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET &&
    process.env.DASHBOARD_REDIRECT_URI && process.env.DASHBOARD_SESSION_SECRET
  );
  const privilegedIds = () => new Set([
    ...(Array.isArray(config.owner) ? config.owner : []),
    ...(Array.isArray(config.dashboardDevelopers) ? config.dashboardDevelopers : []),
  ].filter(id => /^\d{17,20}$/.test(String(id))));
  const isPrivileged = req => Boolean(req.session?.user?.id && privilegedIds().has(req.session.user.id));
  const allGuildSummaries = async () => {
    const mapGuild = guild => ({
      id: guild.id, name: guild.name, icon: guild.iconURL({ size: 64 }), memberCount: guild.memberCount,
      antinuke: client.lmdbGet(`antinuke_${guild.id}`) === 'enabled',
      automod: client.lmdbGet(`automod_${guild.id}`) === 'enabled',
    });
    if (typeof client.cluster?.broadcastEval === 'function') {
      const groups = await client.cluster.broadcastEval(c => [...c.guilds.cache.values()].map(g => ({ id: g.id, name: g.name, icon: g.iconURL({ size: 64 }), memberCount: g.memberCount })));
      const unique = new Map();
      for (const guild of groups.flat()) unique.set(guild.id, guild);
      return [...unique.values()].map(g => ({ ...g, antinuke: client.lmdbGet(`antinuke_${g.id}`) === 'enabled', automod: client.lmdbGet(`automod_${g.id}`) === 'enabled' }));
    }
    return [...client.guilds.cache.values()].map(mapGuild);
  };
  const botIsInGuild = async guildId => {
    if (client.guilds.cache.has(guildId)) return true;
    if (typeof client.cluster?.broadcastEval === 'function') {
      const matches = await client.cluster.broadcastEval((c, context) => c.guilds.cache.has(context.guildId), { context: { guildId } });
      return matches.some(Boolean);
    }
    return false;
  };

  app.get('/auth/login', (req, res) => {
    if (!dashboardEnabled()) return res.status(503).send('Dashboard OAuth is not configured. Set the required environment variables.');
    const state = require('crypto').randomBytes(24).toString('hex');
    req.session.oauthState = state;
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      redirect_uri: process.env.DASHBOARD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
      state,
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  });

  app.get('/auth/callback', async (req, res) => {
    try {
      if (!dashboardEnabled()) return res.status(503).send('Dashboard OAuth is not configured.');
      if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) {
        return res.status(400).send('Invalid OAuth state. Please try logging in again.');
      }
      delete req.session.oauthState;
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: String(req.query.code),
          redirect_uri: process.env.DASHBOARD_REDIRECT_URI,
        }),
      });
      if (!tokenResponse.ok) return res.status(401).send('Discord authentication failed.');
      const token = await tokenResponse.json();
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!userResponse.ok) return res.status(401).send('Could not verify Discord account.');
      const user = await userResponse.json();
      if (!privilegedIds().has(user.id)) return res.status(403).send('This dashboard is restricted to configured bot owners and developers.');
      req.session.user = { id: user.id, username: user.username, avatar: user.avatar };
      req.session.save(() => res.redirect('/'));
    } catch (error) {
      console.error('[Dashboard OAuth]', error.message);
      res.status(500).send('Login failed. Please try again later.');
    }
  });

  app.post('/auth/logout', (req, res) => req.session.destroy(() => {
    res.clearCookie('rizzfr.sid');
    res.json({ ok: true });
  }));

  app.use('/assets', express.static(path.join(__dirname, 'public'), { maxAge: isProduction ? '1h' : 0 }));
  app.get('/', (req, res) => {
    if (!isPrivileged(req)) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

  app.use('/api', (req, res, next) => {
    if (!isPrivileged(req)) return res.status(401).json({ error: 'Authentication required.' });
    next();
  });
  app.get('/api/me', (req, res) => res.json({ user: req.session.user }));
  app.get('/api/guilds', async (req, res) => {
    try { res.json({ guilds: await allGuildSummaries() }); }
    catch (error) { console.error('[Dashboard guild list]', error.message); res.status(500).json({ error: 'Could not load servers.' }); }
  });
  app.get('/api/guilds/:guildId', async (req, res) => {
    const guildId = req.params.guildId;
    if (!(await botIsInGuild(guildId))) return res.status(404).json({ error: 'Bot is not in that server.' });
    const localGuild = client.guilds.cache.get(guildId);
    let guildName = localGuild?.name;
    if (!guildName && typeof client.cluster?.broadcastEval === 'function') {
      const names = await client.cluster.broadcastEval((c, context) => c.guilds.cache.get(context.guildId)?.name || null, { context: { guildId } });
      guildName = names.find(Boolean);
    }
    const prefix = await client.db.get(`prefix_${guildId}`).catch(() => null);
    res.json({ guild: { id: guildId, name: guildName || 'Discord server', prefix: prefix || config.prefix || ';', antinuke: client.lmdbGet(`antinuke_${guildId}`) === 'enabled', automod: client.lmdbGet(`automod_${guildId}`) === 'enabled' } });
  });
  app.patch('/api/guilds/:guildId', async (req, res) => {
    const guildId = req.params.guildId;
    if (!(await botIsInGuild(guildId))) return res.status(404).json({ error: 'Bot is not in that server.' });
    const { prefix, antinuke, automod } = req.body || {};
    if (prefix !== undefined && (typeof prefix !== 'string' || prefix.length < 1 || prefix.length > 5 || /\s/.test(prefix))) {
      return res.status(400).json({ error: 'Prefix must be 1–5 characters with no spaces.' });
    }
    if (antinuke !== undefined && typeof antinuke !== 'boolean') return res.status(400).json({ error: 'antinuke must be true or false.' });
    if (automod !== undefined && typeof automod !== 'boolean') return res.status(400).json({ error: 'automod must be true or false.' });
    try {
      if (prefix !== undefined) await client.db.set(`prefix_${guildId}`, prefix);
      if (antinuke !== undefined) client.lmdbSet(`antinuke_${guildId}`, antinuke ? 'enabled' : 'disabled');
      if (automod !== undefined) client.lmdbSet(`automod_${guildId}`, automod ? 'enabled' : 'disabled');
      res.json({ ok: true });
    } catch (error) {
      console.error('[Dashboard settings]', error.message);
      res.status(500).json({ error: 'Could not save settings.' });
    }
  });

  app.listen(port, '0.0.0.0', () => console.log(`[RizzFR Dashboard] Listening on port ${port}`));
  return app;
}

module.exports = startDashboard;
