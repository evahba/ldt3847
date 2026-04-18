"use client";
import React, { useState, useMemo, useEffect } from "react";
import rawData from "@/lib/data.json";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Spotlight } from "@/components/ui/Spotlight";
import { DollarSign, Users, TrendingUp, Calendar } from "lucide-react";

// Step function: maps sales $ → headcount
const STEP_FUNCTION = [
  { min: 0,      headcount: 3 },
  { min: 158.03, headcount: 4 },
  { min: 249.42, headcount: 5 },
  { min: 340.81, headcount: 6 },
  { min: 432.20, headcount: 7 },
  { min: 523.59, headcount: 8 },
  { min: 614.98, headcount: 9 },
  { min: 706.37, headcount: 10 },
];

function salesToHeadcount(sales: number): number {
  let result = STEP_FUNCTION[0].headcount;
  for (const step of STEP_FUNCTION) {
    if (sales >= step.min) result = step.headcount;
    else break;
  }
  return result;
}

function computeNonSmooth(sales: number | string, nextSales: number | string): number {
  if (sales === "Opening Shift") return 2;
  if (sales === "Closing Shift") return 4;
  const hc = salesToHeadcount(sales as number);
  if (nextSales === "Closing Shift" && hc < 4) return 4;
  return hc;
}

function computeRcmd(
  sales: number | string,
  nextSales: number | string,
  daypart: string,
  daypartSalesValues: number[]
): number {
  if (sales === "Opening Shift") return 2;
  if (sales === "Closing Shift") return 4;
  const hc = salesToHeadcount(sales as number);
  if (nextSales === "Closing Shift" && hc < 4) return 4;
  if (["Lunch", "Afternoon", "Dinner"].includes(daypart) && daypartSalesValues.length > 0) {
    const avg = daypartSalesValues.reduce((a, b) => a + b, 0) / daypartSalesValues.length;
    return salesToHeadcount(avg);
  }
  return hc;
}

function computeMinRcmd(sales: number | string, rcmd: number): number {
  if (sales === "Opening Shift" || sales === "Closing Shift") return rcmd;
  return rcmd - 1;
}

function formatSales(sales: number | string): string {
  if (typeof sales === "string") return sales;
  return `$${sales.toFixed(0)}`;
}

type SalesOverrides = Record<string, Record<string, number | string>>;

