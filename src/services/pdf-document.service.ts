/*
 * PDFDocumentService
 *
 * - Generates PDF documents for invoices
 * - Uses PDFKit for professional PDF generation
 * - Bilingual support (Arabic/English)
 */

import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";

export class PDFDocumentService {
  private readonly invoicesDir: string;

  constructor() {
    this.invoicesDir = process.env.INVOICES_DIR || "./invoices";
    if (!fs.existsSync(this.invoicesDir)) {
      fs.mkdirSync(this.invoicesDir, { recursive: true });
    }
  }

  /**
   * generateInvoicePDF
   *
   * - Creates a professional invoice PDF
   * - Bilingual header (Arabic/English)
   * - Returns file path
   */
  async generateInvoicePDF(
    invoice: any,
    orgName: string
  ): Promise<string> {
    const filename = `invoice-${invoice.invoiceNumber}.pdf`;
    const filePath = path.join(this.invoicesDir, filename);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header - Organization name
        doc.fontSize(20).text(orgName, { align: "center" });
        doc.moveDown();

        // Invoice title (bilingual)
        doc.fontSize(16).text("فاتورة / INVOICE", { align: "center" });
        doc.moveDown();

        // Invoice number and date
        doc.fontSize(12)
          .text(`Invoice Number: ${invoice.invoiceNumber}`)
          .text(`Invoice Date: ${new Date(invoice.issueDate).toLocaleDateString()}`)
          .text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`);

        doc.moveDown();

        // Amount (convert from halalas to SAR)
        const amountSAR = (invoice.amount / 100).toFixed(2);
        doc.fontSize(14)
          .text(`Amount: ${amountSAR} ${invoice.currency || "SAR"}`)
          .text(`Status: ${invoice.status.toUpperCase()}`);

        if (invoice.paidDate) {
          doc.text(`Paid Date: ${new Date(invoice.paidDate).toLocaleDateString()}`);
        }

        doc.moveDown();

        // Subscription details (if exists)
        if (invoice.subscription?.plan) {
          doc.fontSize(11)
            .text(`Plan: ${invoice.subscription.plan.name}`)
            .text(`Billing Cycle: ${invoice.subscription.billingCycle}`);
          doc.moveDown();
        }

        // Footer (bilingual)
        doc.fontSize(10)
          .text("Thank you for your business / شكراً لتعاملكم معنا", {
            align: "center",
          });

        doc.end();

        stream.on("finish", () => resolve(filePath));
        stream.on("error", reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * deleteInvoicePDF
   *
   * - Cleans up invoice PDF files
   */
  async deleteInvoicePDF(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
