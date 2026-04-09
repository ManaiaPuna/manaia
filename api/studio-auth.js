// api/studio-auth.js
// Magic link auth for Rights Holder studio
// POST { email, name } — sends magic link
// GET  ?token=xxx      — verifies token, returns user

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── VERIFY TOKEN (GET) ────────────────────────────
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'No token' });

    const { data, error } = await supabase
      .from('studio_tokens')
      .select('*, rights_holders(*)')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return res.status(401).json({ error: 'Invalid or expired token' });

    // Mark token used
    await supabase.from('studio_tokens').update({ used: true }).eq('token', token);

    return res.json({ user: data.rights_holders });
  }

  // ── SEND MAGIC LINK (POST) ────────────────────────
  if (req.method === 'POST') {
    const { email, name } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'email and name required' });

    // Upsert rights holder
    const { data: rh, error: rhErr } = await supabase
      .from('rights_holders')
      .upsert({ email, name }, { onConflict: 'email' })
      .select()
      .single();

    if (rhErr) return res.status(500).json({ error: rhErr.message });

    // Create token (expires 24h)
    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('studio_tokens').insert({
      token,
      rights_holder_id: rh.id,
      expires_at: expiresAt,
      used: false
    });

    const loginUrl = `${process.env.BASE_URL || 'https://manaia.vercel.app'}/studio.html?token=${token}`;

    // Send email
    await resend.emails.send({
      from: 'Puna Studio <onboarding@resend.dev>',
      to: email,
      subject: 'Your Puna Studio link',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="background:#111110;color:#E8E6E1;font-family:sans-serif;margin:0;padding:0">
          <div style="max-width:480px;margin:0 auto;padding:48px 32px">
            <div style="font-family:serif;font-size:22px;letter-spacing:3px;text-transform:uppercase;margin-bottom:40px">
              Puna <span style="color:#C9894A">Studio</span>
            </div>
            <p style="font-size:13px;font-weight:300;color:#888;margin-bottom:8px">Kia ora ${name} —</p>
            <p style="font-family:serif;font-size:24px;margin-bottom:24px;line-height:1.2">Your studio link is ready.</p>
            <p style="font-size:13px;font-weight:300;color:#888;line-height:1.75;margin-bottom:32px">
              Click below to enter Puna Studio. This link expires in 24 hours.
            </p>
            <a href="${loginUrl}" style="display:block;background:#E8E6E1;color:#111110;text-align:center;padding:14px 24px;font-size:11px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none">
              Enter Studio →
            </a>
            <p style="font-size:10px;font-weight:300;color:#444;margin-top:32px;line-height:1.65">
              If you didn't request this, ignore this email. No account has been created.
            </p>
          </div>
        </body>
        </html>`
    });

    return res.json({ ok: true, loginUrl });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
