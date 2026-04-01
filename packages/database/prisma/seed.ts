import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'changeme123';
  const companyName = process.env.COMPANY_NAME ?? 'My Company';

  // ── Create company if not exists ──────────────────────────────────────────
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  let company = await prisma.company.findUnique({ where: { slug } });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: companyName,
        slug,
        email: adminEmail,
        timezone: 'UTC',
        isActive: true,
        setupDone: false,
      },
    });
    console.log(`✅ Company created: ${company.name} (${company.id})`);
  } else {
    console.log(`⏭  Company already exists: ${company.name}`);
  }

  // ── Create admin user if not exists ───────────────────────────────────────
  const existing = await prisma.user.findUnique({
    where: { companyId_email: { companyId: company.id, email: adminEmail } },
  });

  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        email: adminEmail,
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    console.log(`✅ Admin user created: ${user.email}`);
  } else {
    console.log(`⏭  Admin user already exists: ${adminEmail}`);
  }

  // ── Create default AiConfig ───────────────────────────────────────────────
  const aiConfigExists = await prisma.aiConfig.findUnique({
    where: { companyId: company.id },
  });
  if (!aiConfigExists) {
    await prisma.aiConfig.create({
      data: {
        companyId: company.id,
        autoReplyEnabled: false, // off until user configures from dashboard
        toolCallingEnabled: true,
      },
    });
    console.log('✅ Default AI config created');
  }

  // ── Create default PaymentConfig ─────────────────────────────────────────
  const payConfigExists = await prisma.paymentConfig.findUnique({
    where: { companyId: company.id },
  });
  if (!payConfigExists) {
    await prisma.paymentConfig.create({
      data: {
        companyId: company.id,
        // provider defaults to NONE until dashboard setup
      },
    });
    console.log('✅ Default payment config created');
  }

  console.log('\n🎉 Seed complete. Open the dashboard to finish setup.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
