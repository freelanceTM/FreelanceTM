import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { ChevronLeft, Shield } from "lucide-react";

export default function EscrowPage() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 md:py-16 max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          На главную
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-green-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold">Регламент безопасной сделки</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-10">Последнее обновление: 1 июня 2026 г.</p>

        <div className="space-y-10 text-sm md:text-base leading-relaxed">

          <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 text-sm text-green-300">
            <p>
              Сервис «Безопасная сделка» защищает обе стороны: Заказчик не теряет деньги, пока не примет работу,
              а Исполнитель гарантированно получит оплату за выполненный заказ.
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">1. Резервирование денежных средств</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>1.1. После подтверждения заказа Заказчиком стоимость заказа в полном объеме резервируется Платформой и учитывается в системе в качестве обеспечительного платежа.</li>
              <li>1.2. До завершения сделки зарезервированные средства не могут быть использованы Заказчиком.</li>
              <li>1.3. Резервирование средств не означает автоматическое принятие работы.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">2. Передача и принятие работы</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>2.1. Исполнитель обязан загрузить результат работы через функционал Платформы. С этого момента начинается срок проверки.</li>
              <li>2.2. Заказчик принимает работу нажатием кнопки «Принять работу». Средства перечисляются Исполнителю за вычетом комиссии.</li>
              <li>
                2.3. Если Заказчик не принял работу и не открыл спор в течение{" "}
                <span className="text-foreground font-semibold">72 часов</span>,
                система принимает работу автоматически, и средства уходят Исполнителю.
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">3. Арбитраж Платформы</h2>
            <ul className="space-y-2 text-muted-foreground list-none">
              <li>
                3.1. При наличии претензий Заказчик обязан нажать кнопку «Открыть спор» до истечения
                <span className="text-foreground font-semibold"> 72 часов</span>. Выплата блокируется.
              </li>
              <li>3.2. Стороны обязуются предоставить Арбитражу доказательства (переписку, файлы, ТЗ).</li>
              <li>3.3. Решение Арбитража Платформы является окончательным в рамках функционирования сервиса. Арбитраж может выплатить сумму Исполнителю, вернуть Заказчику или разделить её пропорционально выполненной работе.</li>
            </ul>
          </section>

          <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3 text-sm text-muted-foreground">
            <Link href="/terms" className="text-primary hover:underline">Пользовательское соглашение →</Link>
            <Link href="/privacy" className="text-primary hover:underline">Политика конфиденциальности →</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
