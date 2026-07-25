"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Activity, Server, Cpu, HardDrive, Network, AlertCircle, Clock } from "lucide-react"
import { useEffect, useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const generateMockData = () => {
  return Array.from({ length: 20 }).map((_, i) => ({
    time: "-" + (20 - i) + "m",
    cpu: Math.random() * 30 + 20,
    latency: Math.random() * 50 + 80,
  }))
}

export default function MonitoringPage() {
  const [data, setData] = useState(generateMockData())

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => {
        const next = [...prev.slice(1)]
        next.push({
          time: 'now',
          cpu: Math.random() * 30 + 20,
          latency: Math.random() * 50 + 80,
        })
        return next
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">System Monitoring</h1>
        <p className="text-zinc-400 mt-1">Real-time telemetry and health of the SymBioForge MCP server.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-950/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center"><Cpu className="w-4 h-4 mr-2" /> CPU Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">28.4%</div>
            <Progress value={28.4} className="h-2 mt-3 bg-zinc-800" />
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center"><HardDrive className="w-4 h-4 mr-2" /> Memory (RAM)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">4.2 GB <span className="text-sm text-zinc-500 font-normal">/ 16 GB</span></div>
            <Progress value={(4.2/16)*100} className="h-2 mt-3 bg-zinc-800" />
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center"><Activity className="w-4 h-4 mr-2" /> API Latency (p95)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">112ms</div>
            <p className="text-xs text-zinc-500 mt-1">-14ms from last hour</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center"><AlertCircle className="w-4 h-4 mr-2" /> Error Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">0.02%</div>
            <p className="text-xs text-zinc-500 mt-1">2 errors in last 10k requests</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-zinc-950/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base text-zinc-200">CPU Usage History</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base text-zinc-200">API Latency History (ms)</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} domain={[0, 200]} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-zinc-950/50 border-zinc-800 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base text-zinc-200">System Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "Agent Swarm Coordinator", status: "Healthy", uptime: "12d 4h", icon: Bot },
                { name: "Event Bus (Redis)", status: "Healthy", uptime: "45d 1h", icon: Network },
                { name: "PostgreSQL Database", status: "Healthy", uptime: "45d 1h", icon: Server },
                { name: "Next.js Web Server", status: "Healthy", uptime: "2d 6h", icon: Activity },
              ].map((service, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <service.icon className="w-5 h-5 text-zinc-500" />
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{service.name}</p>
                      <p className="text-xs text-zinc-500">Uptime: {service.uptime}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-sm text-emerald-400">{service.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-950/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base text-zinc-200">Queue Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-400">Matchmaking Queue</span>
                  <span className="text-zinc-200 font-mono">0 / 500</span>
                </div>
                <Progress value={0} className="h-1 bg-zinc-800" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-400">Product Invention Queue</span>
                  <span className="text-zinc-200 font-mono">12 / 500</span>
                </div>
                <Progress value={(12/500)*100} className="h-1 bg-zinc-800 [&>div]:bg-amber-500" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-400">Impact Calc Tasks</span>
                  <span className="text-zinc-200 font-mono">0 / 1000</span>
                </div>
                <Progress value={0} className="h-1 bg-zinc-800" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Bot(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  )
}
