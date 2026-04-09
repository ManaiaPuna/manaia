// api/crew-auth.js
// GET  ?token=xxx         — verify token, return crew data + agreements
// POST { email }          — send magic link to crew member
// PATCH { email, bio, …}  — update crew profile

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);
const BASE_URL = process.env.BASE_URL || 'https://manaia.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── VERIFY TOKEN (GET) ────────────────────────
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'No token' });

    const { data: tokenRow, error } = await supabase
      .from('crew_tokens')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !tokenRow) return res.status(401).json({ error: 'Invalid or expired token' });

    await supabase.from('crew_tokens').update({ used: true }).eq('token', token);

    // Fetch all accepted agreements for this email
    const { data: invites } = await supabase
      .from('invite_tokens')
      .select('*, projects(title, rh_name)')
      .eq('member_email', tokenRow.email)
      .eq('status', 'accepted');

    // Fetch profile
    const { data: profile } = await supabase
      .from('crew_profiles')
      .select('*')
      .eq('email', tokenRow.email)
      .single();

    const agreements = (invites || []).map(i => ({
      project: i.projects?.title || i.project_id,
      role: i.member_role,
      pool: i.member_pool,
      pct: i.member_pct,
      rhName: i.rh_name || i.projects?.rh_name,
      signedName: i.signed_name,
      signedAt: i.responded_at,
      earned: 0 // TODO: calculate from Stripe when connected
    }));

    return res.json({
      crew: {
        name: tokenRow.name,
        email: tokenRow.email,
        bio: profile?.bio || '',
        imdb: profile?.imdb || '',
        instagram: profile?.instagram || '',
        website: profile?.website || '',
        agreements
      }
    });
  }

  // ── SEND MAGIC LINK (POST) ────────────────────
  if (req.method === 'POST') {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    // Check crew member exists in invite_tokens
    const { data: invite } = await supabase
      .from('invite_tokens')
      .select('member_name, member_email')
      .eq('member_email', email)
      .eq('status', 'accepted')
      .limit(1)
      .single();

    if (!invite) return res.status(404).json({ error: 'No accepted invitation found for this email' });

    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('crew_tokens').insert({
      token,
      email,
      name: invite.member_name,
      expires_at: expiresAt,
      used: false
    });

    const loginUrl = `${BASE_URL}/crew.html?token=${token}`;

    await resend.emails.send({
      from: 'Puna Studio <onboarding@resend.dev>',
      to: email,
      subject: 'Your Puna crew portal link',
      html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="background:#111110;color:#E8E6E1;font-family:sans-serif;margin:0;padding:0">
  <div style="max-width:480px;margin:0 auto;padding:48px 32px">
    <div style="font-family:serif;font-size:22px;letter-spacing:3px;text-transform:uppercase;margin-bottom:40px">
      Puna <span style="color:#C9894A">Studio</span>
    </div>
    <p style="font-size:13px;font-weight:300;color:#888;margin-bottom:8px">Kia ora ${invite.member_name} —</p>
    <p style="font-family:serif;font-size:24px;margin-bottom:24px;line-height:1.2">Your crew portal is ready.</p>
    <p style="font-size:13px;font-weight:300;color:#888;line-height:1.75;margin-bottom:32px">
      View your agreement, royalties, and public profile. This link expires in 24 hours.
    </p>
    <a href="${loginUrl}" style="display:block;background:#E8E6E1;color:#111110;text-align:center;padding:14px 24px;font-size:11px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none">
      View my portal →
    </a>
  </div>
</body></html>`
    });

    return res.json({ ok: true, loginUrl });
  }

  // ── UPDATE PROFILE (PATCH) ────────────────────
  if (req.method === 'PATCH') {
    const { email, bio, imdb, instagram, website } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    await supabase.from('crew_profiles').upsert({
      email, bio, imdb, instagram, website,
      updated_at: new Date().toISOString()
    }, { onConflict: 'email' });

    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
