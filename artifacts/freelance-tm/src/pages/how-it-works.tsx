import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Search, CreditCard, CheckCircle, Shield, Star, Zap,
  MessageSquare, UserCheck, ArrowRight, Clock, BadgeCheck,
} from "lucide-react";
import { Link } from "wouter";

const steps = [
  {
    icon: Search,
    num: "01",
    title: "Найдите специалиста",
    desc: "Используйте поиск и фильтры — по категории, цене, рейтингу. Читайте отзывы реальных клиентов и изучайте портфолио.",
    tip: "Совет: фрилансеры с бейджем ✓ Verified прошли ручную проверку.",
    color: "text-primary",
    bg: "bg-primary/20",
  },
  {
    icon: CreditCard,
    num: "02",
    title: "Разместите заказ",
    desc: "Нажмите «Заказать», опишите задачу подробно. Оплата замораживается в эскроу — ваши деньги защищены до принятия работы.",
    tip: "Совет: чем детальнее требования — тем лучше результат.",
    color: "text-secondary",
    bg: "bg-secondary/20",
  },
  {
    icon: MessageSquare,
    num: "03",
    title: "Общайтесь в чате",
    desc: "Продавец принимает заказ и начинает работу. Все коммуникации, уточнения и файлы — в защищённом чате заказа.",
    tip: "Совет: держите все договорённости в чате — это ваша защита.",
    color: "text-blue-400",
    bg: "bg-blue-500/20",
  },
  {
    icon: CheckCircle,
    num: "04",
    title: "Примите и оцените",
    desc: "Получите готовую работу, проверьте результат. Если нужны правки — запросите их. Подтвердите завершение — оплата выходит продавцу.",
    tip: "Совет: оставьте отзыв — это помогает сообществу.",
    color: "text-green-400",
    bg: "bg-green-500/20",
  },
];

const forBuyers = [
  { icon: Shield, title: "Защита оплаты", desc: "Деньги держатся в эскроу до вашего подтверждения. Никакого риска." },
  { icon: BadgeCheck, title: "Проверенные продавцы", desc: "Верифицированные аккаунты и реальные отзывы от клиентов." },
  { icon: MessageSquare, title: "Прямая связь", desc: "Чат по каждому заказу. Всё в одном месте, ничего не теряется." },
  { icon: Zap, title: "Быстрый старт", desc: "Получите результат уже через 24 часа при работе с опытными специалистами." },
];

const forSellers = [
  { icon: UserCheck, title: "Стабильный поток заказов", desc: "Платформа привлекает клиентов — вы фокусируетесь на работе." },
  { icon: Star, title: "Рост рейтинга", desc: "Хорошая работа = высокий рейтинг = больше заказов и выше цены." },
  { icon: CreditCard, title: "Быстрые выплаты", desc: "Оплата поступает сразу после подтверждения клиентом." },
  { icon: Shield, title: "Защита от мошенников", desc: "Работа принимается только через платформу — риски для обеих сторон минимальны." },
];

export default function HowItWorks() {
  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-8 py-12 md:py-20">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-6">
            <Zap className="w-4 h-4" />
            Простой, безопасный, эффективный
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-bold mb-6 leading-tight">
            Как работает <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">FreelanceTM</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            4 шага от идеи до готового результата. Без переписок в Telegram, без рисков, без лишней суеты.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative mb-24">
          <div className="hidden md:block absolute left-1/2 -translate-x-0.5 top-10 bottom-10 w-px bg-gradient-to-b from-primary/40 via-white/10 to-transparent" />
          <div className="space-y-12">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const isLeft = i % 2 === 0;
              return (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className={`grid md:grid-cols-2 gap-8 items-center ${isLeft ? "" : "md:direction-rtl"}`}
                >
                  <div className={`${isLeft ? "md:text-right md:pr-16" : "md:order-2 md:pl-16"}`}>
                    <div className={`inline-flex items-center gap-3 mb-4 ${isLeft ? "md:flex-row-reverse" : ""}`}>
                      <div className={`w-14 h-14 rounded-2xl ${step.bg} ${step.color} flex items-center justify-center`}>
                        <Icon className="w-7 h-7" />
                      </div>
                      <div className={`text-6xl font-display font-bold text-white/[0.04] leading-none`}>
                        {step.num}
                      </div>
                    </div>
                    <h3 className="text-2xl font-display font-bold mb-3">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed mb-3">{step.desc}</p>
                    <p className={`text-sm ${step.color} bg-white/5 border border-white/10 rounded-lg px-3 py-2 inline-block`}>
                      💡 {step.tip}
                    </p>
                  </div>
                  <div className={`${isLeft ? "hidden md:block" : "hidden md:block md:order-1"}`} />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* For Buyers / Sellers */}
        <div className="grid md:grid-cols-2 gap-8 mb-20">
          <div className="p-8 rounded-2xl bg-primary/5 border border-primary/20">
            <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              Для клиентов
            </h2>
            <div className="space-y-4">
              {forBuyers.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm mb-0.5">{title}</div>
                    <div className="text-sm text-muted-foreground">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/gigs" className="mt-6 block">
              <Button className="w-full gap-2">Найти специалиста <ArrowRight className="w-4 h-4" /></Button>
            </Link>
          </div>

          <div className="p-8 rounded-2xl bg-secondary/5 border border-secondary/20">
            <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
              <Star className="w-6 h-6 text-secondary" />
              Для фрилансеров
            </h2>
            <div className="space-y-4">
              {forSellers.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary/20 text-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm mb-0.5">{title}</div>
                    <div className="text-sm text-muted-foreground">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/create-gig" className="mt-6 block">
              <Button variant="outline" className="w-full gap-2 border-secondary/30 text-secondary hover:bg-secondary/10">
                Разместить услугу <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold text-center mb-10">Часто задаваемые вопросы</h2>
          <div className="space-y-4">
            {[
              {
                q: "Как защищены мои деньги?",
                a: "Оплата замораживается в эскроу сразу после размещения заказа. Продавец получает деньги только после того, как вы подтвердите принятие работы.",
              },
              {
                q: "Что если работа выполнена плохо?",
                a: "Вы можете запросить правки или открыть спор. Служба поддержки рассмотрит ситуацию и поможет найти справедливое решение.",
              },
              {
                q: "Можно ли работать с несколькими фрилансерами?",
                a: "Да, вы можете одновременно иметь несколько активных заказов с разными специалистами.",
              },
              {
                q: "Как стать фрилансером на платформе?",
                a: "Зарегистрируйтесь, выберите роль «Фрилансер», заполните профиль и создайте первую услугу. Верификация повысит доверие клиентов.",
              },
              {
                q: "Какие комиссии у платформы?",
                a: "На текущем этапе платформа работает без комиссий. Мы строим сообщество — прозрачные условия для всех участников.",
              },
            ].map(({ q, a }) => (
              <details key={q} className="group border border-white/10 rounded-xl bg-white/5 overflow-hidden">
                <summary className="flex items-center justify-between p-5 cursor-pointer font-semibold text-sm list-none hover:bg-white/5 transition-colors">
                  {q}
                  <span className="text-muted-foreground group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                </summary>
                <div className="px-5 pb-5 text-muted-foreground text-sm leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
