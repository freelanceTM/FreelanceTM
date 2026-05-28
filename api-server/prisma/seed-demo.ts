import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ── Configuration ─────────────────────────────────────────────────────────
const USERS_COUNT = 25;        // demo freelancers + clients
const GIGS_PER_USER = 3;     // gigs per freelancer
const TENDERS_COUNT = 10;      // demo tenders
const PORTFOLIO_ITEMS = 15;    // demo portfolio

const CATEGORIES = [
  'Telegram', 'TikTok', 'Design', 'Development', 'AI Services',
  'Marketing', 'Translation', 'Video Editing', 'Logo Design',
  'Copywriting', 'SEO', 'Data Entry', 'Mobile Apps', 'WordPress',
];

const SKILLS_POOL = [
  'Python', 'JavaScript', 'React', 'Node.js', 'Telegram Bot API',
  'Figma', 'Adobe Photoshop', 'Premiere Pro', 'After Effects',
  'TikTok Editing', 'SMM', 'Google Ads', 'SEO', 'Copywriting',
  'Turkmen', 'Russian', 'English', 'Translation', 'UI/UX',
  'ChatGPT', 'Midjourney', 'Stable Diffusion', 'Solidity',
  'TON Development', 'Smart Contracts', 'Video Production',
];

const AVATARS = [
  'https://i.pravatar.cc/150?img=1',
  'https://i.pravatar.cc/150?img=5',
  'https://i.pravatar.cc/150?img=8',
  'https://i.pravatar.cc/150?img=12',
  'https://i.pravatar.cc/150?img=15',
  'https://i.pravatar.cc/150?img=20',
  'https://i.pravatar.cc/150?img=25',
  'https://i.pravatar.cc/150?img=30',
  'https://i.pravatar.cc/150?img=35',
  'https://i.pravatar.cc/150?img=40',
];

function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function pickSkills(count: number): string[] {
  return shuffle(SKILLS_POOL).slice(0, count);
}

// ── Seed Categories ─────────────────────────────────────────────────────
async function seedCategories() {
  console.log('🌱 Seeding categories...');
  for (const name of CATEGORIES) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    await prisma.category.upsert({
      where: { slug },
      update: {},
      create: {
        name,
        slug,
        description: `Профессиональные услуги в категории «${name}»`,
        icon: 'Star',
        gigCount: 0,
      },
    });
  }
  console.log(`✅ ${CATEGORIES.length} categories`);
}

// ── Seed Admin ──────────────────────────────────────────────────────────
async function seedAdmin() {
  console.log('👤 Seeding admin...');
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@freelancetm.io',
      displayName: 'Platform Admin',
      role: 'admin',
      isVerified: true,
      kycStatus: 'approved',
      onboardingCompleted: true,
      country: 'TM',
      skills: ['Management', 'Platform'],
      languages: ['ru', 'en'],
      level: 'pro',
    },
  });
  console.log(`✅ Admin id=${admin.id}`);
  return admin;
}

// ── Seed Demo Users ───────────────────────────────────────────────────
async function seedUsers() {
  console.log(`👥 Seeding ${USERS_COUNT} demo users...`);
  const users = [];
  const roles: Array<'client' | 'freelancer' | 'both'> = ['client', 'freelancer', 'both', 'freelancer', 'freelancer', 'both'];

  for (let i = 1; i <= USERS_COUNT; i++) {
    const role = random(roles);
    const username = `demo_${role}_${i}`;
    const user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        username,
        email: `${username}@demo.freelancetm.io`,
        displayName: `${role === 'freelancer' ? 'Фрилансер' : role === 'client' ? 'Заказчик' : 'Универсал'} ${i}`,
        bio: `Опытный специалист с многолетним стажем. Работаю качественно и в срок.`,
        role,
        avatarUrl: random(AVATARS),
        isVerified: Math.random() > 0.5,
        kycStatus: Math.random() > 0.3 ? 'approved' : 'none',
        onboardingCompleted: true,
        country: 'TM',
        skills: pickSkills(Math.floor(Math.random() * 5) + 2),
        languages: shuffle(['ru', 'tm', 'en']).slice(0, Math.floor(Math.random() * 2) + 1),
        level: random(['new', 'rising', 'top', 'pro']),
        rating: Math.random() * 3 + 2, // 2.0 - 5.0
        completedOrders: Math.floor(Math.random() * 50),
        referralCode: `REF${i}${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      },
    });
    users.push(user);

    // Create custodial wallet for each user
    await prisma.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        address: `EQ${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
        publicKey: Buffer.from(Math.random().toString()).toString('base64'),
        version: 'v4R2',
        balanceNano: BigInt(Math.floor(Math.random() * 10_000_000_000)), // 0-10 TON
      },
    });
  }
  console.log(`✅ ${users.length} users with wallets`);
  return users;
}

