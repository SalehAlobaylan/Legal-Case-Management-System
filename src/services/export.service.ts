/*
 * ExportService
 *
 * - Handles CSV export functionality for various resources
 * - Creates temporary files for download
 * - Auto-cleanup after file streaming
 */

import { eq } from "drizzle-orm";
import { createObjectCsvWriter } from "csv-writer";
import type { Database } from "../db/connection";
import { clients, cases, organizations } from "../db/schema";
import { NotFoundError } from "../utils/errors";
import * as fs from "fs";
import * as path from "path";

export class ExportService {
  constructor(private db: Database) {}

  /**
   * exportClientsToCSV
   *
   * - Exports all clients for an organization to CSV format
   * - Includes client details + case count
   * - Returns file path for download
   */
  async exportClientsToCSV(orgId: number): Promise<string> {
    // Fetch all clients for organization with org name
    const clientsList = await this.db.query.clients.findMany({
      where: eq(clients.organizationId, orgId),
      orderBy: [clients.createdAt],
      with: {
        organization: {
          columns: {
            name: true,
          },
        },
      },
    });

    if (clientsList.length === 0) {
      throw new NotFoundError("No clients found for export");
    }

    // Enrich with case counts
    const enrichedClients = await Promise.all(
      clientsList.map(async (client) => {
        // Get all cases for organization
        const clientCases = await this.db.query.cases.findMany({
          where: eq(cases.organizationId, orgId),
        });

        // Count cases where clientInfo contains client name
        const caseCount = clientCases.filter(
          (c) => c.clientInfo && c.clientInfo.includes(client.name)
        ).length;

        return {
          id: client.id,
          name: client.name,
          type: client.type || "",
          email: client.email || "",
          phone: client.phone || "",
          address: client.address || "",
          status: client.status || "",
          notes: client.notes || "",
          casesCount: caseCount,
          organizationName: client.organization?.name || "",
          createdAt: client.createdAt.toISOString().split("T")[0],
        };
      })
    );

    // Generate CSV
    const exportDir = process.env.EXPORT_DIR || "./exports";
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const filename = `clients-export-${Date.now()}.csv`;
    const filePath = path.join(exportDir, filename);

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: "id", title: "ID" },
        { id: "name", title: "Name" },
        { id: "type", title: "Type" },
        { id: "email", title: "Email" },
        { id: "phone", title: "Phone" },
        { id: "address", title: "Address" },
        { id: "status", title: "Status" },
        { id: "notes", title: "Notes" },
        { id: "casesCount", title: "Cases Count" },
        { id: "organizationName", title: "Organization" },
        { id: "createdAt", title: "Created Date" },
      ],
    });

    await csvWriter.writeRecords(enrichedClients);

    return filePath;
  }

  /**
   * deleteExportFile
   *
   * - Cleans up export files after download
   */
  async deleteExportFile(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
