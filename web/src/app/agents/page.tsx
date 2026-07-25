"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ActivityLog, ClusterState } from "@/lib/types"
import { Play, Square, RotateCcw, Activity } from "lucide-react"

const AGENTS_META = [
  { id: "Clerk", desc: "Data intake + compliance generation" },
  { id: "Scout", desc: "Factory discovery & ingestion" },
  { id: "Profiler", desc: "Waste stream classification" },
  { id: "Matchmaker", desc: "Symbiosis matching algorithm" },
  { id: "Inventor", desc: "Product concept generation" },
  { id: "Auditor", desc: "Impact quantification & ranking" },
  { id: "Architect", desc: "Manufacturing pathway design" },
  { id: "Sentinel", desc: "Monitoring & self-healing" },
]

export default function AgentsPage() {
  const [data, setData] = useState<ClusterState | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchState = () => {
    fetch("/api/cluster")
      .then(res => res.json())
      .then(json => {
        setData(json)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 5000) // Poll for logs
    return () => clearInterval(interval)
  }, [])

  const handleSwarmAction = async (action: string) => {
    setActionLoading(action);
    try {
      await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      fetchState();
    } catch {
    } finally {
      setActionLoading(null);
    }
  };

  const getAgentLogs = (agentId: string) => {
    return data?.activityLogs.filter(log => log.agent === agentId) || []
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">AI Agents</h1>
          <p className="text-zinc-400 mt-1">Monitor and control the 8 autonomous swarm agents.</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            onClick={() => handleSwarmAction(data?.swarmActive ? 'stop' : 'start')}
            disabled={actionLoading !== null}
            className={data?.swarmActive ? "border-amber-500/50 text-amber-500 hover:bg-amber-500/10" : "border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10"}
          >
            {data?.swarmActive ? <Square className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {data?.swarmActive ? 'Stop Swarm' : 'Start Swarm'}
          </Button>
          <Button variant="outline" onClick={() => handleSwarmAction('reset')} disabled={actionLoading !== null} className="border-zinc-700 text-zinc-300">
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {AGENTS_META.map(meta => {
          const logs = getAgentLogs(meta.id)
          const lastLog = logs[logs.length - 1]
          const isActive = data?.swarmActive
          const statusColor = isActive ? "bg-emerald-500" : "bg-zinc-600"

          return (
            <Card key={meta.id} className="bg-zinc-950/50 border-zinc-800 flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-1">
                  <CardTitle className="text-lg text-zinc-200">{meta.id}</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      {isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400"></span>}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColor}`}></span>
                    </span>
                  </div>
                </div>
                <CardDescription className="text-xs text-zinc-500 h-8">{meta.desc}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col">
                <div className="mb-4 space-y-2">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Uptime:</span>
                    <span className="text-zinc-200 font-mono">{isActive ? '12h 45m' : '0h 0m'}</span>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Memory:</span>
                    <span className="text-zinc-200 font-mono">{isActive ? `${(Math.random() * 40 + 20).toFixed(1)}MB` : '0MB'}</span>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Executions:</span>
                    <span className="text-zinc-200 font-mono">{logs.length}</span>
                  </div>
                </div>
                
                <div className="mt-auto">
                  <p className="text-xs font-medium text-zinc-500 mb-2">Last Action</p>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded p-2 min-h-[60px] text-xs text-zinc-400 font-mono">
                    {lastLog ? lastLog.message : 'Waiting for triggers...'}
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-zinc-800/50 flex justify-end">
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-400 hover:text-zinc-100">
                    View Logs
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-400 hover:text-zinc-100">
                    Restart
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
