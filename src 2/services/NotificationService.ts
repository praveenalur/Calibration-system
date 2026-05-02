import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { UserRepository } from '../repositories/UserRepository';
import { IAlert } from '../models/Alert';
import { IGauge } from '../models/Gauge';

export interface NotificationConfig {
  email: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
  sms: {
    enabled: boolean;
    accountSid: string;
    authToken: string;
    fromNumber: string;
  };
}

export class NotificationService {
  private emailTransporter: nodemailer.Transporter | null = null;
  private twilioClient: twilio.Twilio | null = null;
  private userRepo: UserRepository;
  private config: NotificationConfig;

  constructor() {
    this.userRepo = new UserRepository();
    this.config = {
      email: {
        enabled: process.env.EMAIL_ENABLED === 'true',
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        user: process.env.EMAIL_USER || '',
        password: process.env.EMAIL_PASSWORD || '',
        from: process.env.EMAIL_FROM || 'noreply@capacity-system.com'
      },
      sms: {
        enabled: process.env.SMS_ENABLED === 'true',
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        fromNumber: process.env.TWILIO_FROM_NUMBER || ''
      }
    };

    this.initializeServices();
  }

  private initializeServices(): void {
    // Initialize email service
    if (this.config.email.enabled && this.config.email.user && this.config.email.password) {
      this.emailTransporter = nodemailer.createTransporter({
        host: this.config.email.host,
        port: this.config.email.port,
        secure: this.config.email.secure,
        auth: {
          user: this.config.email.user,
          pass: this.config.email.password
        }
      });
      console.log('📧 Email service initialized');
    }

    // Initialize SMS service
    if (this.config.sms.enabled && this.config.sms.accountSid && this.config.sms.authToken) {
      this.twilioClient = twilio(this.config.sms.accountSid, this.config.sms.authToken);
      console.log('📱 SMS service initialized');
    }
  }

  async sendAlertNotification(alert: IAlert, gauge: IGauge): Promise<{
    email: { sent: boolean; error?: string };
    sms: { sent: boolean; error?: string };
  }> {
    const result = {
      email: { sent: false, error: undefined as string | undefined },
      sms: { sent: false, error: undefined as string | undefined }
    };

    try {
      // Get users who should receive notifications (admins and operators)
      const [admins, operators] = await Promise.all([
        this.userRepo.findByRole('admin'),
        this.userRepo.findByRole('operator')
      ]);

      const notificationUsers = [...admins, ...operators];

      if (notificationUsers.length === 0) {
        console.log('⚠️ No users found for notifications');
        return result;
      }

      // Send email notifications
      if (this.emailTransporter) {
        try {
          const emailAddresses = notificationUsers.map(user => user.email).join(', ');
          
          const emailContent = this.generateEmailContent(alert, gauge);
          
          await this.emailTransporter.sendMail({
            from: this.config.email.from,
            to: emailAddresses,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text
          });

          result.email.sent = true;
          console.log(`📧 Alert email sent to ${notificationUsers.length} users`);
        } catch (error) {
          result.email.error = error instanceof Error ? error.message : 'Unknown email error';
          console.error('📧 Email notification failed:', error);
        }
      }

      // Send SMS notifications
      if (this.twilioClient) {
        try {
          const usersWithPhone = notificationUsers.filter(user => user.phone);
          
          if (usersWithPhone.length > 0) {
            const smsContent = this.generateSMSContent(alert, gauge);
            
            const smsPromises = usersWithPhone.map(user =>
              this.twilioClient!.messages.create({
                body: smsContent,
                from: this.config.sms.fromNumber,
                to: user.phone!
              })
            );

            await Promise.all(smsPromises);
            result.sms.sent = true;
            console.log(`📱 Alert SMS sent to ${usersWithPhone.length} users`);
          }
        } catch (error) {
          result.sms.error = error instanceof Error ? error.message : 'Unknown SMS error';
          console.error('📱 SMS notification failed:', error);
        }
      }

    } catch (error) {
      console.error('🚨 Notification service error:', error);
    }

    return result;
  }

  async sendDailyCalibrationReport(upcomingGauges: IGauge[]): Promise<void> {
    if (!this.emailTransporter || upcomingGauges.length === 0) return;

    try {
      const admins = await this.userRepo.findByRole('admin');
      if (admins.length === 0) return;

      const emailAddresses = admins.map(user => user.email).join(', ');
      const emailContent = this.generateDailyReportContent(upcomingGauges);

      await this.emailTransporter.sendMail({
        from: this.config.email.from,
        to: emailAddresses,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });

      console.log(`📧 Daily calibration report sent to ${admins.length} admins`);
    } catch (error) {
      console.error('📧 Daily report email failed:', error);
    }
  }

