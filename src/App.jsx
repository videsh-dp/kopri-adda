import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Members from "./pages/Members.jsx";
import MemberDetail from "./pages/MemberDetail.jsx";
import Loans from "./pages/Loans.jsx";
import Deposits from "./pages/Deposits.jsx";
import LoanDetail from "./pages/LoanDetail.jsx";
import Ledger from "./pages/Ledger.jsx";
import CashBank from "./pages/CashBank.jsx";
import YearEnd from "./pages/YearEnd.jsx";
import Reports from "./pages/Reports.jsx";
import Rules from "./pages/Rules.jsx";
import { ToastHost } from "./components/ui.jsx";

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/members" element={<Members />} />
          <Route path="/members/:id" element={<MemberDetail />} />
          <Route path="/deposits" element={<Deposits />} />
          <Route path="/loans" element={<Loans />} />
          <Route path="/loans/:id" element={<LoanDetail />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/cash-bank" element={<CashBank />} />
          <Route path="/year-end" element={<YearEnd />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/rules" element={<Rules />} />
        </Route>
      </Routes>
      <ToastHost />
    </>
  );
}