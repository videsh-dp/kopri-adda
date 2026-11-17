import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { memberStatement, statementText } from "../lib/statement.js";
import { whatsappLink } from "../lib/collect.js";
import { formatINR, formatDate } from "../lib/format.js";
import { Button, EmptyState } from "../components/ui.jsx";
import { StatusPill } from "./Collect.jsx";
import { IconBack, IconChat, IconPrint } from "../components/Icons.jsx";

const STATUS_WORD = { paid: "Paid", paid_late: "Paid late", late: "Late", due: "Due", upcoming: "Not due yet" };
const TONE = { paid: "paid", paid_late: "paid", late: "late", due: "due", upcoming: "due" };

// A one-page statement for one person, made to print (or save as PDF) and
// to send on WhatsApp. Shown without the app menus.
export default function Statement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useKopri();
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
          <IconBack /> Back
        </Button>
        <div className="grow" />
        <Button className="btn-wa" onClick={() => window.open(whatsappLink(member.phone, statementText(s)), "_blank", "noopener")}>
          <IconChat /> Send on WhatsApp
        </Button>
        <Button variant="primary" onClick={() => window.print()}>
          <IconPrint /> Print / PDF
        </Button>
      </div>

      <article className="statement">
        <header className="statement-head">
          <div>
            <div className="statement-kopri">{s.kopriName}</div>
            <h1>Statement for {member.name}</h1>
            <div className="muted small">
              As on {formatDate(s.today)}
              {member.phone ? ` · ${member.phone}` : ""}
            </div>
          </div>
          {s.owedNow > 0.5 ? (
            <div className="statement-owed late">
              <span>Due now</span>
              <b>{formatINR(s.owedNow)}</b>
            </div>
          ) : (
            <div className="statement-owed paid">
              <span>Nothing due now</span>
              <b>✓</b>
            </div>
          )}
        </header>

        {s.monthly > 0 && (
          <section>
            <h2>Deposits</h2>
            <div className="statement-kpis">
              <div>
                <span>Monthly deposit</span>
                <b>{formatINR(s.monthly)}</b>
              </div>
              <div>
                <span>Deposited so far</span>
                <b>{formatINR(s.deposited)}</b>
              </div>
              <div>
                <span>Balance incl. profit</span>
                <b>{formatINR(s.balance)}</b>
              </div>
            </div>
            {s.months.length > 0 && (
              <table className="statement-table">
                <thead>
                  <tr>
                    <th>Month (FY {s.fyLabel})</th>
                    <th className="num">Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.months.map((m) => (
                    <tr key={m.month}>
                      <td>{m.label}</td>
                      <td className="num">
                        {formatINR(m.paid)}
                        {m.left > 0.5 && <span className="muted"> of {formatINR(m.expected)}</span>}
                      </td>
                      <td>
                        <StatusPill status={TONE[m.status]}>
                          {STATUS_WORD[m.status]}
                          {m.paidDate ? ` · ${formatDate(m.paidDate).slice(0, -5)}` : ""}
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
            <h2>Loans</h2>
            {s.loans.map((l) => (
              <div key={l.id} className="statement-loan">
                <div className="spread">
                  <b>
                    Loan of {formatINR(l.principal)} · {formatDate(l.startDate)}
                  </b>
                  {l.writtenOff ? (
                    <StatusPill status="late">Can't recover</StatusPill>
                  ) : l.closed ? (
                    <StatusPill status="paid">Fully repaid</StatusPill>
                  ) : l.lateAmount > 0.5 ? (
                    <StatusPill status="late">Late {formatINR(l.lateAmount)}</StatusPill>
                  ) : (
                    <StatusPill status="due">On time</StatusPill>
                  )}
                </div>
                <div className="statement-kpis">
                  <div>
                    <span>Paid back</span>
                    <b>{formatINR(l.paidBack)}</b>
                  </div>
                  <div>
                    <span>Interest paid</span>
                    <b>{formatINR(l.interestPaid)}</b>
                  </div>
                  <div>
                    <span>Still to pay</span>
                    <b>{formatINR(l.stillToPay)}</b>
                  </div>
                </div>
                <div className="small muted">
                  {l.emisPaid} of {l.emis} EMIs paid
                  {l.next && !l.closed ? ` · next EMI ${formatINR(l.next.amount)} due ${formatDate(l.next.dueDate)}` : ""}
                </div>
              </div>
            ))}
          </section>
        )}

        {s.monthly <= 0 && s.loans.length === 0 && <p className="muted">No deposits or loans yet.</p>}

        <footer className="statement-foot small muted">
          Prepared by the {s.kopriName} manager on {formatDate(s.today)}. Please tell the manager if anything looks wrong.
        </footer>
      </article>
    </div>
  );
}
