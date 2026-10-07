import React, { useState, useEffect } from 'react';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { StatCard } from '../components/dashboard/StatCard';
import { FinancialPerformanceChart } from '../components/dashboard/FinancialPerformanceChart';
import { ExpenseDistributionChart } from '../components/dashboard/ExpenseDistributionChart';
import { MiniStatCard } from '../components/dashboard/MiniStatCard';
import { RecentTransactions } from '../components/dashboard/RecentTransactions';
import { KayanAIWidget } from '../components/dashboard/KayanAIWidget';
import { kpiCardsData as initialKpiCards, miniStatCards as initialMiniCards } from '../mock/dashboardData';

export const Dashboard: React.FC = () => {
  const [kpiCards, setKpiCards] = useState(initialKpiCards);
  const [miniCards, setMiniCards] = useState(initialMiniCards);

  useEffect(() => {
    const fetchDashboardSummary = async () => {
      try {
        const res = await fetch('/api/dashboard/summary');
        if (res.ok) {
          const data = await res.json();

          // Update mini cards with real counts
          setMiniCards(prev =>
            prev.map(card => {
              if (card.id === 'customers' && data.activeCustomers !== undefined) {
                return { ...card, value: data.activeCustomers.toString() };
              }
              if (card.id === 'suppliers' && data.activeSuppliers !== undefined) {
                return { ...card, value: data.activeSuppliers.toString() };
              }
              return card;
            })
          );

          // Update KPI cards if data exists
          setKpiCards(prev =>
            prev.map(card => {
              if (card.id === 'sales' && data.totalSales > 0) {
                return {
                  ...card,
                  amount: data.totalSales,
                  formattedAmount: data.totalSales.toLocaleString(),
                };
              }
              if (card.id === 'expenses' && data.totalPurchases > 0) {
                return {
                  ...card,
                  amount: data.totalPurchases,
                  formattedAmount: data.totalPurchases.toLocaleString(),
                };
              }
              return card;
            })
          );
        }
      } catch (err) {
        console.error('Error fetching dashboard summary:', err);
      }
    };

    fetchDashboardSummary();
  }, []);

  return (
    <div className="space-y-5 pb-6">
      {/* 1. Header Banner */}
      <DashboardHeader />

      {/* 2. Top 4 KPI Cards (Right-to-Left: Sales, Expenses, Profit, Cash) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <StatCard key={kpi.id} data={kpi} />
        ))}
      </div>

      {/* 3. Middle Section: Financial Line Chart (Right) & Expense Donut Chart (Left) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Financial Performance Chart (65% on desktop) */}
        <div className="lg:col-span-8">
          <FinancialPerformanceChart />
        </div>

        {/* Expense Distribution Chart (35% on desktop) */}
        <div className="lg:col-span-4">
          <ExpenseDistributionChart />
        </div>
      </div>

      {/* 4. Mini Summary Cards (6 items) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {miniCards.map((item) => (
          <MiniStatCard key={item.id} item={item} />
        ))}
      </div>

      {/* 5. Bottom Section: Recent Transactions (Right) & Kayan AI (Left) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Recent Transactions (~58% on desktop) */}
        <div className="lg:col-span-7">
          <RecentTransactions />
        </div>

        {/* Kayan AI Smart Assistant (~42% on desktop) */}
        <div className="lg:col-span-5">
          <KayanAIWidget />
        </div>
      </div>
    </div>
  );
};

