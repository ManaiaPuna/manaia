// api/notify.js — Vercel serverless function
// Adds a viewer's email to the Resend audience when they sign up for episode notifications

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, episode } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const firstName = name ? name.split(' ')[0] : '';

  try {
    // Add contact to Resend audience
    const response = await fetch('https://api.resend.com/audiences/' + process.env.RESEND_AUDIENCE_ID + '/contacts', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        first_name: firstName || undefined,
        unsubscribed: false,
        data: {
          episode: episode || 'general',
          signed_up_at: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      // Resend returns 409 if contact already exists — treat as success
      if (response.status !== 409) {
        console.error('Resend error:', err);
        return res.status(500).json({ error: 'Failed to subscribe' });
      }
    }

    // Send confirmation email
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Manaia <onboarding@resend.dev>',
          to: email,
          subject: episode
            ? `EP.${episode} drops soon — you'll hear from us first`
            : `You're in — the case is open`,
          html: confirmationEmail(email, firstName, episode),
        }),
      });
    } catch (emailErr) {
      console.log('Confirmation email skipped:', emailErr.message);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Notify error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

function confirmationEmail(email, name, episode) {
  const greeting = name ? `Kia ora ${name} —` : `Kia ora —`;
  const headline = episode
    ? `You're in. EP.${episode} is coming.`
    : `You're in. The case is open.`;
  const body = episode
    ? `We'll send you a reminder the day before EP.${episode} drops — so you get the early price.`
    : `We'll be in touch as episodes drop and the story unfolds.`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manaia</title>
</head>
<body style="margin:0;padding:0;background:#111110;font-family:'Inter',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111110;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;padding:0 24px;">

          <!-- Wordmark -->
          <tr>
            <td style="padding:0 0 8px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;letter-spacing:-0.5px;color:#E8E4DC;line-height:1;">Manaia</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 32px;">
              <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#C9894A;font-family:'Inter',Helvetica,Arial,sans-serif;">A detective series &mdash; Aotearoa New Zealand</div>
            </td>
          </tr>

          <!-- Rule -->
          <tr>
            <td style="padding:0 0 32px;">
              <div style="height:1px;background:#252523;"></div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:0 0 10px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;font-style:italic;color:#999890;">${greeting}</div>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding:0 0 20px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;letter-spacing:-0.5px;color:#E8E4DC;">${headline}</div>
            </td>
          </tr>

          <!-- Atmospheric line -->
          <tr>
            <td style="padding:0 0 20px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;font-style:italic;line-height:1.75;color:#777770;">When a young M&#257;ori man vanishes from Wellington&#39;s waterfront, detective Manaia Parata is the only one who thinks it matters.</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:0 0 36px;">
              <p style="font-size:13px;line-height:1.75;color:#C2BDB6;margin:0;">${body}</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 0 44px;">
              <a href="https://manaia.nz" style="display:inline-block;background:#E8E4DC;color:#111110;font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:13px 28px;font-family:'Inter',Helvetica,Arial,sans-serif;">
                WATCH EP.01 &mdash; FREE
              </a>
            </td>
          </tr>

          <!-- Rule -->
          <tr>
            <td style="padding:0 0 24px;">
              <div style="height:1px;background:#252523;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td>
              <p style="font-size:10px;letter-spacing:0.5px;color:#444;margin:0;line-height:1.8;font-family:'Inter',Helvetica,Arial,sans-serif;">
                PUNA &mdash; Manaia Series 1, 2026<br>
                <a href="https://manaia.nz/unsubscribe?email=${encodeURIComponent(email)}" style="color:#444;text-decoration:underline;">Unsubscribe</a>
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
