"use client";
import React, { useState } from "react";
import data from "@/lib/data.json";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Spotlight } from "@/components/ui/Spotlight";
import { DollarSign, Users, TrendingUp, Calendar } from "lucide-react";

export default function Home() {
  const [selectedDay, setSelectedDay] = useState("Mon");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  
  const currentSummary = data.summary[selectedDay as keyof typeof data.summary];

  const stats = [
    {
      title: "Total Predicted Sales",
      value: `$${currentSummary.totalSales.toLocaleString()}`,
      icon: <DollarSign className="w-6 h-6 text-emerald-500" />,
      description: "Estimated sales for the day"
    },
    {
      title: "Average Labor",
      value: currentSummary.avgRcmd,
      icon: <Users className="w-6 h-6 text-blue-500" />,
      description: "Average recommended staff"
    },
    {
      title: "Peak Labor",
      value: currentSummary.maxRcmd,
      icon: <TrendingUp className="w-6 h-6 text-purple-500" />,
      description: "Highest staffing requirement"
    },
    {
      title: "Reporting Intervals",
      value: currentSummary.count,
      icon: <Calendar className="w-6 h-6 text-orange-500" />,
      description: "1/2 hour slots analyzed"
    }
  ];

  return (
    <main className="min-h-screen bg-black/[0.96] antialiased bg-grid-white/[0.02] relative overflow-hidden pb-20">
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />
      
      <div className="p-4 max-w-7xl mx-auto relative z-10 w-full pt-10 md:pt-20">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
            Labor Optimization
          </h1>
          <p className="mt-4 font-normal text-base text-neutral-300 max-w-lg mx-auto">
            Interactive dashboard for analyzing predicted sales and labor recommendations.
          </p>
        </div>

        {/* Day Selector */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={cn(
                "px-4 py-2 rounded-lg border text-sm transition-all duration-300",
                selectedDay === day 
                  ? "bg-white text-black font-bold border-white scale-105 shadow-[0_0_20px_rgba(255,255,255,0.3)]" 
                  : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-white"
              )}
            >
              {day}
            </button>
          ))}
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
          <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Interval Details</h2>
            <span className="text-xs font-mono text-neutral-500">Day: {selectedDay}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="p-4 text-neutral-400 text-xs font-semibold uppercase tracking-wider">Day Part</th>
                  <th className="p-4 text-neutral-400 text-xs font-semibold uppercase tracking-wider">Time Range</th>
                  <th className="p-4 text-neutral-400 text-xs font-semibold uppercase tracking-wider text-center">Sales</th>
                  <th className="p-4 text-neutral-400 text-xs font-semibold uppercase tracking-wider text-center">Min Rcmd</th>
                  <th className="p-4 text-neutral-400 text-xs font-semibold uppercase tracking-wider text-center bg-white/5">Recommended</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: any, idx: number) => {
                  const dayData = item.days[selectedDay];
                  return (
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.01 }}
                      key={`${item.id}-${selectedDay}`}
                      className="group border-b border-neutral-800/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="p-4">
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
                      <td className="p-4 text-neutral-300 font-mono text-sm">
                        {item.timeRange}
                      </td>
                      <td className="p-4 text-center text-neutral-200 font-semibold">
                        {dayData.sales}
                      </td>
                      <td className="p-4 text-center text-neutral-500">
                        {dayData.minRcmd}
                      </td>
                      <td className="p-4 text-center text-white font-bold bg-white/5 group-hover:bg-white/10 transition-colors">
                        {dayData.rcmd}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
