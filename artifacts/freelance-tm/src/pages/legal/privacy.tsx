import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 md:py-16 max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          На главную
        </Link>

        <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">Политика конфиденциальности</h1>
        <p className="text-sm text-muted-foreground mb-10">Последнее обновление: 1 июня 2026 г.</p>

        <div className="space-y-10 text-sm md:text-base leading-relaxed">

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">1. Какие данные мы собираем</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>1.1. <span className="text-foreground">При регистрации:</span> e-mail, имя пользователя (логин), роль (Заказчик/Исполнитель).</li>
              <li>1.2. <span className="text-foreground">При интеграции с Telegram:</span> Telegram ID, Telegram Username, имя в профиле.</li>
              <li>1.3. <span className="text-foreground">При работе:</span> история заказов, откликов, транзакций, переписка внутри Платформы, логи Арбитража.</li>
              <li>1.4. <span className="text-foreground">Технические данные:</span> IP-адрес, данные файлов cookie.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">2. Цели обработки данных</h2>
            <p className="text-muted-foreground">
              2.1. Идентификация пользователей, обеспечение работы «Безопасной сделки», отправка системных
              уведомлений в Telegram-бот, разрешение споров в Арбитраже и защита от мошенничества.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">3. Защита и удаление данных</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>
                3.1. Данные хранятся на защищённых серверах с шифрованием и не передаются третьим лицам,
                кроме случаев, предусмотренных законами Туркменистана.
              </li>
              <li>
                3.2. Пользователь имеет право запросить удаление аккаунта через поддержку. Часть данных
                (транзакции) может храниться установленный законом срок для разрешения возможных споров.
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">4. Ваши права</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li>Право на доступ к своим данным</li>
              <li>Право на исправление неточных данных</li>
              <li>Право на удаление аккаунта и данных (при отсутствии незавершённых сделок)</li>
              <li>Право на ограничение обработки</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">5. Cookie</h2>
            <p className="text-muted-foreground">
              Мы используем cookies для технического функционирования сайта (авторизация, сессия)
              и базовой аналитики. Вы можете отключить cookies в настройках браузера, однако
              это может ограничить функциональность сервиса.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">6. Контакты</h2>
            <p className="text-muted-foreground">
              По всем вопросам, связанным с обработкой персональных данных:
            </p>
            <p>
              <a href="mailto:privacy@freelancetm.com" className="text-primary hover:underline">
                privacy@freelancetm.com
              </a>
            </p>
          </section>

          <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3 text-sm text-muted-foreground">
            <Link href="/terms" className="text-primary hover:underline">Пользовательское соглашение →</Link>
            <Link href="/escrow" className="text-primary hover:underline">Регламент безопасной сделки →</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
