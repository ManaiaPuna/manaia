// api/send-update.js — Vercel serverless function
// Admin endpoint: broadcast a creator video update to all subscribers
// POST with { subject, message, videoUrl, videoThumbnail, adminKey }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple admin key check — replace with proper auth in production
  if (req.body.adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { subject, message, videoUrl, videoThumbnail } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ error: 'subject and message required' });
  }

  try {
    // Fetch all contacts from Resend audience
    const listRes = await fetch('https://api.resend.com/audiences/' + process.env.RESEND_AUDIENCE_ID + '/contacts', {
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY },
    });
    const { data: contacts } = await listRes.json();

    if (!contacts || contacts.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, message: 'No contacts found' });
    }

    const active = contacts.filter(c => !c.unsubscribed);

    // Send individually so each email is personalised
    // For large lists, use Resend Broadcasts API instead
    let sent = 0;
    let failed = 0;

    for (const contact of active) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Manaia <noreply@whanau.fun>',
            to: contact.email,
            subject,
            html: updateEmail(contact.email, subject, message, videoUrl, videoThumbnail),
          }),
        });

        if (emailRes.ok) { sent++; } else { failed++; }
      } catch {
        failed++;
      }
    }

    return res.status(200).json({ ok: true, sent, failed, total: active.length });

  } catch (err) {
    console.error('Send update error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

function updateEmail(email, subject, message, videoUrl, videoThumbnail) {
  const thumbnail = videoThumbnail || 'https://manaia.nz/og.jpg';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#111110;font-family:'Inter',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111110;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

          <!-- Wordmark -->
          <tr>
            <td style="padding:0 32px 40px;">
              <div style="font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#C2BDB6;font-family:Georgia,serif;">Puna</div>
            </td>
          </tr>

          <!-- Rule -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:#252523;margin-bottom:40px;"></div>
            </td>
          </tr>

          <!-- Label -->
          <tr>
            <td style="padding:0 32px 12px;">
              <div style="font-size:9px;font-weight:500;letter-spacing:2.5px;text-transform:uppercase;color:#C9894A;">Kōrero | Update</div>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding:0 32px 24px;">
              <div style="font-family:Georgia,serif;font-size:28px;line-height:1.15;letter-spacing:-0.5px;color:#E8E4DC;">${subject}</div>
            </td>
          </tr>

          ${videoUrl ? `
          <!-- Video thumbnail -->
          <tr>
            <td style="padding:0 32px 28px;">
              <a href="${videoUrl}" style="display:block;position:relative;text-decoration:none;">
                <img src="${thumbnail}" width="100%" alt="Play video" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#191918;">
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                  <div style="width:56px;height:56px;border-radius:50%;background:rgba(232,228,220,0.15);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
                    <div style="width:0;height:0;border-style:solid;border-width:10px 0 10px 18px;border-color:transparent transparent transparent #E8E4DC;margin-left:4px;"></div>
                  </div>
                </div>
              </a>
            </td>
          </tr>` : ''}

          <!-- Message -->
          <tr>
            <td style="padding:0 32px 40px;">
              <p style="font-family:Georgia,serif;font-style:italic;font-size:16px;line-height:1.75;color:#C2BDB6;margin:0;">${message}</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 40px;">
              <a href="https://manaia.nz" style="display:inline-block;background:#E8E4DC;color:#111110;font-size:10px;font-weight:500;letter-spacing:2.5px;text-transform:uppercase;text-decoration:none;padding:12px 24px;">
                Watch Manaia →
              </a>
            </td>
          </tr>

          <!-- Rule -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:#252523;margin-bottom:32px;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 32px;">
              <p style="font-size:10px;letter-spacing:0.5px;color:#B0ABA4;margin:0;line-height:1.8;">
                Manaia — A detective series. Aotearoa New Zealand, 2026.<br>
                You're receiving this because you signed up at manaia.nz.<br>
                <a href="https://manaia.nz/unsubscribe?email=${encodeURIComponent(email)}" style="color:#B0ABA4;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
