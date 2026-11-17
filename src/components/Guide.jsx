// A short numbered checklist that walks the manager through a rare job.
// Each step: { title, text, done, action?: { label, onClick | to } }.
import { Link } from "react-router-dom";
import { IconCheck } from "./Icons.jsx";

export function GuideSteps({ title, sub, steps }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <div className="card guide">
      <div className="guide-head">
        <div className="card-title">{title}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      <ol className="guide-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={`guide-step ${s.done ? "done" : i === current ? "now" : ""}`}>
            <span className="guide-num">{s.done ? <IconCheck width={16} height={16} /> : i + 1}</span>
            <div className="guide-body">
              <div className="guide-title">{s.title}</div>
              {s.text && <div className="guide-text">{s.text}</div>}
              {s.action && !s.done && (
                <div style={{ marginTop: 8 }}>
                  {s.action.to ? (
                    <Link to={s.action.to} className={`btn btn-sm ${i === current ? "btn-primary" : ""}`}>
                      {s.action.label}
                    </Link>
                  ) : (
                    <button className={`btn btn-sm ${i === current ? "btn-primary" : ""}`} onClick={s.action.onClick}>
                      {s.action.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
