import { db } from "./connection";
import { organizations } from "./schema/organizations";
import { users } from "./schema/users";
import { clients } from "./schema/clients";
import { cases } from "./schema/cases";
import { regulations } from "./schema/regulations";
import { regulationVersions } from "./schema/regulation-versions";
import { caseRegulationLinks } from "./schema/case-regulation-links";
import { documents } from "./schema/documents";
import { notifications } from "./schema/notifications";
import { sql } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;
const FORCE_MODE = process.argv.includes("--force");

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function clearDatabase() {
  console.log("🗑️  Clearing existing data...");
  // Delete in order respecting foreign keys
  await db.delete(notifications);
  await db.delete(documents);
  await db.delete(caseRegulationLinks);
  await db.delete(regulationVersions);
  await db.delete(regulations);
  await db.delete(cases);
  await db.delete(clients);
  await db.delete(users);
  await db.delete(organizations);

  // Reset sequences
  await db.execute(sql`ALTER SEQUENCE organizations_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE clients_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE cases_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE regulations_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE regulation_versions_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE case_regulation_links_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE documents_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE notifications_id_seq RESTART WITH 1`);
  console.log("   ✓ Database cleared\n");
}

async function main() {
  console.log("🌱 Seeding database...\n");

  // Helper to check if data exists
  const existingOrgs = await db.select().from(organizations).limit(1);
  if (existingOrgs.length > 0) {
    if (FORCE_MODE) {
      await clearDatabase();
    } else {
      console.log("⚠️  Data already exists. To re-seed, use --force flag:");
      console.log("   npm run db:seed -- --force");
      return;
    }
  }

  // ==========================================
  // 1. ORGANIZATIONS
  // ==========================================
  console.log("📁 Seeding organizations...");
  const [insertedOrg] = await db.insert(organizations).values({
    name: "Al-Rashid Law Firm",
    licenseNumber: "LCMS-2024-001",
    contactInfo: "info@alrashid-law.sa | +966 11 234 5678 | King Fahd Road, Riyadh, Saudi Arabia",
  }).returning();

  const orgId = insertedOrg.id;
  console.log(`   ✓ Created organization: "${insertedOrg.name}" (ID: ${orgId})`);

  // ==========================================
  // 2. USERS
  // ==========================================
  console.log("👥 Seeding users...");
  const defaultPassword = await hashPassword("password123");

  const usersData = [
    {
      organizationId: orgId,
      email: "ahmed@alrashid-law.sa",
      passwordHash: defaultPassword,
      fullName: "Ahmed Al-Rashid",
      role: "admin" as const,
    },
    {
      organizationId: orgId,
      email: "fatima@alrashid-law.sa",
      passwordHash: defaultPassword,
      fullName: "Fatima Al-Zahrani",
      role: "senior_lawyer" as const,
    },
    {
      organizationId: orgId,
      email: "omar@alrashid-law.sa",
      passwordHash: defaultPassword,
      fullName: "Omar Hassan",
      role: "lawyer" as const,
    },
    {
      organizationId: orgId,
      email: "sara@alrashid-law.sa",
      passwordHash: defaultPassword,
      fullName: "Sara Al-Otaibi",
      role: "paralegal" as const,
    },
    {
      organizationId: orgId,
      email: "khalid@alrashid-law.sa",
      passwordHash: defaultPassword,
      fullName: "Khalid Al-Mutairi",
      role: "clerk" as const,
    },
  ];

  const insertedUsers = await db.insert(users).values(usersData).returning();
  console.log(`   ✓ Created ${insertedUsers.length} users:`);
  insertedUsers.forEach((u) => console.log(`     - ${u.fullName} (${u.role})`));

  // Map users by role for later use
  const userMap = {
    admin: insertedUsers.find((u) => u.role === "admin")!,
    seniorLawyer: insertedUsers.find((u) => u.role === "senior_lawyer")!,
    lawyer: insertedUsers.find((u) => u.role === "lawyer")!,
    paralegal: insertedUsers.find((u) => u.role === "paralegal")!,
    clerk: insertedUsers.find((u) => u.role === "clerk")!,
  };

  // ==========================================
  // 3. CLIENTS
  // ==========================================
  console.log("🏢 Seeding clients...");
  const clientsData = [
    {
      organizationId: orgId,
      name: "TechSolutions Ltd",
      type: "corporate" as const,
      email: "legal@techsolutions.sa",
      phone: "+966 11 987 6543",
      address: "Olaya District, Riyadh",
      notes: "Major technology company, ongoing retainer agreement.",
      status: "active" as const,
    },
    {
      organizationId: orgId,
      name: "Mohammed Al-Amoudi",
      type: "individual" as const,
      email: "m.alamoudi@email.com",
      phone: "+966 55 111 2222",
      address: "Jeddah, Saudi Arabia",
      notes: "Labor dispute client, referred by TechSolutions.",
      status: "active" as const,
    },
    {
      organizationId: orgId,
      name: "Al-Rahman Family Estate",
      type: "individual" as const,
      email: "alrahman.estate@email.com",
      phone: "+966 55 333 4444",
      address: "Dammam, Saudi Arabia",
      notes: "Inheritance dispute case, multiple beneficiaries.",
      status: "active" as const,
    },
    {
      organizationId: orgId,
      name: "Gulf Construction Co.",
      type: "corporate" as const,
      email: "legal@gulfconstruction.sa",
      phone: "+966 11 555 6666",
      address: "King Abdullah Road, Riyadh",
      notes: "Construction company, liability and contract matters.",
      status: "active" as const,
    },
    {
      organizationId: orgId,
      name: "Nasser Al-Dosari",
      type: "individual" as const,
      email: "n.aldosari@email.com",
      phone: "+966 55 777 8888",
      address: "Khobar, Saudi Arabia",
      notes: "Employment termination dispute.",
      status: "active" as const,
    },
  ];

  const insertedClients = await db.insert(clients).values(clientsData).returning();
  console.log(`   ✓ Created ${insertedClients.length} clients`);

  // ==========================================
  // 4. CASES
  // ==========================================
  console.log("📋 Seeding cases...");
  const casesData = [
    {
      organizationId: orgId,
      caseNumber: "C-2024-001",
      title: "Al-Amoudi vs. TechSolutions Ltd",
      description: "Labor dispute regarding wrongful termination and unpaid compensation.",
      caseType: "labor" as const,
      status: "open" as const,
      clientInfo: "Mohammed Al-Amoudi",
      assignedLawyerId: userMap.seniorLawyer.id,
      courtJurisdiction: "Riyadh Labor Court",
      filingDate: "2024-12-01",
      nextHearing: new Date("2025-01-20T09:00:00Z"),
    },
    {
      organizationId: orgId,
      caseNumber: "C-2024-002",
      title: "Estate of Sheikh H. Al-Rahman",
      description: "Inheritance dispute involving real estate and financial assets.",
      caseType: "civil" as const,
      status: "in_progress" as const,
      clientInfo: "Al-Rahman Family Estate",
      assignedLawyerId: userMap.admin.id,
      courtJurisdiction: "Dammam Civil Court",
      filingDate: "2024-11-15",
      nextHearing: new Date("2025-02-10T10:00:00Z"),
    },
    {
      organizationId: orgId,
      caseNumber: "C-2024-003",
      title: "Construction Liability Case",
      description: "Contract dispute and construction defects liability claim.",
      caseType: "commercial" as const,
      status: "pending_hearing" as const,
      clientInfo: "Gulf Construction Co.",
      assignedLawyerId: userMap.lawyer.id,
      courtJurisdiction: "Riyadh Commercial Court",
      filingDate: "2024-10-20",
      nextHearing: new Date("2025-01-15T11:00:00Z"),
    },
    {
      organizationId: orgId,
      caseNumber: "C-2024-004",
      title: "Al-Dosari Employment Termination",
      description: "Dispute over employment contract termination and severance pay.",
      caseType: "labor" as const,
      status: "open" as const,
      clientInfo: "Nasser Al-Dosari",
      assignedLawyerId: userMap.seniorLawyer.id,
      courtJurisdiction: "Dammam Labor Court",
      filingDate: "2024-12-10",
      nextHearing: new Date("2025-02-01T09:30:00Z"),
    },
    {
      organizationId: orgId,
      caseNumber: "C-2023-015",
      title: "TechSolutions IP Dispute",
      description: "Intellectual property dispute with former partner.",
      caseType: "commercial" as const,
      status: "closed" as const,
      clientInfo: "TechSolutions Ltd",
      assignedLawyerId: userMap.admin.id,
      courtJurisdiction: "Riyadh Commercial Court",
      filingDate: "2023-06-01",
      nextHearing: null,
    },
  ];

  const insertedCases = await db.insert(cases).values(casesData).returning();
  console.log(`   ✓ Created ${insertedCases.length} cases`);

  // Map cases for linking
  const caseMap = {
    amoudi: insertedCases[0],
    alrahman: insertedCases[1],
    construction: insertedCases[2],
    dosari: insertedCases[3],
    techIP: insertedCases[4],
  };

  // ==========================================
  // 5. REGULATIONS
  // ==========================================
  console.log("📜 Seeding regulations...");
  const regulationsData = [
    {
      title: "Saudi Labor Law",
      regulationNumber: "M/51",
      category: "labor_law" as const,
      jurisdiction: "Kingdom of Saudi Arabia",
      status: "active" as const,
      sourceUrl: "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/labor",
      effectiveDate: "2005-09-27",
    },
    {
      title: "Commercial Court Law",
      regulationNumber: "M/93",
      category: "commercial_law" as const,
      jurisdiction: "Kingdom of Saudi Arabia",
      status: "active" as const,
      sourceUrl: "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/commercial",
      effectiveDate: "2017-09-01",
    },
    {
      title: "Civil Transactions Law",
      regulationNumber: "M/191",
      category: "civil_law" as const,
      jurisdiction: "Kingdom of Saudi Arabia",
      status: "active" as const,
      sourceUrl: null,
      effectiveDate: "2023-12-16",
    },
    {
      title: "Personal Status Law",
      regulationNumber: "M/73",
      category: "civil_law" as const,
      jurisdiction: "Kingdom of Saudi Arabia",
      status: "active" as const,
      sourceUrl: null,
      effectiveDate: "2022-03-08",
    },
    {
      title: "Construction Contract Regulations",
      regulationNumber: "CC/2020",
      category: "commercial_law" as const,
      jurisdiction: "Kingdom of Saudi Arabia",
      status: "active" as const,
      sourceUrl: null,
      effectiveDate: "2020-01-01",
    },
    {
      title: "Labor Law Article 77 (Amendment)",
      regulationNumber: "M/51-A77",
      category: "labor_law" as const,
      jurisdiction: "Kingdom of Saudi Arabia",
      status: "amended" as const,
      sourceUrl: null,
      effectiveDate: "2024-11-15",
    },
  ];

  const insertedRegs = await db.insert(regulations).values(regulationsData).returning();
  console.log(`   ✓ Created ${insertedRegs.length} regulations`);

  // Map regulations for linking
  const regMap = {
    laborLaw: insertedRegs[0],
    commercialCourt: insertedRegs[1],
    civilTransactions: insertedRegs[2],
    personalStatus: insertedRegs[3],
    constructionContract: insertedRegs[4],
    laborArt77: insertedRegs[5],
  };

  // ==========================================
  // 6. REGULATION VERSIONS
  // ==========================================
  console.log("📝 Seeding regulation versions...");
  const versionsData = [
    {
      regulationId: regMap.laborLaw.id,
      versionNumber: 1,
      content: "Original Saudi Labor Law establishing worker rights and employer obligations. This law covers employment contracts, wages, work hours, vacations, end-of-service benefits, and dispute resolution procedures.",
      contentHash: "abc123def456",
      createdBy: "system" as const,
    },
    {
      regulationId: regMap.laborArt77.id,
      versionNumber: 1,
      content: "Amendment to Article 77 regarding compensation calculation for arbitrary dismissal. New formula for calculating end-of-service benefits based on years of service and last salary.",
      contentHash: "def456ghi789",
      createdBy: "system" as const,
    },
  ];

  const insertedVersions = await db.insert(regulationVersions).values(versionsData).returning();
  console.log(`   ✓ Created ${insertedVersions.length} regulation versions`);

  // ==========================================
  // 7. CASE-REGULATION LINKS
  // ==========================================
  console.log("🔗 Seeding case-regulation links...");
  const linksData = [
    {
      caseId: caseMap.amoudi.id,
      regulationId: regMap.laborLaw.id,
      similarityScore: "0.9200",
      method: "ai" as const,
      verified: true,
      verifiedBy: userMap.seniorLawyer.id,
      verifiedAt: new Date("2024-12-05T00:00:00Z"),
    },
    {
      caseId: caseMap.amoudi.id,
      regulationId: regMap.laborArt77.id,
      similarityScore: "0.8800",
      method: "ai" as const,
      verified: false,
      verifiedBy: null,
      verifiedAt: null,
    },
    {
      caseId: caseMap.alrahman.id,
      regulationId: regMap.civilTransactions.id,
      similarityScore: "0.9500",
      method: "manual" as const,
      verified: true,
      verifiedBy: userMap.admin.id,
      verifiedAt: new Date("2024-11-20T00:00:00Z"),
    },
    {
      caseId: caseMap.construction.id,
      regulationId: regMap.commercialCourt.id,
      similarityScore: "0.8500",
      method: "ai" as const,
      verified: true,
      verifiedBy: userMap.lawyer.id,
      verifiedAt: new Date("2024-10-25T00:00:00Z"),
    },
    {
      caseId: caseMap.construction.id,
      regulationId: regMap.constructionContract.id,
      similarityScore: "0.9100",
      method: "ai" as const,
      verified: true,
      verifiedBy: userMap.lawyer.id,
      verifiedAt: new Date("2024-10-28T00:00:00Z"),
    },
  ];

  const insertedLinks = await db.insert(caseRegulationLinks).values(linksData).returning();
  console.log(`   ✓ Created ${insertedLinks.length} case-regulation links`);

  // ==========================================
  // 8. DOCUMENTS
  // ==========================================
  console.log("📄 Seeding documents...");
  const docsData = [
    {
      caseId: caseMap.amoudi.id,
      fileName: "employment_contract.pdf",
      originalName: "Employment Contract - Al-Amoudi.pdf",
      filePath: "/uploads/cases/1/employment_contract.pdf",
      fileSize: 245760,
      mimeType: "application/pdf",
      uploadedBy: userMap.seniorLawyer.id,
    },
    {
      caseId: caseMap.amoudi.id,
      fileName: "termination_letter.pdf",
      originalName: "Termination Letter.pdf",
      filePath: "/uploads/cases/1/termination_letter.pdf",
      fileSize: 102400,
      mimeType: "application/pdf",
      uploadedBy: userMap.seniorLawyer.id,
    },
    {
      caseId: caseMap.alrahman.id,
      fileName: "estate_inventory.docx",
      originalName: "Estate Inventory Report.docx",
      filePath: "/uploads/cases/2/estate_inventory.docx",
      fileSize: 512000,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      uploadedBy: userMap.admin.id,
    },
    {
      caseId: caseMap.construction.id,
      fileName: "construction_contract.pdf",
      originalName: "Main Construction Contract.pdf",
      filePath: "/uploads/cases/3/construction_contract.pdf",
      fileSize: 1048576,
      mimeType: "application/pdf",
      uploadedBy: userMap.lawyer.id,
    },
  ];

  const insertedDocs = await db.insert(documents).values(docsData).returning();
  console.log(`   ✓ Created ${insertedDocs.length} documents`);

  // ==========================================
  // 9. NOTIFICATIONS
  // ==========================================
  console.log("🔔 Seeding notifications...");
  const notificationsData = [
    {
      userId: userMap.admin.id,
      organizationId: orgId,
      type: "regulation_update" as const,
      title: "New Amendment to Labor Law",
      message: "Article 77 has been revised regarding compensation calculation for arbitrary dismissal.",
      relatedRegulationId: regMap.laborArt77.id,
      read: false,
    },
    {
      userId: userMap.admin.id,
      organizationId: orgId,
      type: "ai_suggestion" as const,
      title: "New Regulation Match Found",
      message: "AI discovered a relevant regulation for case C-2024-001.",
      relatedCaseId: caseMap.amoudi.id,
      relatedRegulationId: regMap.laborArt77.id,
      read: false,
    },
    {
      userId: userMap.seniorLawyer.id,
      organizationId: orgId,
      type: "case_update" as const,
      title: "Hearing Scheduled",
      message: "Next hearing for Al-Amoudi case scheduled for Jan 20, 2025.",
      relatedCaseId: caseMap.amoudi.id,
      read: true,
    },
    {
      userId: userMap.admin.id,
      organizationId: orgId,
      type: "system" as const,
      title: "MoJ System Maintenance",
      message: "Scheduled for Friday 2:00 AM. Some services may be unavailable.",
      read: false,
    },
    {
      userId: userMap.lawyer.id,
      organizationId: orgId,
      type: "case_update" as const,
      title: "New Document Added",
      message: "Construction contract uploaded to case C-2024-003.",
      relatedCaseId: caseMap.construction.id,
      read: true,
    },
  ];

  const insertedNotifications = await db.insert(notifications).values(notificationsData).returning();
  console.log(`   ✓ Created ${insertedNotifications.length} notifications`);

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log("\n✅ Seeding completed successfully!\n");
  console.log("Summary:");
  console.log("┌────────────────────────┬───────┐");
  console.log("│ Entity                 │ Count │");
  console.log("├────────────────────────┼───────┤");
  console.log(`│ Organizations          │     1 │`);
  console.log(`│ Users                  │     ${insertedUsers.length} │`);
  console.log(`│ Clients                │     ${insertedClients.length} │`);
  console.log(`│ Cases                  │     ${insertedCases.length} │`);
  console.log(`│ Regulations            │     ${insertedRegs.length} │`);
  console.log(`│ Regulation Versions    │     ${insertedVersions.length} │`);
  console.log(`│ Case-Regulation Links  │     ${insertedLinks.length} │`);
  console.log(`│ Documents              │     ${insertedDocs.length} │`);
  console.log(`│ Notifications          │     ${insertedNotifications.length} │`);
  console.log("└────────────────────────┴───────┘");
  console.log("\n📧 Login credentials:");
  console.log("   All users have password: password123");
  console.log("   Admin: ahmed@alrashid-law.sa");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  });
