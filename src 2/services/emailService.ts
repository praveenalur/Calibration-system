// src 2/services/emailService.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendCalibrationAlert(gaugeId: string, description: string, overdueDate: string) {
  await resend.emails.send({
    from: 'alerts@yourdomain.com',
    to: 'sushantds2003@gmail.com',
    subject: `⚠️ Gauge ${gaugeId} calibration overdue`,
    html: `
      <h2>Calibration Alert</h2>
      <p><strong>Gauge:</strong> ${gaugeId} — ${description}</p>
      <p><strong>Was due:</strong> ${overdueDate}</p>
      <p>Please schedule calibration immediately.</p>
    `
  });
}