export default function Home() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [interval, setInterval] = useState<"30min" | "1hour" | "daypart">("30min");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setInterval("daypart");
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const [salesOverrides, setSalesOverrides] = useState<SalesOverrides>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [weeklyTargets, setWeeklyTargets] = useState<Record<string, number>>(rawData.weeklyTargets as Record<string, number>);
  const [targetModal, setTargetModal] = useState<{ day: string; value: string } | null>(null);
  const [expandedDaypart, setExpandedDaypart] = useState<Record<string, string | null>>({});

  function toggleDaypart(day: string, dayPart: string) {
    setExpandedDaypart((prev) => ({ ...prev, [day]: prev[day] === dayPart ? null : dayPart }));
  }
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedOverrides = localStorage.getItem("salesOverrides");
      const storedTargets = localStorage.getItem("weeklyTargets");
      if (storedOverrides) setSalesOverrides(JSON.parse(storedOverrides));
      if (storedTargets) setWeeklyTargets(JSON.parse(storedTargets));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem("salesOverrides", JSON.stringify(salesOverrides)); }, [salesOverrides, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("weeklyTargets", JSON.stringify(weeklyTargets)); }, [weeklyTargets, hydrated]);

  function applyWeeklyTarget(day: string, newTarget: number) {
    const currentTarget = weeklyTargets[day];
    if (!currentTarget || currentTarget === 0) return;
    const scale = newTarget / currentTarget;
    setSalesOverrides((prev) => {
      const next = { ...prev };
      for (const item of rawData.items) {
        const currentSales = prev[item.id]?.[day] ?? (item.days as any)[day].sales;
        if (typeof currentSales === "number") {
          next[item.id] = { ...(next[item.id] ?? {}), [day]: currentSales * scale };
        }
      }
      return next;
    });
    setWeeklyTargets((prev) => ({ ...prev, [day]: newTarget }));
  }

  // Merge overrides into raw items
  const itemsWithOverrides = useMemo(() => {
    return rawData.items.map((item) => {
      const overridesForRow = salesOverrides[item.id] ?? {};
      const days_: any = {};
      for (const day of days) {
        const orig = (item.days as any)[day].sales;
        days_[day] = { sales: overridesForRow[day] !== undefined ? overridesForRow[day] : orig };
      }
      return { ...item, days: days_ };
    });
  }, [salesOverrides]);

  // Compute derived columns from sales
  const computedItems = useMemo(() => {
    return itemsWithOverrides.map((item, idx) => {
      const next = itemsWithOverrides[idx + 1];
      const computed: any = { ...item, days: {} };
      for (const day of days) {
        const sales = item.days[day].sales;
        const nextSales = next ? next.days[day].sales : "Closing Shift";
        // Get all numeric sales for this daypart/day for smoothing
        const daypartSales = itemsWithOverrides
          .filter((r) => r.dayPart === item.dayPart)
          .map((r) => r.days[day].sales)
          .filter((s): s is number => typeof s === "number");
        const nonSmooth = computeNonSmooth(sales, nextSales);
        const rcmd = computeRcmd(sales, nextSales, item.dayPart, daypartSales);
        const minRcmd = computeMinRcmd(sales, rcmd);
        computed.days[day] = { sales, nonSmooth, rcmd, minRcmd };
      }
      return computed;
    });
  }, [itemsWithOverrides]);

  const displayItems = useMemo(() => {
    if (interval === "30min") return computedItems;

    if (interval === "daypart") {
      const daypartOrder = ["Breakfast", "Lunch", "Afternoon", "Dinner", "Evening"];
      return daypartOrder.map((dp) => {
        const rows = computedItems.filter((r) => r.dayPart === dp);
        if (!rows.length) return null;
        const first = rows[0];
        const last = rows[rows.length - 1];
        const merged: any = {
          id: dp,
          dayPart: dp,
          timeRange: `${first.timeRange.split(" - ")[0]} - ${last.timeRange.split(" - ")[1]}`,
          time: first.time,
          days: {},
        };
        for (const day of days) {
          const salesSum = rows.reduce((s, r) => {
            const v = r.days[day].sales;
            return s + (typeof v === "number" ? v : 0);
          }, 0);
          merged.days[day] = {
            sales: salesSum,
            minRcmd: Math.max(...rows.map((r) => r.days[day].minRcmd)),
            nonSmooth: Math.max(...rows.map((r) => r.days[day].nonSmooth)),
            rcmd: Math.max(...rows.map((r) => r.days[day].rcmd)),
          };
        }
        return merged;
      }).filter(Boolean);
    }

    const grouped: any[] = [];
    let i = 0;
    while (i < computedItems.length) {
      const current = computedItems[i];
      const currentHour = current.time.slice(0, 2);
      const next = computedItems[i + 1];
      const nextHour = next?.time.slice(0, 2);
      if (next && nextHour === currentHour) {
        const merged: any = {
          id: current.id,
          dayPart: current.dayPart,
          timeRange: `${current.time.slice(0, 5)} - ${next.timeRange.split(" - ")[1]}`,
          time: current.time,
          days: {},
        };
        for (const day of days) {
          const a = current.days[day];
          const b = next.days[day];
          const aSales = typeof a.sales === "number" ? a.sales : null;
          const bSales = typeof b.sales === "number" ? b.sales : null;
          const combinedSales = aSales !== null && bSales !== null ? aSales + bSales : a.sales;
          merged.days[day] = {
            sales: combinedSales,
            minRcmd: Math.max(a.minRcmd, b.minRcmd),
            nonSmooth: Math.max(a.nonSmooth, b.nonSmooth),
            rcmd: Math.max(a.rcmd, b.rcmd),
          };
        }
        grouped.push(merged);
        i += 2;
      } else {
        grouped.push(current);
        i += 1;
      }
    }
    return grouped;
  }, [computedItems, interval]);

  // Stats derived from computed data
  const totalSales = useMemo(() =>
    days.reduce((sum, day) =>
      sum + computedItems.reduce((s, item) => {
        const v = item.days[day].sales;
        return s + (typeof v === "number" ? v : 0);
      }, 0), 0),
    [computedItems]);

  const allRcmds = computedItems.flatMap((item) => days.map((d) => item.days[d].rcmd));
  const avgRcmd = allRcmds.length ? (allRcmds.reduce((a, b) => a + b, 0) / allRcmds.length).toFixed(1) : "0";
  const maxRcmd = allRcmds.length ? Math.max(...allRcmds) : 0;

  const stats = [
    {
      title: "Total Predicted Sales",
      value: `$${totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      icon: <DollarSign className="w-6 h-6 text-emerald-500" />,
      description: "Across all 7 days"
    },
    {
      title: "Average Labor",
      value: avgRcmd,
      icon: <Users className="w-6 h-6 text-blue-500" />,
      description: "Weekly average recommended staff"
    },
    {
      title: "Peak Labor",
      value: maxRcmd,
      icon: <TrendingUp className="w-6 h-6 text-purple-500" />,
      description: "Highest staffing requirement"
    },
    {
      title: "Reporting Intervals",
      value: computedItems.length * days.length,
      icon: <Calendar className="w-6 h-6 text-orange-500" />,
      description: "Total 1/2 hour slots analyzed"
    }
  ];

  function startEdit(itemId: string, day: string, currentSales: number | string) {
    if (typeof currentSales === "string") return; // don't edit Opening/Closing Shift
    setEditingCell(`${itemId}-${day}`);
    setEditValue(typeof currentSales === "number" ? currentSales.toFixed(2) : "");
  }

  function commitEdit(itemId: string, day: string) {
    const num = parseFloat(editValue);
    if (!isNaN(num)) {
      setSalesOverrides((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] ?? {}), [day]: num },
      }));
    }
    setEditingCell(null);
  }

  return (
    <main className="min-h-screen bg-black/[0.96] antialiased bg-grid-white/[0.02] relative overflow-hidden pb-20">
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />
      
      <div className="p-4 max-w-7xl mx-auto relative z-10 w-full pt-10 md:pt-20">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
            Labor Optimization
          </h1>
          <p className="mt-4 font-normal text-base text-neutral-300 max-w-lg mx-auto">
            Weekly dashboard for analyzing predicted sales and labor recommendations across all 7 days.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {stats.map((stat, i) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={stat.title}
              className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-xl"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-2 rounded-lg bg-black/50 border border-neutral-800">
                  {stat.icon}
                </div>
                <h3 className="text-neutral-400 text-sm font-medium">{stat.title}</h3>
              </div>
              <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
              <p className="text-xs text-neutral-500">{stat.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Table Section */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-xl overflow-hidden">
          <div className="p-6 border-b border-neutral-800 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Weekly Interval Details</h2>
              <p className="text-xs text-neutral-500 mt-1">Click any sales value to edit — Min, Non-Smooth &amp; Rcmd recalculate automatically</p>
            </div>
            <div className={cn("flex items-center gap-1 bg-black/50 border border-neutral-800 rounded-lg p-1", isMobile && "hidden")}>
              {([["30min", "30 min"], ["1hour", "1 hour"], ["daypart", "Day Part"]] as const).map(([opt, label]) => (
                <button
                  key={opt}
                  onClick={() => setInterval(opt)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200",
                    interval === opt ? "bg-white text-black" : "text-neutral-400 hover:text-white"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {interval === "daypart" ? (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {days.map((day, idx) => (
                <motion.div
                  key={day}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/60 overflow-hidden"
                >
                  <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
                    <span className="text-white font-bold text-sm uppercase tracking-wider">{day}</span>
                    <button
                      onClick={() => setTargetModal({ day, value: String(weeklyTargets[day] ?? 0) })}
                      className="text-emerald-400 text-xs font-semibold hover:text-emerald-300 hover:underline transition-colors"
                    >
                      ${(weeklyTargets[day] ?? 0).toLocaleString()}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[300px]">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-neutral-800">
                        <th className="px-2 py-2 text-neutral-500 text-[10px] font-semibold uppercase tracking-wider">Day Part</th>
                        <th className="px-2 py-2 text-center text-neutral-500 text-[10px] font-semibold uppercase tracking-wider">Sales</th>
                        <th className="px-2 py-2 text-center text-neutral-500 text-[10px] font-semibold uppercase tracking-wider">Min</th>
                        <th className="px-2 py-2 text-center text-neutral-500 text-[10px] font-semibold uppercase tracking-wider">N-Sm</th>
                        <th className="px-2 py-2 text-center text-neutral-500 text-[10px] font-semibold uppercase tracking-wider bg-white/5">Rcmd</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayItems.map((item: any) => {
                        const isExpanded = expandedDaypart[day] === item.dayPart;
                        const breakdown = computedItems.filter((r) => r.dayPart === item.dayPart);
                        return (
                          <React.Fragment key={item.id}>
                            <tr
                              className="border-b border-neutral-800/50 hover:bg-white/[0.03] transition-colors cursor-pointer select-none"
                              onClick={() => toggleDaypart(day, item.dayPart)}
                            >
                              <td className="px-4 py-2.5 flex items-center gap-2">
                                <span className={cn(
                                  "text-neutral-500 transition-transform duration-200 inline-block",
                                  isExpanded ? "rotate-90" : ""
                                )} style={{fontStyle:"normal",fontFamily:"sans-serif",fontSize:"10px",lineHeight:1}}>&#x276F;</span>
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                                  item.dayPart === "Breakfast" && "bg-orange-500/10 text-orange-400 border border-orange-500/20",
                                  item.dayPart === "Lunch" && "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                                  item.dayPart === "Afternoon" && "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
                                  item.dayPart === "Dinner" && "bg-purple-500/10 text-purple-400 border border-purple-500/20",
                                  item.dayPart === "Evening" && "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                                )}>{item.dayPart}</span>
                              </td>
                              <td className="px-4 py-2.5 text-center text-neutral-300 text-xs">{formatSales(item.days[day].sales)}</td>
                              <td className="px-4 py-2.5 text-center text-neutral-500 text-xs">{item.days[day].minRcmd}</td>
                              <td className="px-4 py-2.5 text-center text-neutral-400 text-xs">{item.days[day].nonSmooth}</td>
                              <td className="px-4 py-2.5 text-center text-white font-bold text-xs bg-white/5">{item.days[day].rcmd}</td>
                            </tr>
                            {isExpanded && breakdown.map((slot: any) => (
                              <tr key={slot.id} className="border-b border-neutral-800/30 bg-white/[0.015]">
                                <td className="pl-10 pr-4 py-1.5 text-neutral-500 font-mono text-[10px] whitespace-nowrap">{slot.timeRange}</td>
                                <td className="px-4 py-1.5 text-center text-neutral-400 text-[10px]">{formatSales(slot.days[day].sales)}</td>
                                <td className="px-4 py-1.5 text-center text-neutral-600 text-[10px]">{slot.days[day].minRcmd}</td>
                                <td className="px-4 py-1.5 text-center text-neutral-500 text-[10px]">{slot.days[day].nonSmooth}</td>
                                <td className="px-4 py-1.5 text-center text-neutral-300 font-semibold text-[10px] bg-white/5">{slot.days[day].rcmd}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </motion.div>
              ))}

              {/* Average Day card */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="rounded-xl border border-neutral-700 bg-neutral-800/60 overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-neutral-700 flex items-center justify-between">
                  <span className="text-white font-bold text-sm uppercase tracking-wider">Avg Day</span>
                  <span className="text-neutral-400 text-xs font-semibold">
                    ${Math.round(days.reduce((s, d) => s + (weeklyTargets[d] ?? 0), 0) / days.length).toLocaleString()}
                  </span>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[300px]">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-neutral-700">
                      <th className="px-2 py-2 text-neutral-500 text-[10px] font-semibold uppercase tracking-wider">Day Part</th>
                      <th className="px-2 py-2 text-center text-neutral-500 text-[10px] font-semibold uppercase tracking-wider">Sales</th>
                      <th className="px-2 py-2 text-center text-neutral-500 text-[10px] font-semibold uppercase tracking-wider">Min</th>
                      <th className="px-2 py-2 text-center text-neutral-500 text-[10px] font-semibold uppercase tracking-wider">N-Sm</th>
                      <th className="px-2 py-2 text-center text-neutral-500 text-[10px] font-semibold uppercase tracking-wider bg-white/5">Rcmd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayItems.map((item: any) => {
                      const avgSales = days.reduce((s, d) => {
                        const v = item.days[d].sales;
                        return s + (typeof v === "number" ? v : 0);
                      }, 0) / days.length;
                      const avgMin = Math.round(days.reduce((s, d) => s + (item.days[d].minRcmd || 0), 0) / days.length);
                      const avgNonSmooth = Math.round(days.reduce((s, d) => s + (item.days[d].nonSmooth || 0), 0) / days.length);
                      const avgRcmdVal = Math.round(days.reduce((s, d) => s + (item.days[d].rcmd || 0), 0) / days.length);
                      const isExpanded = expandedDaypart["__avg__"] === item.dayPart;
                      const breakdown = computedItems.filter((r) => r.dayPart === item.dayPart);
                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            className="border-b border-neutral-700/50 hover:bg-white/[0.03] transition-colors cursor-pointer select-none"
                            onClick={() => toggleDaypart("__avg__", item.dayPart)}
                          >
                            <td className="px-4 py-2.5 flex items-center gap-2">
                              <span className={cn("text-neutral-500 transition-transform duration-200 inline-block", isExpanded && "rotate-90")} style={{fontStyle:"normal",fontFamily:"sans-serif",fontSize:"10px",lineHeight:1}}>&#x276F;</span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                                item.dayPart === "Breakfast" && "bg-orange-500/10 text-orange-400 border border-orange-500/20",
                                item.dayPart === "Lunch" && "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                                item.dayPart === "Afternoon" && "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
                                item.dayPart === "Dinner" && "bg-purple-500/10 text-purple-400 border border-purple-500/20",
                                item.dayPart === "Evening" && "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                              )}>{item.dayPart}</span>
                            </td>
                            <td className="px-4 py-2.5 text-center text-neutral-300 text-xs">${Math.round(avgSales).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-center text-neutral-500 text-xs">{avgMin}</td>
                            <td className="px-4 py-2.5 text-center text-neutral-400 text-xs">{avgNonSmooth}</td>
                            <td className="px-4 py-2.5 text-center text-white font-bold text-xs bg-white/5">{avgRcmdVal}</td>
                          </tr>
                          {isExpanded && breakdown.map((slot: any) => {
                            const slotAvgSales = days.reduce((s, d) => {
                              const v = slot.days[d].sales;
                              return s + (typeof v === "number" ? v : 0);
                            }, 0) / days.length;
                            const slotAvgMin = Math.round(days.reduce((s, d) => s + (slot.days[d].minRcmd || 0), 0) / days.length);
                            const slotAvgNS = Math.round(days.reduce((s, d) => s + (slot.days[d].nonSmooth || 0), 0) / days.length);
                            const slotAvgRcmd = Math.round(days.reduce((s, d) => s + (slot.days[d].rcmd || 0), 0) / days.length);
                            return (
                              <tr key={slot.id} className="border-b border-neutral-700/30 bg-white/[0.015]">
                                <td className="pl-10 pr-4 py-1.5 text-neutral-500 font-mono text-[10px] whitespace-nowrap">{slot.timeRange}</td>
                                <td className="px-4 py-1.5 text-center text-neutral-400 text-[10px]">${Math.round(slotAvgSales).toLocaleString()}</td>
                                <td className="px-4 py-1.5 text-center text-neutral-600 text-[10px]">{slotAvgMin}</td>
                                <td className="px-4 py-1.5 text-center text-neutral-500 text-[10px]">{slotAvgNS}</td>
                                <td className="px-4 py-1.5 text-center text-neutral-300 font-semibold text-[10px] bg-white/5">{slotAvgRcmd}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </motion.div>

              {/* Statistics card */}
              {(() => {
                const daypartOrder = ["Breakfast", "Lunch", "Afternoon", "Dinner", "Evening"];

                // Busiest day part by avg sales across all days
                const dpSales = daypartOrder.map((dp) => {
                  const rows = computedItems.filter((r) => r.dayPart === dp);
                  const total = days.reduce((s, d) => s + rows.reduce((ss, r) => {
                    const v = r.days[d].sales;
                    return ss + (typeof v === "number" ? v : 0);
                  }, 0), 0) / days.length;
                  return { dp, total };
                });
                const busiestDaypart = dpSales.reduce((a, b) => b.total > a.total ? b : a);
                const quietestDaypart = dpSales.reduce((a, b) => b.total < a.total ? b : a);

                // Peak day by total sales
                const daySales = days.map((d) => ({
                  d,
                  total: computedItems.reduce((s, r) => {
                    const v = r.days[d].sales;
                    return s + (typeof v === "number" ? v : 0);
                  }, 0),
                }));
                const peakDay = daySales.reduce((a, b) => b.total > a.total ? b : a);

                // Avg sales per headcount (labor efficiency) across all slots/days
                let effNum = 0, effDen = 0;
                for (const item of computedItems) {
                  for (const d of days) {
                    const v = item.days[d].sales;
                    const rc = item.days[d].rcmd;
                    if (typeof v === "number" && rc > 0) { effNum += v; effDen += rc; }
                  }
                }
                const salesPerHead = effDen > 0 ? effNum / effDen : 0;

                // Smoothing impact: slots where rcmd != nonSmooth
                let smoothedCount = 0, totalSlots = 0;
                for (const item of computedItems) {
                  for (const d of days) {
                    const { rcmd, nonSmooth } = item.days[d];
                    if (rcmd !== undefined && nonSmooth !== undefined) {
                      totalSlots++;
                      if (rcmd !== nonSmooth) smoothedCount++;
                    }
                  }
                }
                const smoothPct = totalSlots > 0 ? Math.round((smoothedCount / totalSlots) * 100) : 0;

                const stats = [
                  {
                    label: "Busiest Day Part",
                    value: busiestDaypart.dp,
                    sub: `$${Math.round(busiestDaypart.total).toLocaleString()} avg/day`,
                    color: "text-orange-400",
                    bg: "bg-orange-500/10 border-orange-500/20",
                  },
                  {
                    label: "Peak Day",
                    value: peakDay.d,
                    sub: `$${Math.round(peakDay.total).toLocaleString()} total sales`,
                    color: "text-emerald-400",
                    bg: "bg-emerald-500/10 border-emerald-500/20",
                  },
                  {
                    label: "Sales / Headcount",
                    value: `$${Math.round(salesPerHead)}`,
                    sub: "avg revenue per staff per slot",
                    color: "text-blue-400",
                    bg: "bg-blue-500/10 border-blue-500/20",
                  },
                  {
                    label: "Smoothing Impact",
                    value: `${smoothPct}%`,
                    sub: `of slots adjusted by smoothing`,
                    color: "text-purple-400",
                    bg: "bg-purple-500/10 border-purple-500/20",
                  },
                  {
                    label: "Quietest Day Part",
                    value: quietestDaypart.dp,
                    sub: `$${Math.round(quietestDaypart.total).toLocaleString()} avg/day`,
                    color: "text-neutral-400",
                    bg: "bg-neutral-500/10 border-neutral-500/20",
                  },
                ];

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="rounded-xl border border-neutral-700 bg-neutral-800/60 overflow-hidden"
                  >
                    <div className="px-5 py-3 border-b border-neutral-700">
                      <span className="text-white font-bold text-sm uppercase tracking-wider">Statistics</span>
                    </div>
                    <table className="w-full text-left border-collapse">
                      <tbody>
                        {stats.map((s, i) => (
                          <tr key={s.label} className={`border-b border-neutral-800/50 ${i === stats.length - 1 ? "border-b-0" : ""}`}>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter border ${s.bg} ${s.color}`}>{s.label}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              <span className={`text-xs font-bold ${s.color}`}>{s.value}</span>
                              <span className="text-neutral-500 text-[10px] ml-1.5">{s.sub}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </motion.div>
                );
              })()}
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="text-left border-collapse" style={{ minWidth: "max-content" }}>
              <thead>
                <tr className="bg-white/[0.04] border-b border-neutral-800">
                  <th className="p-3 text-neutral-400 text-xs font-semibold uppercase tracking-wider whitespace-nowrap sticky left-0 z-20 bg-neutral-900" rowSpan={2}>Day Part</th>
                  <th className="p-3 text-neutral-400 text-xs font-semibold uppercase tracking-wider whitespace-nowrap sticky left-[100px] z-20 bg-neutral-900" rowSpan={2}>Time Range</th>
                  {days.map((day) => (
                    <th key={day} colSpan={4} className="px-3 pt-3 pb-2 text-center border-l border-neutral-800">
                      <div className="text-white text-xs font-bold uppercase tracking-wider">{day}</div>
                      <button
                        onClick={() => setTargetModal({ day, value: String(weeklyTargets[day] ?? 0) })}
                        className="text-emerald-400 text-[11px] font-semibold mt-0.5 hover:text-emerald-300 hover:underline transition-colors cursor-pointer"
                      >
                        ${(weeklyTargets[day] ?? 0).toLocaleString()}
                      </button>
                    </th>
                  ))}
                </tr>
                <tr className="bg-white/[0.02] border-b border-neutral-800">
                  {days.map((day) => (
                    <React.Fragment key={day}>
                      <th className="px-3 py-2 text-neutral-500 text-[10px] font-semibold uppercase tracking-wider text-center border-l border-neutral-800 whitespace-nowrap">Sales</th>
                      <th className="px-3 py-2 text-neutral-500 text-[10px] font-semibold uppercase tracking-wider text-center whitespace-nowrap">Min</th>
                      <th className="px-3 py-2 text-neutral-500 text-[10px] font-semibold uppercase tracking-wider text-center whitespace-nowrap">Non-Smooth</th>
                      <th className="px-3 py-2 text-neutral-500 text-[10px] font-semibold uppercase tracking-wider text-center bg-white/5 whitespace-nowrap">Rcmd</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item: any, idx: number) => {
                  const isNewSection = idx === 0 || item.dayPart !== displayItems[idx - 1].dayPart;
                  return (
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.01 }}
                      key={item.id}
                      className={cn(
                        "group border-b border-neutral-800/50 hover:bg-white/[0.02] transition-colors",
                        isNewSection && "border-t-2 border-t-neutral-600"
                      )}
                    >
                      <td className="p-3 whitespace-nowrap sticky left-0 z-10 bg-neutral-950 group-hover:bg-neutral-900 transition-colors">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                          item.dayPart === "Breakfast" && "bg-orange-500/10 text-orange-400 border border-orange-500/20",
                          item.dayPart === "Lunch" && "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                          item.dayPart === "Afternoon" && "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
                          item.dayPart === "Dinner" && "bg-purple-500/10 text-purple-400 border border-purple-500/20",
                          item.dayPart === "Evening" && "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                        )}>
                          {item.dayPart}
                        </span>
                      </td>
                      <td className="p-3 text-neutral-300 font-mono text-xs whitespace-nowrap sticky left-[100px] z-10 bg-neutral-950 group-hover:bg-neutral-900 transition-colors">
                        {item.timeRange}
                      </td>
                      {days.map((day) => {
                        const d = item.days[day];
                        const cellKey = `${item.id}-${day}`;
                        const isEditing = editingCell === cellKey;
                        const isEditable = typeof d.sales === "number";
                        return (
                          <React.Fragment key={day}>
                            <td
                              className={cn(
                                "px-3 py-2 text-center text-xs border-l border-neutral-800 whitespace-nowrap",
                                isEditable && "cursor-pointer hover:bg-blue-500/10 hover:text-blue-300 transition-colors",
                                isEditing && "bg-blue-500/20 p-0"
                              )}
                              onClick={() => !isEditing && startEdit(item.id, day, d.sales)}
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  className="w-20 bg-transparent text-blue-300 text-xs text-center outline-none border-none px-2 py-3"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => commitEdit(item.id, day)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitEdit(item.id, day);
                                    if (e.key === "Escape") setEditingCell(null);
                                  }}
                                />
                              ) : (
                                <span className="text-neutral-300">{formatSales(d.sales)}</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center text-neutral-500 text-xs whitespace-nowrap">{d.minRcmd}</td>
                            <td className="px-3 py-3 text-center text-neutral-400 text-xs whitespace-nowrap">{d.nonSmooth}</td>
                            <td className="px-3 py-3 text-center text-white font-bold text-xs bg-white/5 group-hover:bg-white/10 transition-colors whitespace-nowrap">{d.rcmd}</td>
                          </React.Fragment>
                        );
                      })}
                    </motion.tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-600 bg-white/[0.04]">
                  <td className="p-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap sticky left-0 z-10 bg-neutral-900">Total</td>
                  <td className="p-3 sticky left-[100px] z-10 bg-neutral-900"></td>
                  {days.map((day) => {
                    const totalSalesDay = displayItems.reduce((sum: number, item: any) => {
                      const v = item.days[day].sales;
                      return sum + (typeof v === "number" ? v : 0);
                    }, 0);
                    const totalMin = displayItems.reduce((sum: number, item: any) => sum + (item.days[day].minRcmd || 0), 0);
                    const totalNonSmooth = displayItems.reduce((sum: number, item: any) => sum + (item.days[day].nonSmooth || 0), 0);
                    const totalRcmd = displayItems.reduce((sum: number, item: any) => sum + (item.days[day].rcmd || 0), 0);
                    return (
                      <React.Fragment key={day}>
                        <td className="px-3 py-3 text-center text-emerald-400 font-bold text-xs border-l border-neutral-800 whitespace-nowrap">
                          ${totalSalesDay.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-3 py-3 text-center text-neutral-300 font-bold text-xs whitespace-nowrap">{totalMin}</td>
                        <td className="px-3 py-3 text-center text-neutral-300 font-bold text-xs whitespace-nowrap">{totalNonSmooth}</td>
                        <td className="px-3 py-3 text-center text-white font-bold text-xs bg-white/5 whitespace-nowrap">{totalRcmd}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          )}
        </div>
      </div>

      {/* Weekly Target Modal */}
      {targetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setTargetModal(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold text-lg mb-1">Edit Weekly Target</h3>
            <p className="text-neutral-400 text-sm mb-5">
              Update predicted sales for <span className="text-white font-bold">{targetModal.day}</span>
            </p>
            <div className="relative mb-5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 font-semibold">$</span>
              <input
                autoFocus
                type="number"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-7 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                value={targetModal.value}
                onChange={(e) => setTargetModal({ ...targetModal, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const num = parseFloat(targetModal.value);
                    if (!isNaN(num)) applyWeeklyTarget(targetModal.day, num);
                    setTargetModal(null);
                  }
                  if (e.key === "Escape") setTargetModal(null);
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTargetModal(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-neutral-700 text-neutral-400 text-sm hover:text-white hover:border-neutral-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const num = parseFloat(targetModal.value);
                  if (!isNaN(num)) applyWeeklyTarget(targetModal.day, num);
                  setTargetModal(null);
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
              >
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}