  private generateEmailContent(alert: IAlert, gauge: IGauge): {
    subject: string;
    html: string;
    text: string;
  } {
    const severityEmoji = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const subject = `${severityEmoji[alert.severity]} Capacity System Alert: ${gauge.gauge_id}`;
    
    const text = `
Capacity System Alert

Gauge: ${gauge.gauge_id} (${gauge.gauge_type})
Alert Type: ${alert.alert_type.replace('_', ' ').toUpperCase()}
Severity: ${alert.severity.toUpperCase()}
Message: ${alert.message}

Gauge Details:
- Remaining Capacity: ${gauge.remaining_capacity}/${gauge.max_capacity}
- Capacity Utilization: ${Math.round(gauge.capacity_utilization)}%
- Status: ${gauge.status.replace('_', ' ').toUpperCase()}
- Next Calibration: ${gauge.next_calibration_date.toDateString()}

Time: ${alert.created_at.toLocaleString()}

Please log into the Capacity Management System to review and acknowledge this alert.
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .alert-critical { border-left: 5px solid #dc3545; }
        .alert-warning { border-left: 5px solid #ffc107; }
        .alert-info { border-left: 5px solid #17a2b8; }
        .gauge-details { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 12px; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header alert-${alert.severity}">
            <h2>${severityEmoji[alert.severity]} Capacity System Alert</h2>
            <p><strong>Gauge:</strong> ${gauge.gauge_id} (${gauge.gauge_type})</p>
            <p><strong>Alert Type:</strong> ${alert.alert_type.replace('_', ' ').toUpperCase()}</p>
            <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
        </div>
        
        <div class="alert-message">
            <h3>Alert Message</h3>
            <p>${alert.message}</p>
        </div>
        
        <div class="gauge-details">
            <h3>Gauge Details</h3>
            <ul>
                <li><strong>Remaining Capacity:</strong> ${gauge.remaining_capacity}/${gauge.max_capacity}</li>
                <li><strong>Capacity Utilization:</strong> ${Math.round(gauge.capacity_utilization)}%</li>
                <li><strong>Status:</strong> ${gauge.status.replace('_', ' ').toUpperCase()}</li>
                <li><strong>Next Calibration:</strong> ${gauge.next_calibration_date.toDateString()}</li>
            </ul>
        </div>
        
        <div class="footer">
            <p>Alert generated at: ${alert.created_at.toLocaleString()}</p>
            <p>Please log into the Capacity Management System to review and acknowledge this alert.</p>
        </div>
    </div>
</body>
</html>
    `;

    return { subject, html, text };
  }

  private generateSMSContent(alert: IAlert, gauge: IGauge): string {
    const severityEmoji = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️'
    };

    return `${severityEmoji[alert.severity]} CAPACITY ALERT: ${gauge.gauge_id} - ${alert.alert_type.replace('_', ' ').toUpperCase()}. Remaining: ${gauge.remaining_capacity}/${gauge.max_capacity}. Check system for details.`;
  }

  private generateDailyReportContent(upcomingGauges: IGauge[]): {
    subject: string;
    html: string;
    text: string;
  } {
    const subject = `📊 Daily Calibration Report - ${upcomingGauges.length} Gauges Require Attention`;
    
    const text = `
Daily Calibration Report - ${new Date().toDateString()}

${upcomingGauges.length} gauges require calibration attention:

${upcomingGauges.map(gauge => 
  `- ${gauge.gauge_id} (${gauge.gauge_type}): ${gauge.status.replace('_', ' ').toUpperCase()} - Next calibration: ${gauge.next_calibration_date.toDateString()}`
).join('\n')}

Please review these gauges in the Capacity Management System.
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .gauge-list { background: #f8f9fa; padding: 15px; border-radius: 5px; }
        .gauge-item { padding: 10px; border-bottom: 1px solid #dee2e6; }
        .gauge-item:last-child { border-bottom: none; }
        .status-overdue { color: #dc3545; font-weight: bold; }
        .status-calibration_required { color: #ffc107; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>📊 Daily Calibration Report</h2>
            <p>${new Date().toDateString()}</p>
        </div>
        
        <p><strong>${upcomingGauges.length} gauges require calibration attention:</strong></p>
        
        <div class="gauge-list">
            ${upcomingGauges.map(gauge => `
                <div class="gauge-item">
                    <strong>${gauge.gauge_id}</strong> (${gauge.gauge_type})<br>
                    Status: <span class="status-${gauge.status}">${gauge.status.replace('_', ' ').toUpperCase()}</span><br>
                    Next Calibration: ${gauge.next_calibration_date.toDateString()}
                </div>
            `).join('')}
        </div>
        
        <p style="margin-top: 20px;">Please review these gauges in the Capacity Management System.</p>
    </div>
</body>
</html>
    `;

    return { subject, html, text };
  }

  getStatus(): {
    email: { enabled: boolean; configured: boolean };
    sms: { enabled: boolean; configured: boolean };
  } {
    return {
      email: {
        enabled: this.config.email.enabled,
        configured: !!this.emailTransporter
      },
      sms: {
        enabled: this.config.sms.enabled,
        configured: !!this.twilioClient
      }
    };
  }
}