// ── Seed Gigs ───────────────────────────────────────────────────────────
async function seedGigs(users: any[]) {
  console.log(`💼 Seeding gigs...`);
  const freelancers = users.filter(u => u.role === 'freelancer' || u.role === 'both');
  const categories = await prisma.category.findMany();
  let totalGigs = 0;

  const gigTitles: Record<string, string[]> = {
    'Telegram': ['Создам Telegram бот на Python', 'Оформление Telegram канала', 'Автопостинг бот', 'Telegram Mini App'],
    'TikTok': ['Монтаж TikTok видео', 'Сценарии для TikTok', 'Продвижение TikTok аккаунта', 'Вирусные ролики'],
    'Design': ['Дизайн логотипа', 'Фирменный стиль бренда', 'Дизайн презентаций', 'UI/UX дизайн приложения'],
    'Development': ['Сайт на React + Node.js', 'Telegram Mini App', 'Landing page под ключ', 'API интеграция'],
    'AI Services': ['ChatGPT бот для бизнеса', 'Генерация изображений AI', 'Автоматизация с ИИ', 'AI ассистент'],
    'Marketing': ['SMM продвижение', 'Таргетированная реклама', 'SEO оптимизация', 'Копирайтинг'],
    'Translation': ['Перевод русский↔туркменский', 'Технический перевод', 'Перевод документов', 'Локализация сайта'],
    'Video Editing': ['Видеомонтаж', 'Цветокоррекция', 'Моушн-графика', 'Рекламный ролик'],
    'Logo Design': ['Логотип за 24 часа', 'Ребрендинг логотипа', '3D логотип', 'Анимированный логотип'],
    'Copywriting': ['Продающие тексты', 'SEO-статьи', 'Посты для соцсетей', 'Email-рассылки'],
    'SEO': ['SEO аудит сайта', 'Внешняя оптимизация', 'SEO для e-commerce', 'Локальное SEO'],
    'Data Entry': ['Ввод данных в Excel', 'Парсинг сайтов', 'Обработка баз данных', 'Администрирование'],
    'Mobile Apps': ['iOS приложение', 'Android приложение', 'Flutter кроссплатформа', 'Мобильный дизайн'],
    'WordPress': ['Сайт на WordPress', 'Настройка WooCommerce', 'Оптимизация WP', 'Кастомная тема'],
  };

  for (const freelancer of freelancers) {
    const userGigs = Math.floor(Math.random() * GIGS_PER_USER) + 1;
    for (let g = 0; g < userGigs; g++) {
      const category = random(categories);
      const titles = gigTitles[category.name] || ['Профессиональная услуга', 'Качественная работа', 'Быстро и надёжно'];
      const price = Math.floor(Math.random() * 45 + 5) * 10; // 50-500 TMT

      const gig = await prisma.gig.create({
        data: {
          sellerId: freelancer.id,
          categoryId: category.id,
          title: random(titles),
          description: `Предлагаю профессиональные услуги в категории ${category.name}. Работаю качественно, соблюдаю сроки. Более ${freelancer.completedOrders} выполненных заказов.`,
          price: new Prisma.Decimal(price),
          deliveryDays: Math.floor(Math.random() * 5) + 1,
          revisions: Math.floor(Math.random() * 3) + 1,
          status: Math.random() > 0.1 ? 'active' : 'pending_review',
          tags: pickSkills(3),
          images: [],
          orderCount: Math.floor(Math.random() * 20),
          rating: freelancer.rating,
          reviewCount: Math.floor(Math.random() * 15),
          isFeatured: Math.random() > 0.85,
        },
      });

      // Create extras for some gigs
      if (Math.random() > 0.5) {
        await prisma.gigExtra.create({
          data: {
            gigId: gig.id,
            title: 'Срочное выполнение',
            description: 'Готово за 24 часа',
            price: new Prisma.Decimal(Math.floor(price * 0.5)),
            deliveryDays: 1,
            orderIndex: 0,
          },
        });
        await prisma.gigExtra.create({
          data: {
            gigId: gig.id,
            title: 'Дополнительные правки',
            description: '+5 правок сверх лимита',
            price: new Prisma.Decimal(Math.floor(price * 0.3)),
            deliveryDays: 0,
            orderIndex: 1,
          },
        });
      }

      // Create packages for some gigs
      if (Math.random() > 0.6) {
        await prisma.gigPackage.create({
          data: { gigId: gig.id, name: 'Basic', description: 'Базовый пакет', price: new Prisma.Decimal(price), deliveryDays: gig.deliveryDays, revisions: gig.revisions, includes: ['Основная работа', '1 правка'] },
        });
        await prisma.gigPackage.create({
          data: { gigId: gig.id, name: 'Standard', description: 'Стандартный пакет', price: new Prisma.Decimal(Math.floor(price * 1.5)), deliveryDays: gig.deliveryDays + 1, revisions: gig.revisions + 2, includes: ['Расширенная работа', '3 правки', 'Исходники'] },
        });
        await prisma.gigPackage.create({
          data: { gigId: gig.id, name: 'Premium', description: 'Премиум пакет', price: new Prisma.Decimal(Math.floor(price * 2.5)), deliveryDays: gig.deliveryDays + 2, revisions: gig.revisions + 5, includes: ['Полный комплекс', 'Неограниченные правки', 'Исходники', 'Бонус'] },
        });
      }

      totalGigs++;
    }
  }

  // Update category gig counts
  for (const cat of categories) {
    const count = await prisma.gig.count({ where: { categoryId: cat.id, status: 'active' } });
    await prisma.category.update({ where: { id: cat.id }, data: { gigCount: count } });
  }

  console.log(`✅ ${totalGigs} gigs with extras & packages`);
}

