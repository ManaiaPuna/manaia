// api/studio-invite.js
// POST { project, members, senderName }
// Sends invitation emails to Key Team and Crew members

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const BASE_URL = process.env.BASE_URL || 'https://manaia.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { project, members, senderName } = req.body;
  if (!project || !members?.length) return res.status(400).json({ error: 'project and members required' });

  const results = [];

  for (const member of members) {
    if (!member.email) continue;

    // Generate invite token (expires 7 days)
    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Store token in DB
    try {
      await supabase.from('invite_tokens').insert({
        token,
        project_id: project.id,
        member_name: member.name,
        member_email: member.email,
        member_role: member.role,
        member_pool: member.pool,
        member_pct: member.pct,
        rh_name: project.rhName,
        sender_name: senderName,
        expires_at: expiresAt,
        status: 'pending'
      });
    } catch (_) {}

    const acceptUrl = `${BASE_URL}/accept.html?token=${token}`;
    const poolLabel = member.pool === 'key_team' ? 'Rōpū Matua · Key Team' : 'Kaimahi · Crew';

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="background:#111110;color:#E8E6E1;font-family:sans-serif;margin:0;padding:0">
  <div style="max-width:520px;margin:0 auto;padding:48px 32px">

    <div style="font-family:serif;font-size:22px;letter-spacing:3px;text-transform:uppercase;margin-bottom:48px">
      Puna <span style="color:#C9894A">Studio</span>
    </div>

    <p style="font-size:13px;font-weight:300;color:#888;margin-bottom:8px">Kia ora ${member.name} —</p>
    <p style="font-family:serif;font-size:26px;margin-bottom:8px;line-height:1.15">
      You've been added to <em>${project.title}</em>.
    </p>
    <p style="font-size:13px;font-weight:300;color:#888;margin-bottom:40px">
      ${senderName} has invited you to join the ${poolLabel} for this project.
    </p>

    <!-- Details -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
      <tr style="border-bottom:1px solid #252523">
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444;width:40%">Project</td>
        <td style="padding:12px 0;font-size:13px;font-weight:400;text-align:right">${project.title}</td>
      </tr>
      <tr style="border-bottom:1px solid #252523">
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444">Your role</td>
        <td style="padding:12px 0;font-size:13px;font-weight:400;text-align:right">${member.role}</td>
      </tr>
      <tr style="border-bottom:1px solid #252523">
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444">Pool</td>
        <td style="padding:12px 0;font-size:13px;font-weight:400;text-align:right">${poolLabel}</td>
      </tr>
      <tr style="border-bottom:1px solid #252523">
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444">Revenue share</td>
        <td style="padding:12px 0;font-family:monospace;font-size:22px;font-weight:500;color:#C9894A;text-align:right">${member.pct}%</td>
      </tr>
      <tr>
        <td style="padding:12px 0;font-size:9px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444">Rights holder</td>
        <td style="padding:12px 0;font-size:13px;font-weight:400;text-align:right">${project.rhName}</td>
      </tr>
    </table>

    <!-- Important notice -->
    <div style="border-left:3px solid #252523;padding:16px 20px;margin-bottom:32px;background:#191918">
      <p style="font-size:10px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#444;margin-bottom:10px">Important</p>
      <p style="font-size:12px;font-weight:300;color:#888;line-height:1.85;margin:0">
        This invitation does <strong style="color:#E8E6E1;font-weight:500">not</strong> give you ownership of, or rights to, <em>${project.title}</em> or any associated intellectual property.
        <strong style="color:#E8E6E1;font-weight:500">${project.rhName}</strong> retains full ownership at all times.
        Your <strong style="color:#C9894A">${member.pct}%</strong> is a revenue share from net sales — a reward for your contribution to this project.
      </p>
    </div>

    <a href="${acceptUrl}" style="display:block;background:#E8E6E1;color:#111110;text-align:center;padding:14px 24px;font-size:11px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;margin-bottom:16px">
      Review &amp; Accept →
    </a>
    <p style="font-size:10px;font-weight:300;color:#444;text-align:center;line-height:1.65;margin-bottom:40px">
      This link expires in 7 days. If you have questions, contact ${senderName}.
    </p>

    <div style="border-top:1px solid #252523;padding-top:20px">
      <p style="font-size:10px;font-weight:300;color:#333;line-height:1.65">
        Puna Studio · Rights management for independent creators in Aotearoa New Zealand
      </p>
    </div>
  </div>
</body>
</html>`;

    try {
      await resend.emails.send({
        from: 'Puna Studio <onboarding@resend.dev>',
        to: member.email,
        subject: `You've been added to ${project.title} — review your invitation`,
        html
      });
      results.push({ email: member.email, status: 'sent' });
    } catch (err) {
      results.push({ email: member.email, status: 'failed', error: err.message });
    }
  }

  res.json({ sent: results.filter(r => r.status === 'sent').length, results });
}
