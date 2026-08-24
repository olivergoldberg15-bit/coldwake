// Coldwake first-drop waitlist.
// Stores confirmed signups as contacts in a Resend Audience. Both values stay
// server-side in Vercel environment variables and are never sent to browsers.

function parseBody(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return req.body || {};
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = parseBody(req);
  if (body.company) return res.status(200).json({ ok: true }); // honeypot

  const email = String(body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    return res.status(503).json({ error: 'The waitlist is being connected. Please check back shortly.' });
  }

  try {
    const upstream = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    });

    if (upstream.ok || upstream.status === 409) return res.status(200).json({ ok: true });
    return res.status(502).json({ error: 'Could not join right now. Please try again.' });
  } catch (_) {
    return res.status(502).json({ error: 'Could not join right now. Please try again.' });
  }
};