// ── Seed Portfolio ──────────────────────────────────────────────────────
async function seedPortfolio(users: any[]) {
  console.log(`🎨 Seeding portfolio...`);
  const freelancers = users.filter(u => u.role === 'freelancer' || u.role === 'both');
  const categories = await prisma.category.findMany();

  for (let i = 0; i < PORTFOLIO_ITEMS; i++) {
    const user = random(freelancers);
    const category = random(categories);
    await prisma.portfolioItem.create({
      data: {
        userId: user.id,
        title: `Проект ${i + 1} — ${category.name}`,
        description: 'Качественно выполненный проект для клиента. Все требования соблюдены, сроки выдержаны.',
        imageUrls: [`https://placehold.co/600x400?text=${encodeURIComponent(category.name)}`],
        categoryId: category.id,
        tags: [category.name, 'portfolio', 'work'],
        isFeatured: Math.random() > 0.7,
      },
    });
  }
  console.log(`✅ ${PORTFOLIO_ITEMS} portfolio items`);
}

// ── Seed Tenders ────────────────────────────────────────────────────────
async function seedTenders(users: any[]) {
  console.log(`📋 Seeding tenders...`);
  const clients = users.filter(u => u.role === 'client' || u.role === 'both');
  const categories = await prisma.category.findMany();

  const tenderTitles = [
    'Нужен логотип для нового бренда',
    'Создать Telegram бот для записи клиентов',
    'Монтаж 10 TikTok роликов',
    'Разработка Landing Page',
    'SMM-ведение Instagram + TikTok',
    'Перевод технической документации',
    'SEO-оптимизация существующего сайта',
    'Создать мобильное приложение для доставки',
    'Дизайн упаковки продукта',
    'Настройка рекламы в Google Ads',
  ];

  for (let i = 0; i < TENDERS_COUNT; i++) {
    const author = random(clients);
    const category = random(categories);
    const budget = Math.floor(Math.random() * 40 + 10) * 10;

    const tender = await prisma.tender.create({
      data: {
        authorId: author.id,
        categoryId: category.id,
        title: tenderTitles[i % tenderTitles.length],
        description: `Ищу опытного специалиста в категории ${category.name}. Бюджет обсуждаем, важно качество и соблюдение сроков.`,
        budgetMin: new Prisma.Decimal(budget * 0.7),
        budgetMax: new Prisma.Decimal(budget * 1.3),
        deadlineDays: Math.floor(Math.random() * 10) + 3,
        skills: pickSkills(3),
        status: 'open',
      },
    });

    // Add some bids
    const bidders = shuffle(freelancers).slice(0, Math.floor(Math.random() * 3) + 1);
    for (const bidder of bidders) {
      await prisma.tenderBid.create({
        data: {
          tenderId: tender.id,
          freelancerId: bidder.id,
          price: new Prisma.Decimal(budget * (0.8 + Math.random() * 0.4)),
          message: 'Готов приступить сегодня. Большой опыт в данной сфере.',
          deliveryDays: Math.floor(Math.random() * 7) + 2,
        },
      });
    }
  }
  console.log(`✅ ${TENDERS_COUNT} tenders with bids`);
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting demo seed...\n');

  await seedCategories();
  await seedAdmin();
  const users = await seedUsers();
  await seedGigs(users);
  await seedPortfolio(users);
  await seedTenders(users);

  console.log('\n🎉 Demo seed completed successfully!');
  console.log('   Platform is ready for beta testing.');
  console.log('   Admin: username=admin, role=admin');
  console.log('   Users: demo_client_*, demo_freelancer_*, demo_both_*');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
