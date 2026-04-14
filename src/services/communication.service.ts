import nodemailer from "nodemailer";
import Twilio from "twilio";
import { env } from "../config/env";

export class CommunicationService {
  private readonly mailer =
    env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          },
        })
      : null;

  private readonly twilioClient =
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
      ? Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
      : null;

  async sendEmail(to: string, subject: string, body: string) {
    if (!this.mailer || !env.SMTP_FROM_EMAIL) {
      throw new Error("SMTP is not fully configured");
    }

    await this.mailer.sendMail({
      from: env.SMTP_FROM_NAME
        ? `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`
        : env.SMTP_FROM_EMAIL,
      to,
      subject,
      text: body,
      html: `<div dir="auto">${escapeHtml(body).replace(/\n/g, "<br />")}</div>`,
    });
  }

  async sendSms(to: string, body: string) {
    if (!this.twilioClient || !env.TWILIO_SMS_FROM) {
      throw new Error("Twilio SMS is not fully configured");
    }

    await this.twilioClient.messages.create({
      to,
      from: env.TWILIO_SMS_FROM,
      body,
    });
  }

  async sendWhatsApp(to: string, body: string) {
    if (!this.twilioClient || !env.TWILIO_WHATSAPP_FROM) {
      throw new Error("Twilio WhatsApp is not fully configured");
    }

    const normalizedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const from = env.TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
      ? env.TWILIO_WHATSAPP_FROM
      : `whatsapp:${env.TWILIO_WHATSAPP_FROM}`;

    await this.twilioClient.messages.create({
      to: normalizedTo,
      from,
      body,
    });
  }
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
