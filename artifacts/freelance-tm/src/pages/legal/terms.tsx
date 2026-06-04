import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 md:py-16 max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          На главную
        </Link>

        <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">Пользовательское соглашение</h1>
        <p className="text-sm text-muted-foreground mb-10">Последнее обновление: 1 июня 2026 г.</p>

        <div className="space-y-10 text-sm md:text-base leading-relaxed">

          <p className="text-muted-foreground">
            Настоящее Пользовательское соглашение (далее — «Соглашение») определяет условия использования
            платформы FreelanceTM и является публичной офертой. Регистрация на Платформе означает полное
            и безоговорочное принятие Пользователем условий настоящего Соглашения.
          </p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">1. Термины и определения</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li><span className="text-foreground font-medium">Платформа</span> — программно-аппаратный комплекс FreelanceTM (включая веб-сайт и Telegram-бота).</li>
              <li><span className="text-foreground font-medium">Пользователь</span> — любое физическое или юридическое лицо, зарегистрированное на Платформе.</li>
              <li><span className="text-foreground font-medium">Заказчик</span> — Пользователь, размещающий задание или приобретающий услуги.</li>
              <li><span className="text-foreground font-medium">Исполнитель (Фрилансер)</span> — Пользователь, выполняющий задания Заказчиков.</li>
              <li><span className="text-foreground font-medium">Безопасная сделка (Эскроу)</span> — сервис резервирования денежных средств до завершения заказа.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">2. Статус Платформы</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>2.1. Платформа является исключительно информационным посредником между Пользователями.</li>
              <li>2.2. Платформа не является работодателем, агентом, подрядчиком или партнером Пользователей.</li>
              <li>2.3. Все договоренности между Заказчиком и Исполнителем заключаются ими самостоятельно.</li>
              <li>2.4. Платформа не гарантирует качество, сроки или коммерческую ценность результатов работ.</li>
              <li>2.5. Платформа не является стороной сделок между Заказчиком и Исполнителем. Все права и обязанности возникают непосредственно между ними.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">3. Регистрация и использование сервиса</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>3.1. Пользователь обязан предоставлять достоверную информацию при регистрации.</li>
              <li>3.2. Пользователь несет полную ответственность за сохранность своего аккаунта.</li>
              <li>3.3. Передача аккаунта третьим лицам запрещена.</li>
              <li>3.4. Запрещено использовать Платформу для незаконной деятельности, мошенничества или спама.</li>
              <li>3.5. Пользователь подтверждает, что обладает полной гражданской дееспособностью по законодательству Туркменистана, либо действует с согласия законных представителей.</li>
              <li>3.6. Пользователь сам несет ответственность за соблюдение законов своей страны при использовании Платформы.</li>
              <li>3.7. Пользователь соглашается на получение уведомлений через Telegram-бота, email и иные каналы связи.</li>
              <li>3.8. Пользователям запрещается использовать контактные данные, полученные через Платформу, для заключения сделок вне Платформы в целях обхода комиссии. При нарушении Администрация вправе заблокировать аккаунты без возврата средств.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">4. Финансовые условия и налоги</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>4.1. Платформа удерживает комиссию в размере <span className="text-foreground font-semibold">15%</span> от суммы успешно завершенного заказа.</li>
              <li>4.2. Комиссия удерживается автоматически при завершении сделки.</li>
              <li>4.3. Денежные средства могут временно резервироваться до момента завершения сделки.</li>
              <li>4.4. Платформа не является банком и не оказывает банковских услуг самостоятельно.</li>
              <li>4.5. Платформа не осуществляет налоговое агентирование. Пользователи сами уплачивают налоги в своей стране.</li>
              <li>4.6. Возврат средств возможен только в случаях технической ошибки или двойного списания по решению Администрации.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">5. Блокировка и ограничение ответственности</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>5.1. Администрация вправе заблокировать аккаунт за нарушение Соглашения, мошенничество или обход комиссии.</li>
              <li>5.2. Платформа предоставляется по принципу «как есть» (as is).</li>
              <li>5.3. Ответственность Платформы ограничена суммой комиссии, полученной по конкретной сделке.</li>
              <li>5.4. Платформа не несет ответственности за временные технические сбои, проблемы с хостингом или форс-мажор.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">6. Изменение условий и юрисдикция</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>6.1. Новая редакция Соглашения вступает в силу через 7 календарных дней после публикации. Продолжение использования сервиса означает согласие с изменениями.</li>
              <li>6.2. Соглашение регулируется и толкуется в соответствии с законодательством Туркменистана. Все споры подлежат рассмотрению в порядке, предусмотренном законами Туркменистана.</li>
            </ul>
          </section>

          <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3 text-sm text-muted-foreground">
            <Link href="/escrow" className="text-primary hover:underline">Регламент безопасной сделки →</Link>
            <Link href="/privacy" className="text-primary hover:underline">Политика конфиденциальности →</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
