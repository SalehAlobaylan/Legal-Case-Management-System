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
import { userActivities } from "./schema/user-activities";
import { userAchievements } from "./schema/user-achievements";
import { sql } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;
const FORCE_MODE = process.argv.includes("--force");

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function clearDatabase() {
  console.log("🗑️  Clearing existing data...");
  await db.delete(notifications);
  await db.delete(documents);
  await db.delete(caseRegulationLinks);
  await db.delete(regulationVersions);
  await db.delete(regulations);
  await db.delete(cases);
  await db.delete(clients);
  await db.delete(userAchievements);
  await db.delete(userActivities);
  await db.delete(users);
  await db.delete(organizations);

  await db.execute(sql`ALTER SEQUENCE organizations_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE clients_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE cases_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE regulations_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE regulation_versions_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE case_regulation_links_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE documents_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE notifications_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE user_activities_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE user_achievements_id_seq RESTART WITH 1`);
  console.log("   ✓ Database cleared\n");
}

async function main() {
  console.log("🌱 Seeding database...\n");

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
    name: "Al-Faisal Law Firm",
    licenseNumber: "LCMS-2024-001",
    contactInfo: "info@alfaisal-law.sa | +966 11 234 5678 | King Fahd Road, Riyadh, Saudi Arabia",
  }).returning();

  const orgId = insertedOrg.id;
  console.log(`   ✓ Created organization: "${insertedOrg.name}" (ID: ${orgId})`);

  const [insertedOrg2] = await db.insert(organizations).values({
    name: "Riyadh Legal Consultants",
    licenseNumber: "LCMS-2024-002",
    contactInfo: "info@riyadhlegal.sa | +966 50 123 4567 | Olaya St, Riyadh, Saudi Arabia",
  }).returning();

  const orgId2 = insertedOrg2.id;
  console.log(`   ✓ Created organization: "${insertedOrg2.name}" (ID: ${orgId2})`);

  // ==========================================
  // 2. USERS
  // ==========================================
  console.log("👥 Seeding users...");

  const simplePassword = await hashPassword("test123");
  const defaultPassword = await hashPassword("password123");

  const usersData = [
    {
      organizationId: orgId,
      email: "ahmed@alfaisal-law.sa",
      passwordHash: defaultPassword,
      fullName: "Ahmed Al-Faisal",
      role: "admin" as const,
      phone: "+966 50 111 2233",
      location: "Riyadh, Saudi Arabia",
      bio: "Senior attorney with 15+ years of experience in commercial litigation and corporate law. Founding partner at Al-Faisal Law Firm.",
      specialization: "Corporate Law",
    },
    {
      organizationId: orgId,
      email: "fatima@alfaisal-law.sa",
      passwordHash: defaultPassword,
      fullName: "Fatima Al-Zahrani",
      role: "senior_lawyer" as const,
      phone: "+966 50 444 5566",
      location: "Riyadh, Saudi Arabia",
      bio: "Specialized in labor law and employment disputes. Successfully handled over 200 labor cases.",
      specialization: "Labor Law",
    },
    {
      organizationId: orgId,
      email: "omar@alfaisal-law.sa",
      passwordHash: defaultPassword,
      fullName: "Omar Hassan",
      role: "lawyer" as const,
      phone: "+966 50 777 8899",
      location: "Riyadh, Saudi Arabia",
      bio: "Commercial litigation attorney focusing on contract disputes and construction law.",
      specialization: "Commercial Law",
    },
    {
      organizationId: orgId,
      email: "sara@alfaisal-law.sa",
      passwordHash: defaultPassword,
      fullName: "Sara Al-Otaibi",
      role: "paralegal" as const,
      phone: "+966 50 222 3344",
      location: "Riyadh, Saudi Arabia",
      bio: "Experienced paralegal specializing in legal research and document preparation.",
      specialization: "Legal Research",
    },
    {
      organizationId: orgId,
      email: "khalid@alfaisal-law.sa",
      passwordHash: defaultPassword,
      fullName: "Khalid Al-Mutairi",
      role: "clerk" as const,
      phone: "+966 50 666 7788",
      location: "Riyadh, Saudi Arabia",
      bio: "Court clerk with expertise in case management and filing procedures.",
      specialization: "Case Management",
    },
    {
      organizationId: orgId2,
      email: "admin@test.com",
      passwordHash: simplePassword,
      fullName: "Test Admin",
      role: "admin" as const,
      phone: "+966 50 000 1111",
      location: "Riyadh, Saudi Arabia",
      bio: "Test administrator account",
      specialization: "General Practice",
    },
    {
      organizationId: orgId2,
      email: "lawyer@test.com",
      passwordHash: simplePassword,
      fullName: "Test Lawyer",
      role: "lawyer" as const,
      phone: "+966 50 000 2222",
      location: "Riyadh, Saudi Arabia",
      bio: "Test lawyer account",
      specialization: "Commercial Law",
    },
    {
      organizationId: orgId2,
      email: "sara@test.com",
      passwordHash: simplePassword,
      fullName: "Test Paralegal",
      role: "paralegal" as const,
      phone: "+966 50 000 3333",
      location: "Riyadh, Saudi Arabia",
      bio: "Test paralegal account",
      specialization: "Legal Research",
    },
  ];

  const insertedUsers = await db.insert(users).values(usersData).returning();
  console.log(`   ✓ Created ${insertedUsers.length} users`);
  insertedUsers.forEach((u) => console.log(`     - ${u.fullName} (${u.role})`));

  const userMap = {
    admin: insertedUsers.find((u) => u.role === "admin" && u.organizationId === orgId)!,
    seniorLawyer: insertedUsers.find((u) => u.role === "senior_lawyer")!,
    lawyer: insertedUsers.find((u) => u.role === "lawyer" && u.organizationId === orgId)!,
    paralegal: insertedUsers.find((u) => u.role === "paralegal" && u.organizationId === orgId)!,
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
      name: "Al-Fahman Family Estate",
      type: "individual" as const,
      email: "alfahman.estate@email.com",
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
    {
      organizationId: orgId,
      name: "AlRajhi Holding",
      type: "corporate" as const,
      email: "legal@alrajhi-holding.sa",
      phone: "+966 11 888 9999",
      address: "King Financial District, Riyadh",
      notes: "Major investment holding company.",
      status: "active" as const,
    },
  ];

  const insertedClients = await db.insert(clients).values(clientsData).returning();
  console.log(`   ✓ Created ${insertedClients.length} clients`);

  const clientMap = {
    techSolutions: insertedClients[0],
    alAmoudi: insertedClients[1],
    alFahman: insertedClients[2],
    gulfConstruction: insertedClients[3],
    alDosari: insertedClients[4],
    alRajhi: insertedClients[5],
  };

  // ==========================================
  // 4. CASES
  // ==========================================
  console.log("📋 Seeding cases...");

  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const casesData = [
    // Open cases
    {
      organizationId: orgId,
      caseNumber: "C-2025-001",
      title: "Al-Amoudi vs. TechSolutions Ltd",
      description: "Labor dispute regarding wrongful termination and unpaid compensation.",
      caseType: "labor" as const,
      status: "open" as const,
      clientInfo: "Mohammed Al-Amoudi",
      assignedLawyerId: userMap.seniorLawyer.id,
      courtJurisdiction: "Riyadh Labor Court",
      filingDate: threeDaysAgo.toISOString().split("T")[0],
      nextHearing: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    },
    {
      organizationId: orgId,
      caseNumber: "C-2025-002",
      title: "AlRajhi Contract Dispute",
      description: "Contract breach claim regarding software development agreement.",
      caseType: "commercial" as const,
      status: "open" as const,
      clientInfo: "AlRajhi Holding",
      assignedLawyerId: userMap.admin.id,
      courtJurisdiction: "Riyadh Commercial Court",
      filingDate: oneWeekAgo.toISOString().split("T")[0],
      nextHearing: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000),
    },
    // In Progress cases
    {
      organizationId: orgId,
      caseNumber: "C-2024-045",
      title: "Estate of Sheikh H. Al-Fahman",
      description: "Inheritance dispute involving real estate and financial assets.",
      caseType: "civil" as const,
      status: "in_progress" as const,
      clientInfo: "Al-Fahman Family Estate",
      assignedLawyerId: userMap.admin.id,
      courtJurisdiction: "Dammam Civil Court",
      filingDate: twoWeeksAgo.toISOString().split("T")[0],
      nextHearing: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
    },
    {
      organizationId: orgId,
      caseNumber: "C-2024-044",
      title: "TechSolutions Shareholder Agreement",
      description: "Dispute over shareholder rights and equity distribution.",
      caseType: "commercial" as const,
      status: "in_progress" as const,
      clientInfo: "TechSolutions Ltd",
      assignedLawyerId: userMap.lawyer.id,
      courtJurisdiction: "Riyadh Commercial Court",
      filingDate: oneMonthAgo.toISOString().split("T")[0],
      nextHearing: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
    // Pending Hearing cases
    {
      organizationId: orgId,
      caseNumber: "C-2024-043",
      title: "Construction Liability Case",
      description: "Contract dispute and construction defects liability claim.",
      caseType: "commercial" as const,
      status: "pending_hearing" as const,
      clientInfo: "Gulf Construction Co.",
      assignedLawyerId: userMap.lawyer.id,
      courtJurisdiction: "Riyadh Commercial Court",
      filingDate: twoMonthsAgo.toISOString().split("T")[0],
      nextHearing: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
    },
    {
      organizationId: orgId,
      caseNumber: "C-2024-042",
      title: "Al-Dosari Employment Termination",
      description: "Dispute over employment contract termination and severance pay.",
      caseType: "labor" as const,
      status: "pending_hearing" as const,
      clientInfo: "Nasser Al-Dosari",
      assignedLawyerId: userMap.seniorLawyer.id,
      courtJurisdiction: "Dammam Labor Court",
      filingDate: threeMonthsAgo.toISOString().split("T")[0],
      nextHearing: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
    },
    // Closed cases (for win rate calculation)
    {
      organizationId: orgId,
      caseNumber: "C-2024-030",
      title: "TechSolutions IP Dispute",
      description: "Intellectual property dispute with former partner.",
      caseType: "commercial" as const,
      status: "closed" as const,
      clientInfo: "TechSolutions Ltd",
      assignedLawyerId: userMap.admin.id,
      courtJurisdiction: "Riyadh Commercial Court",
      filingDate: threeMonthsAgo.toISOString().split("T")[0],
    },
    {
      organizationId: orgId,
      caseNumber: "C-2024-028",
      title: "AlGosaibi Debt Collection",
      description: "Commercial debt collection for unpaid invoices.",
      caseType: "commercial" as const,
      status: "closed" as const,
      clientInfo: "TechSolutions Ltd",
      assignedLawyerId: userMap.lawyer.id,
      courtJurisdiction: "Riyadh Commercial Court",
      filingDate: twoMonthsAgo.toISOString().split("T")[0],
    },
    {
      organizationId: orgId,
      caseNumber: "C-2024-025",
      title: "Al-Yami Labor Case",
      description: "Wrongful termination claim settled in favor of client.",
      caseType: "labor" as const,
      status: "closed" as const,
      clientInfo: "Individual Client",
      assignedLawyerId: userMap.seniorLawyer.id,
      courtJurisdiction: "Riyadh Labor Court",
      filingDate: oneMonthAgo.toISOString().split("T")[0],
    },
  ];

  const insertedCases = await db.insert(cases).values(casesData).returning();
  console.log(`   ✓ Created ${insertedCases.length} cases`);

  const caseMap = {
    amoudi: insertedCases[0],
    alRajhi: insertedCases[1],
    alfahman: insertedCases[2],
    techShareholder: insertedCases[3],
    construction: insertedCases[4],
    dosari: insertedCases[5],
    techIP: insertedCases[6],
    algosaibi: insertedCases[7],
    alyami: insertedCases[8],
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
      content: "Original Saudi Labor Law establishing worker rights and employer obligations.",
      contentHash: "abc123def456",
      createdBy: "system" as const,
    },
    {
      regulationId: regMap.laborArt77.id,
      versionNumber: 1,
      content: "Amendment to Article 77 regarding compensation calculation for arbitrary dismissal.",
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
      verifiedAt: new Date(),
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
      caseId: caseMap.alfahman.id,
      regulationId: regMap.civilTransactions.id,
      similarityScore: "0.9500",
      method: "manual" as const,
      verified: true,
      verifiedBy: userMap.admin.id,
      verifiedAt: new Date(),
    },
    {
      caseId: caseMap.construction.id,
      regulationId: regMap.commercialCourt.id,
      similarityScore: "0.8500",
      method: "ai" as const,
      verified: true,
      verifiedBy: userMap.lawyer.id,
      verifiedAt: new Date(),
    },
    {
      caseId: caseMap.construction.id,
      regulationId: regMap.constructionContract.id,
      similarityScore: "0.9100",
      method: "ai" as const,
      verified: true,
      verifiedBy: userMap.lawyer.id,
      verifiedAt: new Date(),
    },
    {
      caseId: caseMap.techIP.id,
      regulationId: regMap.commercialCourt.id,
      similarityScore: "0.8900",
      method: "manual" as const,
      verified: true,
      verifiedBy: userMap.admin.id,
      verifiedAt: new Date(),
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
      caseId: caseMap.amoudi.id,
      fileName: "salary_slips.pdf",
      originalName: "Salary Slips.pdf",
      filePath: "/uploads/cases/1/salary_slips.pdf",
      fileSize: 512000,
      mimeType: "application/pdf",
      uploadedBy: userMap.paralegal.id,
    },
    {
      caseId: caseMap.alfahman.id,
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
    {
      caseId: caseMap.dosari.id,
      fileName: "employment_agreement.pdf",
      originalName: "Employment Agreement.pdf",
      filePath: "/uploads/cases/4/employment_agreement.pdf",
      fileSize: 350000,
      mimeType: "application/pdf",
      uploadedBy: userMap.seniorLawyer.id,
    },
  ];

  const insertedDocs = await db.insert(documents).values(docsData).returning();
  console.log(`   ✓ Created ${insertedDocs.length} documents`);

  // ==========================================
  // 9. USER ACTIVITIES (for profile activity log)
  // ==========================================
  console.log("📊 Seeding user activities...");

  const activitiesData = [
    // Case activities
    {
      userId: userMap.seniorLawyer.id,
      type: "case" as const,
      action: "created" as const,
      title: "New case created: Al-Amoudi vs. TechSolutions",
      referenceId: caseMap.amoudi.id,
      createdAt: threeDaysAgo,
    },
    {
      userId: userMap.seniorLawyer.id,
      type: "case" as const,
      action: "updated" as const,
      title: "Updated case status: Al-Amoudi case to Open",
      referenceId: caseMap.amoudi.id,
      createdAt: new Date(threeDaysAgo.getTime() + 2 * 60 * 60 * 1000),
    },
    {
      userId: userMap.admin.id,
      type: "case" as const,
      action: "created" as const,
      title: "New case created: AlRajhi Contract Dispute",
      referenceId: caseMap.alRajhi.id,
      createdAt: oneWeekAgo,
    },
    {
      userId: userMap.admin.id,
      type: "case" as const,
      action: "updated" as const,
      title: "Updated case details: Al-Fahman Estate",
      referenceId: caseMap.alfahman.id,
      createdAt: new Date(oneWeekAgo.getTime() + 4 * 60 * 60 * 1000),
    },
    {
      userId: userMap.lawyer.id,
      type: "case" as const,
      action: "updated" as const,
      title: "Updated case status: Construction case to Pending Hearing",
      referenceId: caseMap.construction.id,
      createdAt: twoWeeksAgo,
    },
    {
      userId: userMap.lawyer.id,
      type: "case" as const,
      action: "closed" as const,
      title: "Case closed: AlGosaibi Debt Collection",
      referenceId: caseMap.algosaibi.id,
      createdAt: twoMonthsAgo,
    },
    // Document activities
    {
      userId: userMap.seniorLawyer.id,
      type: "document" as const,
      action: "uploaded" as const,
      title: "Uploaded: Employment Contract (Al-Amoudi)",
      referenceId: insertedDocs[0].id,
      createdAt: new Date(threeDaysAgo.getTime() + 1 * 60 * 60 * 1000),
    },
    {
      userId: userMap.paralegal.id,
      type: "document" as const,
      action: "uploaded" as const,
      title: "Uploaded: Salary Slips (Al-Amoudi)",
      referenceId: insertedDocs[2].id,
      createdAt: new Date(threeDaysAgo.getTime() + 3 * 60 * 60 * 1000),
    },
    {
      userId: userMap.lawyer.id,
      type: "document" as const,
      action: "uploaded" as const,
      title: "Uploaded: Construction Contract",
      referenceId: insertedDocs[4].id,
      createdAt: twoWeeksAgo,
    },
    // Regulation activities
    {
      userId: userMap.seniorLawyer.id,
      type: "regulation" as const,
      action: "reviewed" as const,
      title: "Reviewed regulation: Saudi Labor Law (Al-Amoudi case)",
      referenceId: regMap.laborLaw.id,
      createdAt: new Date(threeDaysAgo.getTime() + 5 * 60 * 60 * 1000),
    },
    {
      userId: userMap.admin.id,
      type: "regulation" as const,
      action: "reviewed" as const,
      title: "Verified regulation match: Civil Transactions Law",
      referenceId: regMap.civilTransactions.id,
      createdAt: oneWeekAgo,
    },
    {
      userId: userMap.lawyer.id,
      type: "regulation" as const,
      action: "reviewed" as const,
      title: "Verified regulation: Commercial Court Law",
      referenceId: regMap.commercialCourt.id,
      createdAt: twoWeeksAgo,
    },
    // Client activities
    {
      userId: userMap.admin.id,
      type: "client" as const,
      action: "created" as const,
      title: "New client added: AlRajhi Holding",
      referenceId: clientMap.alRajhi.id,
      createdAt: oneWeekAgo,
    },
    {
      userId: userMap.seniorLawyer.id,
      type: "client" as const,
      action: "updated" as const,
      title: "Updated client info: Nasser Al-Dosari",
      referenceId: clientMap.alDosari.id,
      createdAt: threeMonthsAgo,
    },
    // Recent activities for today
    {
      userId: userMap.seniorLawyer.id,
      type: "case" as const,
      action: "updated" as const,
      title: "Added notes to case: Al-Amoudi vs TechSolutions",
      referenceId: caseMap.amoudi.id,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    },
    {
      userId: userMap.admin.id,
      type: "document" as const,
      action: "uploaded" as const,
      title: "Uploaded: Settlement Agreement (Al-Fahman)",
      referenceId: insertedDocs[3].id,
      createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
    },
    {
      userId: userMap.lawyer.id,
      type: "regulation" as const,
      action: "reviewed" as const,
      title: "Reviewed: Construction Contract Regulations",
      referenceId: regMap.constructionContract.id,
      createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
    },
    {
      userId: userMap.paralegal.id,
      type: "case" as const,
      action: "updated" as const,
      title: "Prepared case documents: Al-Dosari Employment",
      referenceId: caseMap.dosari.id,
      createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
    },
  ];

  const insertedActivities = await db.insert(userActivities).values(activitiesData).returning();
  console.log(`   ✓ Created ${insertedActivities.length} user activities`);

  // ==========================================
  // 10. USER ACHIEVEMENTS
  // ==========================================
  console.log("🏆 Seeding user achievements...");

  const achievementsData = [
    {
      userId: userMap.admin.id,
      title: "Top Performer",
      description: "Awarded for achieving highest case closure rate in Q4 2024",
      icon: "award",
      awardedAt: new Date("2024-12-15"),
    },
    {
      userId: userMap.seniorLawyer.id,
      title: "Labor Law Expert",
      description: "Successfully resolved 50+ labor disputes",
      icon: "star",
      awardedAt: new Date("2024-11-20"),
    },
    {
      userId: userMap.lawyer.id,
      title: "Rising Star",
      description: "Recognized for outstanding performance in first year",
      icon: "trending-up",
      awardedAt: new Date("2024-10-10"),
    },
    {
      userId: userMap.seniorLawyer.id,
      title: "Client Champion",
      description: "Highest client satisfaction rating for 2024",
      icon: "heart",
      awardedAt: new Date("2024-12-01"),
    },
  ];

  const insertedAchievements = await db.insert(userAchievements).values(achievementsData).returning();
  console.log(`   ✓ Created ${insertedAchievements.length} user achievements`);

  // ==========================================
  // 11. NOTIFICATIONS
  // ==========================================
  console.log("🔔 Seeding notifications...");
  const notificationsData = [
    {
      userId: userMap.admin.id,
      organizationId: orgId,
      type: "regulation_update" as const,
      title: "New Amendment to Labor Law",
      message: "Article 77 has been revised regarding compensation calculation.",
      relatedRegulationId: regMap.laborArt77.id,
      read: false,
    },
    {
      userId: userMap.admin.id,
      organizationId: orgId,
      type: "ai_suggestion" as const,
      title: "New Regulation Match Found",
      message: "AI discovered a relevant regulation for case C-2025-001.",
      relatedCaseId: caseMap.amoudi.id,
      relatedRegulationId: regMap.laborArt77.id,
      read: false,
    },
    {
      userId: userMap.seniorLawyer.id,
      organizationId: orgId,
      type: "case_update" as const,
      title: "Hearing Scheduled",
      message: "Next hearing for Al-Amoudi case scheduled for next week.",
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
      message: "Construction contract uploaded to case C-2024-043.",
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
  console.log("┌──────────────────────────────┐");
  console.log("│ Entity                 │ Count │");
  console.log("├──────────────────────────────┤");
  console.log(`│ Organizations          │     2 │`);
  console.log(`│ Users                  │     ${insertedUsers.length} │`);
  console.log(`│ Clients                │     ${insertedClients.length} │`);
  console.log(`│ Cases                  │     ${insertedCases.length} │`);
  console.log(`│ Regulations            │     ${insertedRegs.length} │`);
  console.log(`│ Regulation Versions    │     ${insertedVersions.length} │`);
  console.log(`│ Case-Regulation Links  │     ${insertedLinks.length} │`);
  console.log(`│ Documents              │     ${insertedDocs.length} │`);
  console.log(`│ User Activities        │     ${insertedActivities.length} │`);
  console.log(`│ User Achievements      │     ${insertedAchievements.length} │`);
  console.log(`│ Notifications          │     ${insertedNotifications.length} │`);
  console.log("└──────────────────────────────┘");
  console.log("\n📧 Test Login Credentials:");
  console.log("════════════════════════════════════════════════════════");
  console.log("Organization 1: Al-Faisal Law Firm");
  console.log("   Admin:      ahmed@alfaisal-law.sa  /  password123");
  console.log("   Senior Law: fatima@alfaisal-law.sa / password123");
  console.log("   Lawyer:     omar@alfaisal-law.sa   / password123");
  console.log("   Paralegal:  sara@alfaisal-law.sa   / password123");
  console.log("");
  console.log("Organization 2: Riyadh Legal Consultants (EASY TO REMEMBER)");
  console.log("   Admin:      admin@test.com  / test123");
  console.log("   Lawyer:     lawyer@test.com   / test123");
  console.log("   Paralegal: sara@test.com    / test123");
  console.log("════════════════════════════════════════════════════════");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  });
