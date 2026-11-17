import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { memberStatement, statementText } from "../lib/statement.js";
import { whatsappLink } from "../lib/collect.js";
import { formatINR } from "../lib/format.js";
import { Button, EmptyState } from "../components/ui.jsx";
import { StatusPill } from "./Collect.jsx";
import { dateIn, monthLongIn } from "../lib/i18n.js";
import { IconBack, IconChat, IconPrint } from "../components/Icons.jsx";

const STATUS_WORD = { paid: "Paid", paid_late: "Paid late", late: "Late", due: "Due", upcoming: "Not due yet" }; // translated with t()
const TONE = { paid: "paid", paid_late: "paid", late: "late", due: "due", upcoming: "due" };

// A one-page statement for one person, made to print (or save as PDF) and
// to send on WhatsApp. Shown without the app menus.
export default function Statement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, t, lang, msgLang } = useKopri();
  const d = (iso, y = true) => dateIn(lang, iso, y);
  const member = state.members.find((m) => m.id === id);
  const s = useMemo(() => (member ? memberStatement(state, member) : null), [state, member]);

  if (!s) {
    return (
      <div className="statement-page">
        <EmptyState icon="🔍" title="Person not found" />
        <div style={{ textAlign: "center" }}>
          <Link to="/members" className="btn">Back to people</Link>
        </div>
      </div>
    );
  }

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(`/members/${id}`));

  return (
    <div className="statement-page">
      <div className="statement-actions no-print">
        <Button onClick={goBack}>
          <IconBack /> {t("Back")}
        </Button>
        <div className="grow" />
        <Button className="btn-wa" onClick={() => window.open(whatsappLink(member.phone, statementText(s, msgLang)), "_blank", "noopener")}>
          <IconChat /> {t("Send on WhatsApp")}
        </Button>
        <Button variant="primary" onClick={() => window.print()}>
          <IconPrint /> {t("Print / PDF")}
        </Button>
      </div>

      <article className="statement">
        <header className="statement-head">
          <div>
            <div className="statement-kopri">{s.kopriName}</div>
            <h1>{t("Statement for {name}", { name: member.name })}</h1>
            <div className="muted small">
              {t("As on {date}", { date: d(s.today) })}
              {member.phone ? ` · ${member.phone}` : ""}
            </div>
          </div>
          {s.owedNow > 0.5 ? (
            <div className="statement-owed late">
              <span>{t("Due now")}</span>
              <b>{formatINR(s.owedNow)}</b>
            </div>
          ) : (
            <div className="statement-owed paid">
              <span>{t("Nothing due now")}</span>
              <b>✓</b>
            </div>
          )}
        </header>

        {s.monthly > 0 && (
          <section>
            <h2>{t("Deposits")}</h2>
            <div className="statement-kpis">
              <div>
                <span>{t("Monthly deposit")}</span>
                <b>{formatINR(s.monthly)}</b>
              </div>
              <div>
                <span>{t("Deposited so far")}</span>
                <b>{formatINR(s.deposited)}</b>
              </div>
              <div>
                <span>{t("Balance incl. profit")}</span>
                <b>{formatINR(s.balance)}</b>
              </div>
            </div>
            {s.months.length > 0 && (
              <table className="statement-table">
                <thead>
                  <tr>
                    <th>{t("Month (FY {fy})", { fy: s.fyLabel })}</th>
                    <th className="num">{t("Paid")}</th>
                    <th>{t("Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.months.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLongIn(lang, m.month)}</td>
                      <td className="num">
                        {formatINR(m.paid)}
                        {m.left > 0.5 && <span className="muted"> of {formatINR(m.expected)}</span>}
                      </td>
                      <td>
                        <StatusPill status={TONE[m.status]}>
                          {t(STATUS_WORD[m.status])}
                          {m.paidDate ? ` · ${d(m.paidDate, false)}` : ""}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {s.loans.length > 0 && (
          <section>
            <h2>{t("Loans")}</h2>
            {s.loans.map((l) => (
              <div key={l.id} className="statement-loan">
                <div className="spread">
                  <b>
                    {t("Loan of {amt} · {date}", { amt: formatINR(l.principal), date: d(l.startDate) })}
                  </b>
                  {l.writtenOff ? (
                    <StatusPill status="late">{t("Can't recover")}</StatusPill>
                  ) : l.closed ? (
                    <StatusPill status="paid">{t("Fully repaid")}</StatusPill>
                  ) : l.lateAmount > 0.5 ? (
                    <StatusPill status="late">{t("Late {amt}", { amt: formatINR(l.lateAmount) })}</StatusPill>
                  ) : (
                    <StatusPill status="due">{t("On time")}</StatusPill>
                  )}
                </div>
                <div className="statement-kpis">
                  <div>
                    <span>{t("Paid back")}</span>
                    <b>{formatINR(l.paidBack)}</b>
                  </div>
                  <div>
                    <span>{t("Interest paid")}</span>
                    <b>{formatINR(l.interestPaid)}</b>
                  </div>
                  <div>
                    <span>{t("Still to pay")}</span>
                    <b>{formatINR(l.stillToPay)}</b>
                  </div>
                </div>
                <div className="small muted">
                  {t("{paid} of {n} EMIs paid", { paid: l.emisPaid, n: l.emis })}
                  {l.next && !l.closed ? ` · ${t("next EMI {amt} due {date}", { amt: formatINR(l.next.amount), date: d(l.next.dueDate) })}` : ""}
                </div>
              </div>
            ))}
          </section>
        )}

        {s.monthly <= 0 && s.loans.length === 0 && <p className="muted">{t("No deposits or loans yet.")}</p>}

        <footer className="statement-foot small muted">
          {t("Prepared by the {kopri} manager on {date}. Please tell the manager if anything looks wrong.", { kopri: s.kopriName, date: d(s.today) })}
        </footer>
      </article>
    </div>
  );
}
