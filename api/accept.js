// api/accept.js
// GET  ?token=xxx                          — fetch invite details
// POST { token, signedName, acceptedAt }   — accept invitation
// POST { token, declined: true }           — decline invitation

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── FETCH INVITE (GET) ────────────────────────────
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'No token' });

    const { data, error } = await supabase
      .from('invite_tokens')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return res.status(404).json({ error: 'Invitation not found or expired' });

    return res.json({
      token: data.token,
      name: data.member_name,
      email: data.member_email,
      project: data.project_id, // will be joined with project title in production
      role: data.member_role,
      pool: data.member_pool === 'key_team' ? 'Rōpū Matua · Key Team' : 'Kaimahi · Crew',
      pct: data.member_pct,
      rhName: data.rh_name,
      senderName: data.sender_name
    });
  }

  // ── ACCEPT OR DECLINE (POST) ──────────────────────
  if (req.method === 'POST') {
    const { token, signedName, acceptedAt, declined } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });

    // Verify token still valid
    const { data: invite, error: fetchErr } = await supabase
      .from('invite_tokens')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (fetchErr || !invite) return res.status(404).json({ error: 'Invitation not found or expired' });

    if (declined) {
      // Mark declined
      await supabase
        .from('invite_tokens')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('token', token);

      // Update member status in project
      await supabase
        .from('members')
        .update({ status: 'declined' })
        .eq('project_id', invite.project_id)
        .eq('email', invite.member_email);

      return res.json({ ok: true, status: 'declined' });
    }

    if (!signedName) return res.status(400).json({ error: 'signedName required for acceptance' });

    // Mark accepted
    await supabase
      .from('invite_tokens')
      .update({
        status: 'accepted',
        signed_name: signedName,
        responded_at: acceptedAt || new Date().toISOString()
      })
      .eq('token', token);

    // Update member status in project
    await supabase
      .from('members')
      .update({ status: 'accepted', signed_name: signedName })
      .eq('project_id', invite.project_id)
      .eq('email', invite.member_email);

    // Send confirmation email to member
    try {
      await resend.emails.send({
        from: 'Puna Studio <onboarding@resend.dev>',
        to: invite.member_email,
        subject: `${invite.project_id} — your agreement is confirmed`,
        html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="background:#111110;color:#E8E6E1;font-family:sans-serif;margin:0;padding:0">
  <div style="max-width:520px;margin:0 auto;padding:48px 32px">
    <div style="font-family:serif;font-size:22px;letter-spacing:3px;text-transform:uppercase;margin-bottom:48px">
      Puna <span style="color:#C9894A">Studio</span>
    </div>
    <p style="font-size:13px;font-weight:300;color:#888;margin-bottom:8px">Kia ora ${invite.member_name} —</p>
    <p style="font-family:serif;font-size:26px;margin-bottom:24px;line-height:1.15">Your agreement is confirmed.</p>
    <p style="font-size:13px;font-weight:300;color:#888;line-height:1.75;margin-bottom:40px">
      Keep this email as your record. Your revenue share from ${invite.project_id} will be paid when sales are processed.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
      <tr style="border-bottom:1px solid #252523">
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444">Project</td>
        <td style="padding:12px 0;font-size:13px;text-align:right">${invite.project_id}</td>
      </tr>
      <tr style="border-bottom:1px solid #252523">
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444">Role</td>
        <td style="padding:12px 0;font-size:13px;text-align:right">${invite.member_role}</td>
      </tr>
      <tr style="border-bottom:1px solid #252523">
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444">Revenue share</td>
        <td style="padding:12px 0;font-family:monospace;font-size:22px;font-weight:500;color:#C9894A;text-align:right">${invite.member_pct}%</td>
      </tr>
      <tr style="border-bottom:1px solid #252523">
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444">Signed as</td>
        <td style="padding:12px 0;font-size:13px;text-align:right">${signedName}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444">Date</td>
        <td style="padding:12px 0;font-size:13px;text-align:right">${new Date(acceptedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
      </tr>
    </table>
    <div style="border-left:3px solid #252523;padding:16px 20px;background:#191918">
      <p style="font-size:12px;font-weight:300;color:#888;line-height:1.85;margin:0">
        This confirms your revenue share only. Ownership of <em>${invite.project_id}</em> and all associated intellectual property remains exclusively with <strong style="color:#E8E6E1">${invite.rh_name}</strong>.
      </p>
    </div>
  </div>
</body>
</html>`
      });
    } catch (_) {}

    return res.json({ ok: true, status: 'accepted' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
