import { Routes, Route, Navigate } from "react-router-dom";
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
import Managers from "./pages/Managers.jsx";
import Login from "./pages/Login.jsx";
import { useKopri } from "./state/KopriContext.jsx";
import { ToastHost } from "./components/ui.jsx";

export default function App() {
  const { role } = useKopri();
  if (!role) {
    return (
      <>
        <Login />
        <ToastHost />
      </>
    );
  }
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
          {role === "admin" && <Route path="/managers" element={<Managers />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastHost />
    </>
  );
}