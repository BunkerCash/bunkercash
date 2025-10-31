'use client'

import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const generateNAVData = () => {
  const data = []
  const startDate = new Date('2024-06-01')
  const endDate = new Date('2025-10-31')
  let nav = 0.98
  let deposits = 5000
  let withdrawals = 0
  let investments = 3000
  let flowbacks = 200

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]

    nav += (Math.random() - 0.45) * 0.002
    nav = Math.max(0.95, Math.min(1.05, nav))

    if (Math.random() > 0.9) {
      deposits += Math.random() * 500
      withdrawals += Math.random() * 200
    }

    if (Math.random() > 0.95) {
      investments += Math.random() * 300
      flowbacks += Math.random() * 150
    }

    data.push({
      date: dateStr,
      nav: parseFloat(nav.toFixed(4)),
      deposits: parseFloat(deposits.toFixed(2)),
      withdrawals: parseFloat(withdrawals.toFixed(2)),
      investments: parseFloat(investments.toFixed(2)),
      flowbacks: parseFloat(flowbacks.toFixed(2)),
    })
  }

  return data
}

const allData = generateNAVData()

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number | string
    color: string
  }>
  label?: string
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 shadow-xl">
        <p className="text-neutral-400 text-xs mb-2">
          {label && new Date(label).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
        <div className="space-y-1">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <span className="text-xs capitalize" style={{ color: entry.color }}>
                {entry.name === 'nav' ? 'NAV' : entry.name}:
              </span>
              <span className="text-xs font-semibold" style={{ color: entry.color }}>
                {typeof entry.value === 'number' ? entry.value.toFixed(4) : entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export function NAVPerformance() {
  const [timeRange, setTimeRange] = useState('90d')
  const [activeMetrics, setActiveMetrics] = useState({
    nav: true,
    deposits: true,
    withdrawals: true,
    investments: true,
    flowbacks: true,
  })

  const filteredData = allData.filter((item) => {
    const date = new Date(item.date)
    const referenceDate = new Date('2025-10-31')
    let daysToSubtract = 90
    if (timeRange === '30d') {
      daysToSubtract = 30
    } else if (timeRange === '7d') {
      daysToSubtract = 7
    } else if (timeRange === 'all') {
      daysToSubtract = 999
    }
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  const toggleMetric = (metric: keyof typeof activeMetrics) => {
    setActiveMetrics((prev) => ({ ...prev, [metric]: !prev[metric] }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">NAV Performance</h3>
        <div className="flex gap-2">
          {(['7d', '30d', '90d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                timeRange === range
                  ? 'bg-[#00FFB2] text-black font-semibold'
                  : 'bg-neutral-900 text-neutral-500 hover:text-white'
              }`}
            >
              {range === 'all' ? 'All Time' : range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(activeMetrics).map(([key, active]) => (
          <button
            key={key}
            onClick={() => toggleMetric(key as keyof typeof activeMetrics)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-all capitalize ${
              active
                ? 'bg-[#00FFB2]/20 text-[#00FFB2] border border-[#00FFB2]'
                : 'bg-neutral-900 text-neutral-500 hover:text-white border border-neutral-800'
            }`}
          >
            {key === 'nav' ? 'NAV' : key}
          </button>
        ))}
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 overflow-hidden">
        <div className="w-full h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={filteredData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
            <defs>
              <linearGradient id="colorNAV" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00FFB2" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#00FFB2" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorDeposits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorWithdrawals" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorInvestments" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorFlowbacks" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis
              dataKey="date"
              stroke="#737373"
              tick={{ fill: '#737373', fontSize: 11 }}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              }}
            />
            <YAxis stroke="#737373" tick={{ fill: '#737373', fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            {activeMetrics.nav && (
              <Area
                type="monotone"
                dataKey="nav"
                stroke="#00FFB2"
                strokeWidth={3}
                fill="url(#colorNAV)"
              />
            )}
            {activeMetrics.deposits && (
              <Area
                type="monotone"
                dataKey="deposits"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorDeposits)"
              />
            )}
            {activeMetrics.withdrawals && (
              <Area
                type="monotone"
                dataKey="withdrawals"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#colorWithdrawals)"
              />
            )}
            {activeMetrics.investments && (
              <Area
                type="monotone"
                dataKey="investments"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#colorInvestments)"
              />
            )}
            {activeMetrics.flowbacks && (
              <Area
                type="monotone"
                dataKey="flowbacks"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#colorFlowbacks)"
              />
            )}
          </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
