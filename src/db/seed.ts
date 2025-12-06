import { db } from "./connection";
import { organizations } from "./schema/organizations";

async function main() {
  console.log("Seeding database...");

  const existingOrgs = await db.select().from(organizations).limit(1);

  if (existingOrgs.length === 0) {
    await db.insert(organizations).values({
      name: "Default Law Firm",
      licenseNumber: "LCMS-DEFAULT",
      contactInfo: "default@example.com",
    });

    console.log('Created default organization: "Default Law Firm"');
  } else {
    console.log("Organizations already exist, skipping organization seed.");
  }

  console.log("Seeding completed.");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
