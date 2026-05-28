import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const categories: Prisma.CategoryCreateInput[] = [
  { name: 'Telegram', slug: 'telegram', description: 'Каналы, боты, оформление', icon: 'MessageCircle', gigCount: 0 },
  { name: 'TikTok', slug: 'tiktok', description: 'Монтаж, сценарии, продвижение', icon: 'Video', gigCount: 0 },
  { name: 'Design', slug: 'design', description: 'Логотипы, баннеры, брендинг', icon: 'Palette', gigCount: 0 },
  { name: 'Development', slug: 'development', description: 'Сайты, приложения, автоматизация', icon: 'Code', gigCount: 0 },
  { name: 'AI Services', slug: 'ai-services', description: 'Чат-боты, автоматизация с ИИ, генерация контента', icon: 'Bot', gigCount: 0 },
  { name: 'Marketing', slug: 'marketing', description: 'SMM, таргет, копирайтинг', icon: 'TrendingUp', gigCount: 0 },
  { name: 'Translation', slug: 'translation', description: 'Переводы туркменский/русский/английский', icon: 'Languages', gigCount: 0 },
];

async function main() {
  console.log('Start seeding ...');
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  // Seed default admin user (optional, for development)
  const adminUsername = 'admin';
  const existingAdmin = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existingAdmin) {
    const admin = await prisma.user.create({
      data: {
        username: adminUsername,
        displayName: 'Platform Admin',
        role: 'admin',
        email: 'admin@freelancetm.io',
        isVerified: true,
        onboardingCompleted: true,
        kycStatus: 'approved',
      },
    });
    console.log(`Created admin user id=${admin.id}`);
  }

  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
